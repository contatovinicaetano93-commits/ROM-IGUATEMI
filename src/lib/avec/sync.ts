import { getSql } from '@/lib/db'
import { SYNC_LOCK_KEYS, withSyncLock } from '@/lib/sync-lock'
import {
  upsertContact,
  updateContact,
  logEvent,
  setPreferredManicurist,
  setPreferredHairstylist,
} from '@/lib/contacts'
import {
  listServices,
  addService,
  scheduleService,
  markServiceDone,
  patchServiceVisitMeta,
} from '@/lib/services'
import {
  fetchAllAvecReport,
  formatTruncationWarning,
  isAvecConfigured,
  isAvecMock,
  periodRange,
} from '@/lib/avec/client'
import {
  formatAvecErrorList,
  formatAvecUserMessage,
  isAvecTokenExpiredError,
} from '@/lib/avec/messages'
import {
  normalizeClientRow,
  normalizeAppointmentRow,
  normalizeAttendanceRow,
  normalizeRevenueRow,
  normalizeCancellationRow,
  parseAvecDateTime,
  parseServiceTempoMinutes,
  guessServiceCategory,
  isNailService,
  isHairService,
} from '@/lib/avec/normalize'
import { getDailyReports, resolveReportId } from '@/lib/avec/registry'
import { saveReportSnapshot } from '@/lib/avec/snapshots'
import { getDeploymentContext } from '@/lib/deployment'
import { recomputeSalonMetricsFromRom, upsertSalonMetrics } from '@/lib/salon/metrics'
import { todayIso, toSalonDateIso } from '@/lib/salon/format'
import { syncP1Kpis } from '@/lib/avec/sync-p1'
import { syncP2Kpis, syncPaymentMixRecent } from '@/lib/avec/sync-p2'
import { syncP3Kpis } from '@/lib/avec/sync-p3'
import { maybeNotifySyncFailure } from '@/lib/avec/notify-sync-failure'
import type { RomPanelId } from '@/lib/brand'
import { avecSiteParam, getAvecUnitId } from '@/lib/brand'

export type AvecSyncMode = 'fast' | 'full'

export interface AvecSyncStats {
  panel: RomPanelId
  deployment_host: string | null
  clients_upserted: number
  appointments_synced: number
  attendances_synced: number
  services_created: number
  services_scheduled: number
  services_completed: number
  revenue_rows: number
  cancellation_rows: number
  snapshots_saved: number
  errors: string[]
  warnings: string[]
  p1_rows?: number
  p2_rows?: number
  p3_rows?: number
}

export interface AvecSyncRun {
  id: string
  kind: string
  status: 'ok' | 'error' | 'partial'
  stats: AvecSyncStats
  error: string | null
  created_at: string
}

async function recordSyncRun(kind: string, status: AvecSyncRun['status'], stats: AvecSyncStats, error?: string) {
  const sql = getSql()
  const rows = (await sql`
    insert into avec_sync_runs (kind, status, stats, error)
    values (${kind}, ${status}, ${JSON.stringify(stats)}::jsonb, ${error ?? null})
    returning *
  `) as AvecSyncRun[]
  return rows[0]
}

/** Abre run no início — snapshots recebem sync_run_id correto. */
async function beginAvecSyncRun(kind: string, stats: AvecSyncStats): Promise<AvecSyncRun> {
  const sql = getSql()
  const rows = (await sql`
    insert into avec_sync_runs (kind, status, stats)
    values (${kind}, 'partial', ${JSON.stringify(stats)}::jsonb)
    returning *
  `) as AvecSyncRun[]
  return rows[0]!
}

async function finishAvecSyncRun(
  id: string,
  status: AvecSyncRun['status'],
  stats: AvecSyncStats,
  error?: string,
): Promise<AvecSyncRun> {
  const sql = getSql()
  const rows = (await sql`
    update avec_sync_runs
    set status = ${status}, stats = ${JSON.stringify(stats)}::jsonb, error = ${error ?? null}
    where id = ${id}::uuid
    returning *
  `) as AvecSyncRun[]
  return rows[0]!
}

