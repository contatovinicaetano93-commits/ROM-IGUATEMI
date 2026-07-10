import { getSql } from '@/lib/db'
import { upsertContact, updateContact, logEvent } from '@/lib/contacts'
import { listServices, addService, scheduleService, markServiceDone } from '@/lib/services'
import {
  assertAvecMockAllowed,
  fetchAllAvecReport,
  formatTruncationWarning,
  isAvecConfigured,
  isAvecMock,
  periodRange,
} from '@/lib/avec/client'
import {
  normalizeClientRow,
  normalizeAppointmentRow,
  normalizeAttendanceRow,
  normalizeRevenueRow,
  normalizeCancellationRow,
  guessServiceCategory,
} from '@/lib/avec/normalize'
import { resolveReportId, getDailyReports } from '@/lib/avec/registry'
import { saveReportSnapshot } from '@/lib/avec/snapshots'
import { recomputeSalonMetricsFromRom, upsertSalonMetrics } from '@/lib/salon/metrics'
import { todayIso } from '@/lib/salon/format'
import { avecSiteParam, getSalonUnit, unitContextLine } from '@/lib/salon/unit'
import { syncP1Kpis } from '@/lib/avec/sync-p1'
import { syncP2Kpis } from '@/lib/avec/sync-p2'
import { syncP3Kpis } from '@/lib/avec/sync-p3'

export type AvecSyncMode = 'fast' | 'full'

export interface AvecSyncStats {
  mode: AvecSyncMode
  unit: string
  clients_upserted: number
  appointments_synced: number
  attendances_synced: number
  services_created: number
  services_scheduled: number
  services_completed: number
  revenue_rows: number
  cancellation_rows: number
  snapshots_saved: number
  p1_rows: number
  errors: string[]
  warnings: string[]
}

export interface AvecSyncRun {
  id: string
  kind: string
  status: 'ok' | 'error' | 'partial'
  stats: AvecSyncStats
  error: string | null
  created_at: string
}

function emptyStats(mode: AvecSyncMode): AvecSyncStats {
  return {
    mode,
    unit: getSalonUnit().name,
    clients_upserted: 0,
    appointments_synced: 0,
    attendances_synced: 0,
    services_created: 0,
    services_scheduled: 0,
    services_completed: 0,
    revenue_rows: 0,
    cancellation_rows: 0,
    snapshots_saved: 0,
    p1_rows: 0,
    errors: [],
    warnings: [],
  }
}

async function recordSyncRun(
  kind: string,
  status: AvecSyncRun['status'],
  stats: AvecSyncStats,
  error?: string
) {
  const sql = getSql()
  const rows = (await sql`
    insert into avec_sync_runs (kind, status, stats, error)
    values (${kind}, ${status}, ${JSON.stringify(stats)}::jsonb, ${error ?? null})
    returning *
  `) as AvecSyncRun[]
  return rows[0]
}

export async function getLastAvecSync(kind?: string): Promise<AvecSyncRun | null> {
  const sql = getSql()
  const rows = kind
    ? ((await sql`
        select * from avec_sync_runs where kind = ${kind} order by created_at desc limit 1
      `) as AvecSyncRun[])
    : ((await sql`
        select * from avec_sync_runs order by created_at desc limit 1
      `) as AvecSyncRun[])
  return rows[0] ?? null
}

async function findOrCreateService(contactId: string, serviceName: string) {
  const services = await listServices(contactId)
  const match = services.find((s) => s.name.toLowerCase() === serviceName.toLowerCase())
  if (match) return match

  return addService(contactId, {
    name: serviceName,
    category: guessServiceCategory(serviceName),
  })
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
    // Snapshot é auditoria — não deve derrubar o sync de clientes/agenda/receita.
    stats.warnings.push(
      `snapshot ${reportId}: ${e instanceof Error ? e.message : String(e)}`,
    )
  }
}

function warnIfTruncated(
  stats: AvecSyncStats,
  reportId: string,
  result: Awaited<ReturnType<typeof fetchAllAvecReport>>,
) {
  if (result.truncated) stats.warnings.push(formatTruncationWarning(reportId, result))
}