export async function getLastAvecSync(kind?: string): Promise<AvecSyncRun | null> {
  const sql = getSql()
  if (kind) {
    const rows = (await sql`
      select * from avec_sync_runs where kind = ${kind} order by created_at desc limit 1
    `) as AvecSyncRun[]
    return rows[0] ?? null
  }
  const rows = (await sql`
    select * from avec_sync_runs order by created_at desc limit 1
  `) as AvecSyncRun[]
  return rows[0] ?? null
}

async function findOrCreateService(contactId: string, serviceName: string) {
  const services = await listServices(contactId)
  const match = services.find((s) => s.name.toLowerCase() === serviceName.toLowerCase())
  if (match) return match

  const created = await addService(contactId, {
    name: serviceName,
    category: guessServiceCategory(serviceName),
  })
  return created
}

async function snapshotReport(
  reportId: string,
  params: Record<string, unknown>,
  rows: Record<string, unknown>[],
  stats: AvecSyncStats,
  syncRunId?: string
) {
  try {
    await saveReportSnapshot(reportId, params, rows, syncRunId)
    stats.snapshots_saved++
  } catch (e) {
    stats.warnings.push(`snapshot ${reportId}: ${e instanceof Error ? e.message : String(e)}`)
  }
}

function warnIfTruncated(stats: AvecSyncStats, reportId: string, result: Awaited<ReturnType<typeof fetchAllAvecReport>>) {
  if (result.truncated) stats.warnings.push(formatTruncationWarning(reportId, result))
}