async function syncClients(stats: AvecSyncStats, syncRunId?: string) {
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
      })
      stats.clients_upserted++
    } catch (e) {
      stats.errors.push(`cliente: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
}

async function syncAppointments(stats: AvecSyncStats, mode: AvecSyncMode, syncRunId?: string) {
  const range = mode === 'fast' ? periodRange(0, 0) : periodRange(1, 21)
  const params = { ...range, site: avecSiteParam(), profissional_id: '', limit: 250 }
  const result = await fetchAllAvecReport('0051', params)
  warnIfTruncated(stats, '0051', result)
  await snapshotReport('0051', params, result.rows, stats, syncRunId)

  const today = todayIso()

  for (const row of result.rows) {
    try {
      const appt = normalizeAppointmentRow(row)
      if (!appt) continue

      if (mode === 'fast' && appt.scheduledAt) {
        const day = appt.scheduledAt.slice(0, 10)
        if (day !== today) continue
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
        }
      }

      stats.appointments_synced++
    } catch (e) {
      stats.errors.push(`agendamento: ${e instanceof Error ? e.message : String(e)}`)
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

  for (const row of result.rows) {
    try {
      const att = normalizeAttendanceRow(row)
      if (!att) continue

      if (mode === 'fast' && att.attendedAt) {
        if (att.attendedAt.slice(0, 10) !== today) continue
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
        if (servicesCreatedRecently(service)) stats.services_created++
        await markServiceDone(service.id, {
          doneAt: att.attendedAt,
          professionalName: att.professional,
          lastPrice: att.price,
        })
        stats.services_completed++
      }

      stats.attendances_synced++
    } catch (e) {
      stats.errors.push(`atendimento: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
}

async function syncRevenue(stats: AvecSyncStats, syncRunId?: string) {
  const def = getDailyReports().find((r) => r.mapper === 'revenue')
  if (!def) return

  let reportId = resolveReportId(def)
  if (!reportId && isAvecMock()) reportId = 'revenue'
  if (!reportId) {
    stats.warnings.push('AVEC_REPORT_REVENUE não configurado — faturamento pulado')
    return
  }

  const { inicio, fim } = periodRange(0, 0)
  const params = { inicio, fim, site: avecSiteParam(), limit: 250 }
  const result = await fetchAllAvecReport(reportId, params)
  warnIfTruncated(stats, reportId, result)
  await snapshotReport(reportId, params, result.rows, stats, syncRunId)

  const today = todayIso()
  let revenue = 0
  let attended = 0
  let skippedNoDay = 0

  for (const row of result.rows) {
    const rev = normalizeRevenueRow(row)
    if (!rev) continue
    stats.revenue_rows++
    if (!rev.day) {
      skippedNoDay++
      continue
    }
    if (rev.day === today) {
      revenue += rev.revenue
      attended += rev.attended
    }
  }

  if (skippedNoDay > 0) {
    stats.warnings.push(`Receita: ${skippedNoDay} linhas sem data ignoradas`)
  }

  if (revenue > 0 || attended > 0) {
    await upsertSalonMetrics(today, {
      revenue,
      attended: attended || undefined,
      ticket_avg: attended > 0 ? revenue / attended : null,
    })
  }
}

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

  const range = mode === 'fast' ? periodRange(0, 0) : periodRange(0, 7)
  const params = { ...range, site: avecSiteParam(), limit: 250 }
  const result = await fetchAllAvecReport(reportId, params)
  warnIfTruncated(stats, reportId, result)
  await snapshotReport(reportId, params, result.rows, stats, syncRunId)

  const today = todayIso()
  let cancelled = 0
  let no_shows = 0

  for (const row of result.rows) {
    const c = normalizeCancellationRow(row)
    if (!c) continue
    stats.cancellation_rows++
    if (c.day === today) {
      cancelled += c.cancelled
      no_shows += c.noShow
    }
  }

  if (cancelled > 0 || no_shows > 0) {
    await upsertSalonMetrics(today, { cancelled, no_shows })
  }
}

function resolveStatus(stats: AvecSyncStats): AvecSyncRun['status'] {
  if (stats.errors.length > 0 && stats.appointments_synced + stats.attendances_synced + stats.revenue_rows === 0) {
    return 'error'
  }
  if (stats.errors.length > 0 || stats.warnings.length > 0) return 'partial'
  return 'ok'
}

/**
 * Sync Avec — unidade ROM Iguatemi (configurável via SALON_UNIT_NAME).
 * - fast: relatórios do dia (0051, 0002, faturamento, cancelamentos) — cron a cada 5 min
 * - full: + catálogo clientes 0004 + janela ampla — cron 1×/dia
 */
export async function runAvecSync(mode: AvecSyncMode = 'full'): Promise<AvecSyncRun> {
  if (!isAvecConfigured()) {
    throw new Error('Avec não configurado — defina AVEC_API_TOKEN')
  }
  assertAvecMockAllowed()

  const stats = emptyStats(mode)
  const unit = getSalonUnit()
  if (!unit.avecUnitId) {
    stats.warnings.push(
      'AVEC_UNIT_ID vazio — sync sem filtro de site (risco de misturar unidades se o token for compartilhado)'
    )
  }

  try {
    if (mode === 'full') {
      await syncClients(stats)
    }

    await syncAppointments(stats, mode)
    await syncAttendances(stats, mode)
    await syncRevenue(stats)
    await syncCancellations(stats, mode)
    if (mode === 'full') {
      try {
        await syncP1Kpis(stats)
      } catch (e) {
        stats.errors.push(`P1: ${e instanceof Error ? e.message : String(e)}`)
      }
      try {
        await syncP2Kpis(stats)
      } catch (e) {
        stats.errors.push(`P2: ${e instanceof Error ? e.message : String(e)}`)
      }
      try {
        await syncP3Kpis(stats)
      } catch (e) {
        stats.errors.push(`P3: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    await recomputeSalonMetricsFromRom()

    const status = resolveStatus(stats)
    const run = await recordSyncRun(mode, status, stats)

    await logEvent({
      contactId: null,
      channel: 'avec',
      direction: 'in',
      handledBy: 'system',
      payload: {
        avec_sync: stats,
        status,
        unit: unit.name,
        unit_line: unitContextLine(unit),
      },
    })

    return run
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    stats.errors.push(msg)
    return recordSyncRun(mode, 'error', stats, msg)
  }
}