async function syncClients(stats: AvecSyncStats, syncRunId?: string) {
  try {
    const params = { limit: 250, site: avecSiteParam() }
    const result = await fetchAllAvecReport('0004', params)
    warnIfTruncated(stats, '0004', result)
    await snapshotReport('0004', params, result.rows, stats, syncRunId)

    for (const row of result.rows) {
      try {
        const c = normalizeClientRow(row)
        if (!c) continue
        await upsertContact({
          avecClientId: c.avecClientId,
          name: c.name,
          email: c.email,
          phone: c.phone,
          channel: 'avec',
          source: 'avec_sync_clients',
          // Base massiva Avec ≠ lead novo do funil (WhatsApp/manual).
          status: 'importado',
        })
        stats.clients_upserted++
      } catch (e) {
        stats.errors.push(`cliente: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
  } catch (e) {
    // Não derruba o full sync — P1/0021 (top profissionais) ainda precisa rodar.
    stats.errors.push(`clientes 0004: ${e instanceof Error ? e.message : String(e)}`)
  }
}

async function syncAppointments(stats: AvecSyncStats, mode: AvecSyncMode, syncRunId?: string) {
  const range = mode === 'fast' ? periodRange(0, 0) : periodRange(1, 21)
  // 0051: site = origem Online/Local ("" = todos). Unidade vem do token (salon_id).
  const params = { ...range, site: '', profissional_id: '', limit: 250 }
  const result = await fetchAllAvecReport('0051', params)
  warnIfTruncated(stats, '0051', result)
  await snapshotReport('0051', params, result.rows, stats, syncRunId)

  const today = todayIso()
  const noShowsByDay = new Map<string, number>()

  for (const row of result.rows) {
    try {
      const appt = normalizeAppointmentRow(row)
      if (!appt) continue

      if (mode === 'fast' && appt.scheduledAt) {
        const day = toSalonDateIso(appt.scheduledAt)
        if (day !== today) continue
      }

      // No-show via status da agenda 0051 (fonte canônica: 0248 status=0.6).
      const status = (appt.status ?? '').toLowerCase()
      if (/falta|faltou|no[\s-]?show|noshow|ausente|n[aã]o compareceu/.test(status) && appt.scheduledAt) {
        const day = toSalonDateIso(appt.scheduledAt)
        if (day) noShowsByDay.set(day, (noShowsByDay.get(day) ?? 0) + 1)
      }

      const contact = await upsertContact({
        avecClientId: appt.avecClientId ?? undefined,
        name: appt.clientName,
        email: appt.email,
        phone: appt.phone,
        channel: 'avec',
        source: mode === 'fast' ? 'avec_sync_appointments_fast' : 'avec_sync_appointments',
        status: 'agendado',
      })

      if (appt.serviceName && appt.scheduledAt) {
        const existing = await listServices(contact.id)
        const had = existing.some((s) => s.name.toLowerCase() === appt.serviceName!.toLowerCase())
        const service = await findOrCreateService(contact.id, appt.serviceName)
        if (!had) stats.services_created++
        if (!service.scheduled_at || service.scheduled_at !== appt.scheduledAt) {
          await scheduleService(service.id, appt.scheduledAt, appt.professional)
          stats.services_scheduled++
        } else if (appt.professional && !service.professional_name) {
          await patchServiceVisitMeta(service.id, {
            professionalName: appt.professional,
          })
        }
        if (appt.professional && isNailService(appt.serviceName)) {
          await setPreferredManicurist(contact.id, appt.professional)
        } else if (appt.professional && isHairService(appt.serviceName)) {
          await setPreferredHairstylist(contact.id, appt.professional)
        }
      }

      stats.appointments_synced++
    } catch (e) {
      stats.errors.push(`agendamento: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  for (const [day, no_shows] of noShowsByDay) {
    try {
      await upsertSalonMetrics(day, { no_shows })
    } catch (e) {
      stats.errors.push(`no-show ${day}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
}

function servicesCreatedRecently(service: { created_at: string }) {
  return Date.now() - new Date(service.created_at).getTime() < 5000
}

async function syncAttendances(stats: AvecSyncStats, mode: AvecSyncMode, syncRunId?: string) {
  const range = mode === 'fast' ? periodRange(0, 0) : periodRange(7, 0)
  const params = { ...range, site: avecSiteParam(), como_conheceu: '', limit: 250 }
  const result = await fetchAllAvecReport('0002', params)
  warnIfTruncated(stats, '0002', result)
  await snapshotReport('0002', params, result.rows, stats, syncRunId)

  const today = todayIso()
  let durationSumMinutes = 0
  let durationCount = 0

  for (const row of result.rows) {
    try {
      const att = normalizeAttendanceRow(row)
      if (!att) continue

      if (mode === 'fast' && att.attendedAt) {
        if (toSalonDateIso(att.attendedAt) !== today) continue
      }

      // TM (Sprint 1) — só soma se a Avec mandou início+fim reais e o atendimento foi hoje.
      if (att.durationMinutes != null && att.attendedAt && toSalonDateIso(att.attendedAt) === today) {
        durationSumMinutes += att.durationMinutes
        durationCount++
      }

      const contact = await upsertContact({
        avecClientId: att.avecClientId ?? undefined,
        name: att.clientName,
        phone: att.phone,
        channel: 'avec',
        source: mode === 'fast' ? 'avec_sync_attended_fast' : 'avec_sync_attended',
      })

      await updateContact(contact.id, { status: 'convertido' })

      if (att.serviceName) {
        const service = await findOrCreateService(contact.id, att.serviceName)
        const isNew = servicesCreatedRecently(service)
        if (isNew) stats.services_created++
        await markServiceDone(service.id, {
          doneAt: att.attendedAt,
          professionalName: att.professional,
          lastPrice: att.price,
        })
        if (att.professional && isNailService(att.serviceName)) {
          await setPreferredManicurist(contact.id, att.professional)
        } else if (att.professional && isHairService(att.serviceName)) {
          await setPreferredHairstylist(contact.id, att.professional)
        }
        stats.services_completed++
      }

      stats.attendances_synced++
    } catch (e) {
      stats.errors.push(`atendimento: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  if (durationCount > 0) {
    await upsertSalonMetrics(today, {
      service_duration_sum_minutes: durationSumMinutes,
      service_duration_count: durationCount,
    })
  }
}

function addCalendarDaysYmd(isoYmd: string, delta: number) {
  const [y, m, d] = isoYmd.split('-').map(Number)
  const dt = new Date(Date.UTC(y!, m! - 1, d! + delta))
  return dt.toISOString().slice(0, 10)
}

function isoToBr(isoYmd: string) {
  const [y, m, d] = isoYmd.split('-')
  return `${d}/${m}/${y}`
}

function listDaysInclusive(fromIso: string, toIso: string): string[] {
  const out: string[] = []
  let cur = fromIso
  while (cur <= toIso) {
    out.push(cur)
    cur = addCalendarDaysYmd(cur, 1)
  }
  return out
}

/**
 * Faturamento dia a dia.
 * Fast: hoje + ontem (corrige atraso do relatório).
 * Full: últimos 7 dias + hoje (mesmo padrão do 0081).
 */
async function syncRevenue(
  stats: AvecSyncStats,
  mode: AvecSyncMode,
  syncRunId?: string,
) {
  const def = getDailyReports().find((r) => r.mapper === 'revenue')
  if (!def) return

  let reportId = resolveReportId(def)
  if (!reportId && isAvecMock()) reportId = 'revenue'
  if (!reportId) {
    stats.warnings.push('AVEC_REPORT_REVENUE não configurado — faturamento pulado')
    return
  }

  const today = todayIso()
  const daysBack = mode === 'fast' ? 1 : 7
  const from = addCalendarDaysYmd(today, -daysBack)
  const days = listDaysInclusive(from, today)

  for (const day of days) {
    const params = {
      inicio: isoToBr(day),
      fim: isoToBr(day),
      site: avecSiteParam(),
      limit: 250,
    }
    try {
      const result = await fetchAllAvecReport(reportId, params)
      warnIfTruncated(stats, reportId, result)
      await snapshotReport(reportId, params, result.rows, stats, syncRunId)

      let revenue = 0
      let attended = 0
      for (const row of result.rows) {
        const rev = normalizeRevenueRow(row)
        if (!rev) continue
        stats.revenue_rows++
        // Sem data no período de 1 dia → conta no dia pedido
        if (!rev.day || rev.day === day) {
          revenue += rev.revenue
          attended += rev.attended
        }
      }

      if (revenue > 0 || attended > 0) {
        const attendedInt = Math.round(attended)
        await upsertSalonMetrics(day, {
          revenue: Math.round(revenue * 100) / 100,
          attended: attendedInt || undefined,
          ticket_avg: attendedInt > 0 ? Math.round((revenue / attendedInt) * 100) / 100 : null,
        })
      }
    } catch (e) {
      stats.errors.push(`receita ${day}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
}

/**
 * Cancelamentos / no-shows dia a dia (mesmo backfill do faturamento).
 */
async function syncCancellations(
  stats: AvecSyncStats,
  mode: AvecSyncMode,
  syncRunId?: string,
) {
  const def = getDailyReports().find((r) => r.mapper === 'cancellations')
  if (!def) return

  let reportId = resolveReportId(def)
  if (!reportId && isAvecMock()) reportId = 'cancellations'
  if (!reportId) {
    stats.warnings.push('AVEC_REPORT_CANCELLATIONS não configurado — cancelamentos pulados')
    return
  }

  const today = todayIso()
  const daysBack = mode === 'fast' ? 1 : 7
  const from = addCalendarDaysYmd(today, -daysBack)
  const days = listDaysInclusive(from, today)

  for (const day of days) {
    const params = {
      inicio: isoToBr(day),
      fim: isoToBr(day),
      site: avecSiteParam(),
      limit: 250,
    }
    try {
      const result = await fetchAllAvecReport(reportId, params)
      warnIfTruncated(stats, reportId, result)
      await snapshotReport(reportId, params, result.rows, stats, syncRunId)

      let cancelled = 0
      let no_shows = 0
      for (const row of result.rows) {
        const c = normalizeCancellationRow(row)
        if (!c) continue
        stats.cancellation_rows++
        if (!c.day || c.day === day) {
          cancelled += c.cancelled
          no_shows += c.noShow
        }
      }

      // Só grava no_shows se o 0052 trouxe Falta — senão o 0248 é a fonte.
      if (cancelled > 0 || no_shows > 0) {
        await upsertSalonMetrics(day, {
          cancelled: cancelled > 0 ? cancelled : undefined,
          no_shows: no_shows > 0 ? no_shows : undefined,
        })
      }
    } catch (e) {
      stats.errors.push(`cancelamentos ${day}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
}

/**
 * No-shows oficiais — relatório 0248 com status=0.6 ("Faltou").
 * A agenda 0051 do dia costuma não listar Falta (só Cancelado/Pago/…); 0248 sim.
 */
async function syncNoShows0248(
  stats: AvecSyncStats,
  mode: AvecSyncMode,
  syncRunId?: string,
) {
  const today = todayIso()
  const daysBack = mode === 'fast' ? 1 : 7
  const from = addCalendarDaysYmd(today, -daysBack)
  const params = {
    inicio: isoToBr(from),
    fim: isoToBr(today),
    status: '0.6',
    limit: 250,
  }
  try {
    const result = await fetchAllAvecReport('0248', params)
    warnIfTruncated(stats, '0248', result)
    await snapshotReport('0248', params, result.rows, stats, syncRunId)

    const byDay = new Map<string, number>()
    for (const row of result.rows) {
      const appt = normalizeAppointmentRow(row)
      const day =
        (appt?.scheduledAt ? toSalonDateIso(appt.scheduledAt) : null) ??
        (typeof row.data === 'string' ? String(row.data).slice(0, 10) : null)
      if (!day) continue
      // Endpoint já filtrado por status=0.6 (Faltou).
      byDay.set(day, (byDay.get(day) ?? 0) + 1)
    }

    for (const [day, no_shows] of byDay) {
      await upsertSalonMetrics(day, { no_shows })
    }

    // Dias sem falta no intervalo: zera só o dia de hoje (evita manter stale do fast).
    if (!byDay.has(today)) {
      await upsertSalonMetrics(today, { no_shows: 0 })
    }
  } catch (e) {
    stats.errors.push(`no-show 0248: ${e instanceof Error ? e.message : String(e)}`)
  }
}

/**
 * Recorrentes do dia — 0002 no mês corrente:
 * ultima_visita = dia E total_visitas > 1 (no período).
 * Range de 1 dia zera total_visitas em 1 para todos; por isso usamos início do mês.
 */
async function syncReturningFrom0002(
  stats: AvecSyncStats,
  mode: AvecSyncMode,
  syncRunId?: string,
) {
  const today = todayIso()
  const monthStart = `${today.slice(0, 7)}-01`
  const from = mode === 'fast' ? monthStart : addCalendarDaysYmd(today, -90)
  const params = {
    inicio: isoToBr(from),
    fim: isoToBr(today),
    como_conheceu: '',
    limit: 250,
  }
  try {
    const result = await fetchAllAvecReport('0002', params)
    warnIfTruncated(stats, '0002', result)
    await snapshotReport('0002-returning', params, result.rows, stats, syncRunId)

    const returningByDay = new Map<string, number>()
    for (const row of result.rows) {
      const att = normalizeAttendanceRow(row)
      if (!att) continue
      const day = att.lastVisitDay
      if (!day) continue
      if ((att.totalVisits ?? 0) > 1) {
        returningByDay.set(day, (returningByDay.get(day) ?? 0) + 1)
      }

      // Backfill last_done_at só p/ quem veio hoje (evita reescrever milhares no cron).
      if (att.lastVisitDay === today) {
        try {
          const contact = await upsertContact({
            avecClientId: att.avecClientId ?? undefined,
            name: att.clientName,
            phone: att.phone,
            channel: 'avec',
            source: 'avec_sync_returning_0002',
          })
          const serviceName = att.serviceName || 'Atendimento'
          const service = await findOrCreateService(contact.id, serviceName)
          const doneAt = parseAvecDateTime(att.lastVisitDay, '12:00')
          if (doneAt) {
            await markServiceDone(service.id, {
              doneAt,
              professionalName: att.professional,
              lastPrice: att.price,
            })
          }
        } catch (e) {
          stats.errors.push(`retorno contact: ${e instanceof Error ? e.message : String(e)}`)
        }
      }
    }

    const days = mode === 'fast' ? [today] : listDaysInclusive(addCalendarDaysYmd(today, -7), today)
    for (const day of days) {
      await upsertSalonMetrics(day, { returning_clients: returningByDay.get(day) ?? 0 })
    }
  } catch (e) {
    stats.errors.push(`recorrentes 0002: ${e instanceof Error ? e.message : String(e)}`)
  }
}

/**
 * TM atendimento — 0223 (`tempo`) quando a unidade preenche duração.
 * Se todos vierem null, não grava (UI continua "—").
 */
async function syncDurationFrom0223(stats: AvecSyncStats, syncRunId?: string) {
  const today = todayIso()
  const params = { profissional_id: '', limit: 250 }
  try {
    const result = await fetchAllAvecReport('0223', params)
    warnIfTruncated(stats, '0223', result)
    await snapshotReport('0223', params, result.rows, stats, syncRunId)

    let sum = 0
    let count = 0
    for (const row of result.rows) {
      const minutes = parseServiceTempoMinutes(
        (row as Record<string, unknown>).tempo ??
          (row as Record<string, unknown>).duracao ??
          (row as Record<string, unknown>)['duração'],
      )
      if (minutes == null) continue
      sum += minutes
      count++
    }
    if (count > 0) {
      await upsertSalonMetrics(today, {
        service_duration_sum_minutes: sum,
        service_duration_count: count,
      })
    }
  } catch (e) {
    stats.errors.push(`TM 0223: ${e instanceof Error ? e.message : String(e)}`)
  }
}

export async function runAvecSync(mode: AvecSyncMode = 'full'): Promise<AvecSyncRun> {
  // Fast e full compartilham o mesmo lease — evita overlap no Neon entre cron/webhook.
  return withSyncLock(SYNC_LOCK_KEYS.avec, () => runAvecSyncUnlocked(mode), {
    ttlMs: 6 * 60 * 1000,
    owner: `avec-${mode}`,
  })
}

async function runAvecSyncUnlocked(mode: AvecSyncMode): Promise<AvecSyncRun> {
  if (!isAvecConfigured()) {
    throw new Error('Avec não configurado — defina AVEC_API_TOKEN')
  }

  const deployment = getDeploymentContext()

  const stats: AvecSyncStats = {
    panel: deployment.panel,
    deployment_host: deployment.host,
    clients_upserted: 0,
    appointments_synced: 0,
    attendances_synced: 0,
    services_created: 0,
    services_scheduled: 0,
    services_completed: 0,
    revenue_rows: 0,
    cancellation_rows: 0,
    snapshots_saved: 0,
    errors: [],
    warnings: [],
  }

  if (!getAvecUnitId()) {
    stats.warnings.push(
      'AVEC_UNIT_ID vazio — sync sem filtro de site (risco de misturar unidades se o token for compartilhado)',
    )
  }

  const run = await beginAvecSyncRun(mode, stats)
  const syncRunId = run.id

  try {
    // Fast: agenda/caixa do dia. Full: + catálogo + P1/P2/P3.
    if (mode === 'full') {
      await syncClients(stats, syncRunId)
    }
    if (mode === 'fast') {
      // KPI do dia primeiro e em paralelo (0088 + 0052); agenda/atendidos em seguida.
      await Promise.all([
        syncRevenue(stats, mode, syncRunId),
        syncCancellations(stats, mode, syncRunId),
        syncNoShows0248(stats, mode, syncRunId),
      ])
      await Promise.all([
        syncAppointments(stats, mode, syncRunId),
        syncAttendances(stats, mode, syncRunId),
      ])
      try {
        await syncDurationFrom0223(stats, syncRunId)
      } catch (e) {
        stats.errors.push(`TM 0223 fast: ${e instanceof Error ? e.message : String(e)}`)
      }
      try {
        await syncPaymentMixRecent(stats, syncRunId, 0)
      } catch (e) {
        stats.errors.push(`P2 0081 fast: ${e instanceof Error ? e.message : String(e)}`)
      }
    } else {
      // Full: cada etapa isolada — 403/WAF num relatório não pode impedir P1/P2/P3.
      for (const [label, fn] of [
        ['appointments', () => syncAppointments(stats, mode, syncRunId)],
        ['attendances', () => syncAttendances(stats, mode, syncRunId)],
        ['revenue', () => syncRevenue(stats, mode, syncRunId)],
        ['cancellations', () => syncCancellations(stats, mode, syncRunId)],
        ['no-shows-0248', () => syncNoShows0248(stats, mode, syncRunId)],
        ['tm-0223', () => syncDurationFrom0223(stats, syncRunId)],
        ['P1', () => syncP1Kpis(stats, syncRunId)],
        ['P2', () => syncP2Kpis(stats, syncRunId)],
        ['P3', () => syncP3Kpis(stats, syncRunId)],
      ] as const) {
        try {
          await fn()
        } catch (e) {
          stats.errors.push(`${label}: ${e instanceof Error ? e.message : String(e)}`)
        }
      }
    }
    await recomputeSalonMetricsFromRom()
    // Depois do recompute ROM — fonte Avec 0002 (MTD) para recorrentes do dia.
    try {
      await syncReturningFrom0002(stats, mode, syncRunId)
    } catch (e) {
      stats.errors.push(`recorrentes 0002: ${e instanceof Error ? e.message : String(e)}`)
    }

    stats.errors = formatAvecErrorList(stats.errors)

    const status: AvecSyncRun['status'] =
      stats.errors.length > 0 && stats.clients_upserted + stats.appointments_synced === 0
        ? 'error'
        : stats.errors.length > 0 || stats.warnings.length > 0
          ? 'partial'
          : 'ok'

    // Superfície clara quando o token morreu (Admin/Hoje leem `error`, não só stats JSON).
    const authErr = stats.errors.find((e) => isAvecTokenExpiredError(e))
    const topError =
      status === 'error'
        ? (authErr ?? formatAvecUserMessage(stats.errors[0]) ?? stats.errors[0] ?? undefined)
        : authErr

    const finished = await finishAvecSyncRun(run.id, status, stats, topError)

    await logEvent({
      contactId: null,
      channel: 'avec',
      direction: 'in',
      handledBy: 'system',
      payload: { avec_sync: stats, status, mode },
    })

    await maybeNotifySyncFailure({
      runId: finished.id,
      status,
      mode,
      error: topError ?? finished.error,
    })

    return finished
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e)
    const msg = formatAvecUserMessage(raw) ?? raw
    stats.errors.push(msg)
    const finished = await finishAvecSyncRun(run.id, 'error', stats, msg)
    await maybeNotifySyncFailure({
      runId: finished.id,
      status: 'error',
      mode,
      error: msg,
    })
    return finished
  }
}
