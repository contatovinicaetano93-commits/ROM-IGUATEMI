import { getSql } from '@/lib/db'
import { SYNC_LOCK_KEYS, withSyncLock } from '@/lib/sync-lock'
import {
  upsertContact,
  updateContact,
  logEvent,
  setPreferredManicurist,
  setPreferredHairstylist,
  resolveUpsertPhone,
  type ContactRow,
} from '@/lib/contacts'
import {
  listServices,
  addService,
  scheduleService,
  markServiceDone,
  patchServiceVisitMeta,
  clearOrphanSchedulesForDay,
  clearServiceSchedule,
  ensureServiceCadence,
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
  hardAvecSyncWarnings,
  isSoftAvecPeripheralError,
  isAvecTokenExpiredError,
} from '@/lib/avec/messages'
import {
  normalizeClientRow,
  normalizeAppointmentRow,
  normalizeAttendanceRow,
  normalizeRevenueRow,
  normalizeCancellationRow,
  parseAvecDateTime,
  guessServiceCategory,
  defaultCadenceDaysForServiceName,
  isNailService,
  isHairService,
} from '@/lib/avec/normalize'
import { getDailyReports, resolveReportId } from '@/lib/avec/registry'
import { purgeAvecStorageBloat, saveReportSnapshot } from '@/lib/avec/snapshots'
import { applyVisitDayToService } from '@/lib/avec/last-done-backfill'
import { getDeploymentContext } from '@/lib/deployment'
import { getSalonMetrics, recomputeSalonMetricsFromRom, upsertSalonMetrics } from '@/lib/salon/metrics'
import { todayIso, toSalonDateIso } from '@/lib/salon/format'
import {
  isAvecCancelledStatus,
  isAvecNegativeOutcomeStatus,
  isAvecNoShowStatus,
  isAvecOpenComandaStatus,
  isAvecOpenStatus,
  isAvecPaidStatus,
} from '@/lib/avec/appointment-status'
import {
  COMANDA_SERVICE_NAME,
  type ScheduleOrigin,
} from '@/lib/salon/schedule-origin'
import { syncP1Kpis } from '@/lib/avec/sync-p1'
import { syncP2Kpis, syncPaymentMixRecent } from '@/lib/avec/sync-p2'
import { syncP3Kpis } from '@/lib/avec/sync-p3'
import type { RomPanelId } from '@/lib/brand'
import { avecSiteParam, getAvecUnitId } from '@/lib/brand'
import { ensureFreshAvecApiToken } from '@/lib/avec/token-store'

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
  /** true enquanto o job ainda não chamou finish — excluído do min-gap. */
  running?: boolean
  /** Abort limpo por orçamento de tempo (deadlineAt) — status partial. */
  aborted?: boolean
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
    values (${kind}, ${status}, ${stats}, ${error ?? null})
    returning *
  `) as AvecSyncRun[]
  return rows[0]
}

/** Abre run no início — snapshots recebem sync_run_id correto. */
async function beginAvecSyncRun(kind: string, stats: AvecSyncStats): Promise<AvecSyncRun> {
  const sql = getSql()
  // Runs mortos por timeout/kill não devem bloquear o min-gap / status UI.
  // Com progresso checkpointado → partial (não pintar Cérebro/Hoje de error falso).
  await sql`
    update avec_sync_runs
    set
      status = case
        when coalesce((stats->>'clients_upserted')::int, 0)
          + coalesce((stats->>'appointments_synced')::int, 0)
          + coalesce((stats->>'attendances_synced')::int, 0)
          + coalesce((stats->>'revenue_rows')::int, 0)
          + coalesce((stats->>'cancellation_rows')::int, 0)
          + coalesce((stats->>'positions_synced')::int, 0)
          + coalesce((stats->>'alerts_active')::int, 0)
          + coalesce((stats->>'movements_synced')::int, 0) > 0
        then 'partial'
        else 'error'
      end,
      error = coalesce(nullif(error, ''), 'Sync interrompido (timeout/kill)'),
      stats = coalesce(stats, '{}'::jsonb) || '{"running":false}'::jsonb
    where kind in ('fast', 'full')
      and coalesce(stats->>'running', 'false') = 'true'
      and (
        kind = ${kind}
        or created_at < now() - interval '8 minutes'
      )
  `
  const starting: AvecSyncStats = { ...stats, running: true }
  const rows = (await sql`
    insert into avec_sync_runs (kind, status, stats)
    values (${kind}, 'partial', ${starting})
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
  const finished: AvecSyncStats = { ...stats, running: false }
  const rows = (await sql`
    update avec_sync_runs
    set status = ${status}, stats = ${finished}, error = ${error ?? null}
    where id = ${id}::uuid
    returning *
  `) as AvecSyncRun[]
  return rows[0]!
}

/** Checkpoint mid-flight — progresso com running=true; abandonStale só fecha orphans. */
async function checkpointAvecSyncRun(id: string, stats: AvecSyncStats): Promise<void> {
  const sql = getSql()
  const mid: AvecSyncStats = { ...stats, running: true }
  await sql`
    update avec_sync_runs
    set stats = ${mid}
    where id = ${id}::uuid
      and coalesce(stats->>'running', 'false') = 'true'
  `
}

export async function getLastAvecSync(
  kind?: string,
  opts?: { finishedOnly?: boolean },
): Promise<AvecSyncRun | null> {
  const sql = getSql()
  // NÃO fazer UPDATE aqui — Relatórios/Hoje/Visão chamam isto a cada load.
  // Orphans são saneados em begin / abandonStaleAvecSyncRuns.
  const finishedOnly = opts?.finishedOnly === true
  if (kind) {
    const rows = finishedOnly
      ? ((await sql`
          select * from avec_sync_runs
          where kind = ${kind}
            and coalesce(stats->>'running', 'false') <> 'true'
          order by created_at desc
          limit 1
        `) as AvecSyncRun[])
      : ((await sql`
          select * from avec_sync_runs where kind = ${kind} order by created_at desc limit 1
        `) as AvecSyncRun[])
    return rows[0] ?? null
  }
  // Hoje/badge: só agenda Avec (fast/full) — não misturar stock_* .
  const rows = finishedOnly
    ? ((await sql`
        select * from avec_sync_runs
        where kind in ('fast', 'full')
          and coalesce(stats->>'running', 'false') <> 'true'
        order by created_at desc
        limit 1
      `) as AvecSyncRun[])
    : ((await sql`
        select * from avec_sync_runs
        where kind in ('fast', 'full')
        order by created_at desc
        limit 1
      `) as AvecSyncRun[])
  return rows[0] ?? null
}

/**
 * Fecha runs órfãos (timeout Vercel / kill sem finally).
 * Só `running=true` — nunca reescreve partial/ok já finalizados (falso abandoned).
 */
export async function abandonStaleAvecSyncRuns(maxAgeMs = 8 * 60_000): Promise<number> {
  const sql = getSql()
  const cutoff = new Date(Date.now() - maxAgeMs).toISOString()
  // Progresso mid-flight ≠ sync completo — nunca promover a ok (mentiria saúde no Cérebro).
  const rows = (await sql`
    update avec_sync_runs
    set
      status = case
        when coalesce((stats->>'clients_upserted')::int, 0)
          + coalesce((stats->>'appointments_synced')::int, 0)
          + coalesce((stats->>'attendances_synced')::int, 0)
          + coalesce((stats->>'revenue_rows')::int, 0)
          + coalesce((stats->>'cancellation_rows')::int, 0)
          + coalesce((stats->>'positions_synced')::int, 0)
          + coalesce((stats->>'alerts_active')::int, 0)
          + coalesce((stats->>'movements_synced')::int, 0) > 0
        then 'partial'
        else 'error'
      end,
      error = coalesce(nullif(error, ''), 'abandoned_partial_timeout'),
      stats = coalesce(stats, '{}'::jsonb) || '{"running":false}'::jsonb
    where coalesce(stats->>'running', 'false') = 'true'
      and kind in ('fast', 'full', 'stock_fast', 'stock_full')
      and created_at < ${cutoff}::timestamptz
    returning id
  `) as { id: string }[]
  return rows.length
}

/** Margem vs route maxDuration=800s — abort limpo em vez de kill mid-row. */
const AVEC_SYNC_BUDGET_MS = 720_000

/** Deadline do sync em voo — fetchAllAvecReport + loops checam isto. */
let activeSyncDeadlineAt: number | null = null

function syncBudgetExhausted(): boolean {
  return activeSyncDeadlineAt != null && Date.now() >= activeSyncDeadlineAt
}

function markSyncBudgetExhausted(stats: AvecSyncStats, stage: string) {
  if (stats.aborted) return
  stats.aborted = true
  stats.warnings.push(`sync: orçamento esgotado em ${stage} (abort limpo)`)
}

async function fetchSyncReport(
  reportId: string,
  params: Parameters<typeof fetchAllAvecReport>[1] = {},
  maxPages?: number,
) {
  return fetchAllAvecReport(reportId, params, maxPages, {
    deadlineAt: activeSyncDeadlineAt,
  })
}

/** Catálogo 0004 é pesado (~50k upserts) — no máximo 1×/dia no cron. */
const CLIENT_DUMP_MIN_GAP_MS = 20 * 60 * 60_000

async function shouldSyncClientCatalog(): Promise<boolean> {
  if (process.env.AVEC_SYNC_CLIENTS === '1' || process.env.AVEC_SYNC_CLIENTS === 'true') {
    return true
  }
  if (process.env.AVEC_SYNC_CLIENTS === '0' || process.env.AVEC_SYNC_CLIENTS === 'false') {
    return false
  }
  const sql = getSql()
  const rows = (await sql`
    select created_at, stats
    from avec_sync_runs
    where kind = 'full'
      and status in ('ok', 'partial')
      and coalesce((stats->>'clients_upserted')::int, 0) > 0
    order by created_at desc
    limit 1
  `) as { created_at: string; stats: AvecSyncStats | string }[]
  const last = rows[0]
  if (!last?.created_at) return true
  const age = Date.now() - new Date(last.created_at).getTime()
  return age >= CLIENT_DUMP_MIN_GAP_MS
}

/** Cache por contato no decorrer de um sync — evita N+1 listServices por linha Avec. */
let syncServiceCache: Map<string, Awaited<ReturnType<typeof listServices>>> | null = null

function beginSyncServiceCache() {
  syncServiceCache = new Map()
}

function endSyncServiceCache() {
  syncServiceCache = null
}

async function findOrCreateService(contactId: string, serviceName: string) {
  const cache = syncServiceCache
  let services = cache?.get(contactId)
  if (!services) {
    services = await listServices(contactId)
    cache?.set(contactId, services)
  }
  const match = services.find((s) => s.name.toLowerCase() === serviceName.toLowerCase())
  const cadenceDays = defaultCadenceDaysForServiceName(serviceName)
  if (match) {
    // Sync antigo criava serviços sem cadence — completa na próxima visita/agenda.
    if (match.cadence_days == null) {
      const patched = await ensureServiceCadence(match.id, cadenceDays)
      if (patched && cache) {
        const idx = services.findIndex((s) => s.id === patched.id)
        if (idx >= 0) services[idx] = patched
      }
      return patched ?? match
    }
    return match
  }

  const created = await addService(contactId, {
    name: serviceName,
    category: guessServiceCategory(serviceName),
    cadenceDays,
  })
  services.push(created)
  cache?.set(contactId, services)
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
    await saveReportSnapshot(reportId, params, rows, syncRunId, { keepPayload: false, retain: 1 })
    stats.snapshots_saved++
  } catch (e) {
    stats.warnings.push(`snapshot ${reportId}: ${e instanceof Error ? e.message : String(e)}`)
  }
}

function warnIfTruncated(stats: AvecSyncStats, reportId: string, result: Awaited<ReturnType<typeof fetchAllAvecReport>>) {
  if (result.truncated) stats.warnings.push(formatTruncationWarning(reportId, result))
}

/**
 * Dedupa upserts no batch do sync: mesmo telefone (ou mesmo avec id) reusa a
 * mesma Promise encadeada — evita corrida contacts_phone_idx dentro do relatório.
 */
function createBatchContactUpserter() {
  const chains = new Map<string, Promise<ContactRow>>()

  return function upsertInBatch(
    input: Parameters<typeof upsertContact>[0],
  ): Promise<ContactRow> {
    const phone = resolveUpsertPhone(input.phone)
    const avec = input.avecClientId?.trim() || null
    const key = phone ? `p:${phone}` : avec ? `a:${avec}` : null
    if (!key) return upsertContact(input)

    const prev = chains.get(key)
    // then(fn, fn): após rejeição a cadeia continua (mesmo padrão de withUpsertKey).
    const run = () => upsertContact(input)
    const next = (prev ?? Promise.resolve()).then(run, run)
    chains.set(key, next)
    return next
  }
}

/** Dump / sync Avec com canal avec preso em "novo" → importado (≠ lead WhatsApp). */
async function healImportadoStatus(stats: AvecSyncStats) {
  try {
    const sql = getSql()
    await sql`
      update contacts
      set status = 'importado'
      where status = 'novo'
        and channel = 'avec'
        and anonymized_at is null
    `
  } catch (e) {
    stats.warnings.push(`heal importado: ${e instanceof Error ? e.message : String(e)}`)
  }
}

async function syncClients(stats: AvecSyncStats, syncRunId?: string) {
  try {
    await healImportadoStatus(stats)

    const params = { limit: 250, site: avecSiteParam() }
    const result = await fetchSyncReport('0004', params)
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
  // Fast: hoje + amanhã (Hoje + lembrete curto). Semana (+21d) só no full 2×/dia.
  // +7d no fast gerava 504 eterno; +2d ainda estourava o teto no BR (~350 linhas).
  const range = mode === 'fast' ? periodRange(0, 1) : periodRange(1, 21)
  // 0051: site = origem Online/Local ("" = todos). Unidade vem do token (salon_id).
  const params = { ...range, site: '', profissional_id: '', limit: 250 }
  const result = await fetchSyncReport('0051', params)
  warnIfTruncated(stats, '0051', result)
  // Snapshot pesado só no full — no fast o payload 0051 come budget sem valor operacional.
  if (mode === 'full') {
    await snapshotReport('0051', params, result.rows, stats, syncRunId)
  }

  const today = todayIso()
  /** Serviços que devem permanecer abertos hoje (Agendado/Aguardando/Em Atendimento). */
  const todayOpenServiceIds: string[] = []
  /** Movimento do dia = cabeças (contato único), não linhas 0051. */
  const todayBookedHeads = new Set<string>()
  let todayRows = 0
  const upsertInBatch = createBatchContactUpserter()

  for (const row of result.rows) {
    if (syncBudgetExhausted()) {
      markSyncBudgetExhausted(stats, 'appointments')
      break
    }
    try {
      const appt = normalizeAppointmentRow(row)
      if (!appt) continue

      // Status agenda 0051. No-show KPI: fonte canônica é 0248 (não gravar aqui).
      // "Em Atendimento" / "A Realizar" = aberto — NÃO marcar pago nem perdido.
      // "não pago" não casa com \bpago\b.
      const status = (appt.status ?? '').toLowerCase()
      const isNoShow = isAvecNoShowStatus(status)
      const isNegativeOutcome = isAvecNegativeOutcomeStatus(status)
      const isPaid = isAvecPaidStatus(status)
      const isCancelled = isAvecCancelledStatus(status)
      const isLostOutcome = isCancelled || isNoShow || isNegativeOutcome
      const isOpenComanda = !isPaid && !isLostOutcome && isAvecOpenComandaStatus(status)

      // Comanda/encaixe aberto sem horário: ancora no dia da linha ou agora.
      let scheduledAt = appt.scheduledAt
      if (
        !scheduledAt &&
        isOpenComanda &&
        (appt.appointmentDay || appt.serviceName || isAvecOpenStatus(status))
      ) {
        const day = appt.appointmentDay ?? today
        const parts = new Intl.DateTimeFormat('en-GB', {
          timeZone: 'America/Sao_Paulo',
          hour: '2-digit',
          minute: '2-digit',
          hourCycle: 'h23',
        }).formatToParts(new Date())
        const hh = parts.find((p) => p.type === 'hour')?.value ?? '12'
        const mm = parts.find((p) => p.type === 'minute')?.value ?? '00'
        scheduledAt = new Date(`${day}T${hh}:${mm}:00-03:00`).toISOString()
      }
      const apptDay =
        (scheduledAt ? toSalonDateIso(scheduledAt) : null) ?? appt.appointmentDay
      const serviceName =
        appt.serviceName ??
        (isOpenComanda &&
        apptDay === today &&
        (isAvecOpenStatus(status) || /\baguard/.test(status) || !status)
          ? COMANDA_SERVICE_NAME
          : null)
      // Não descartar dias futuros no fast — Contatos Agendados usa a semana.
      const scheduleOrigin: ScheduleOrigin =
        !appt.hasClockTime || serviceName === COMANDA_SERVICE_NAME ? 'comanda' : 'agenda'

      if (apptDay === today) todayRows++

      if (!appt.avecClientId && !appt.phone) {
        stats.warnings.push('agenda: linha sem avec_client_id e sem telefone — ignorada')
        continue
      }

      const contact = await upsertInBatch({
        avecClientId: appt.avecClientId ?? undefined,
        name: appt.clientName,
        email: appt.email,
        phone: appt.phone,
        channel: 'avec',
        source: mode === 'fast' ? 'avec_sync_appointments_fast' : 'avec_sync_appointments',
        // Cancel/no-show: não marca perdido aqui — só se não restar slot aberto
        // (evita um cancel demotar contato com outro horário ainda aberto).
        status: isPaid ? 'convertido' : isLostOutcome ? undefined : 'agendado',
      })
      // Tombstone LGPD: upsert casa no id, mas não reescreve serviços/prefs/PII.
      if (contact.anonymized_at) {
        stats.appointments_synced++
        continue
      }

      // Cabeça do dia: 1 contato com ≥1 linha aberta/paga (ignora cancel/no-show).
      if (apptDay === today && !isCancelled && !isNoShow && !isNegativeOutcome) {
        todayBookedHeads.add(contact.id)
      }

      if (serviceName && scheduledAt) {
        const service = await findOrCreateService(contact.id, serviceName)
        const isNew = servicesCreatedRecently(service)
        if (isNew) stats.services_created++

        // 0051 status Pago = comanda fechada. Usa hora_ini do agendamento (único relógio
        // estável que a Avec manda) — evita Concluídos todos com o mesmo horário inventado.
        if (isPaid) {
          await markServiceDone(service.id, {
            doneAt: scheduledAt,
            professionalName: appt.professional,
            lastPrice: appt.price,
          })
          stats.services_completed++
        } else if (isLostOutcome) {
          // Só limpa se o slot aberto for do mesmo dia do cancel/no-show (não apaga futuro).
          if (
            apptDay &&
            service.scheduled_at &&
            toSalonDateIso(service.scheduled_at) === apptDay
          ) {
            await clearServiceSchedule(service.id)
          }
          const remaining = await listServices(contact.id)
          if (!remaining.some((s) => s.scheduled_at)) {
            await updateContact(contact.id, { status: 'perdido' })
          }
        } else {
          const before = service.scheduled_at
          const updated = await scheduleService(service.id, scheduledAt, appt.professional, {
            origin: scheduleOrigin,
          })
          if (updated && before !== scheduledAt) stats.services_scheduled++
          if (apptDay === today) todayOpenServiceIds.push(service.id)
        }

        if (appt.professional && isNailService(serviceName)) {
          await setPreferredManicurist(contact.id, appt.professional)
        } else if (appt.professional && isHairService(serviceName)) {
          await setPreferredHairstylist(contact.id, appt.professional)
        }
      } else if (isLostOutcome) {
        const remaining = await listServices(contact.id)
        if (!remaining.some((s) => s.scheduled_at)) {
          await updateContact(contact.id, { status: 'perdido' })
        }
      }

      stats.appointments_synced++
      if (syncRunId && stats.appointments_synced % 50 === 0) {
        await checkpointAvecSyncRun(syncRunId, stats).catch(() => {})
      }
    } catch (e) {
      stats.errors.push(`agendamento: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  // Reconcilia órfãos + KPI Movimento = cabeças (abertos+pagos) do dia.
  // Truncado: keep-set incompleto — não limpar (risco de apagar slots reais / ROM manual).
  if (todayRows > 0) {
    try {
      if (result.truncated || stats.aborted) {
        stats.warnings.push(
          stats.aborted
            ? 'agenda: reconcile de órfãos adiado — sync abortou no orçamento (keep-set incompleto)'
            : 'agenda: reconcile de órfãos adiado — 0051 truncado (keep-set incompleto)',
        )
        // Não grava appointments parcial — keep-set incompleto distorce o KPI.
      } else {
        const cleared = await clearOrphanSchedulesForDay(today, todayOpenServiceIds)
        if (cleared > 0) {
          stats.warnings.push(`agenda: ${cleared} agendamento(s) órfão(s) removido(s) do dia`)
        }
        await upsertSalonMetrics(today, { appointments: todayBookedHeads.size })
      }
    } catch (e) {
      stats.errors.push(`agenda reconcile: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

}

function servicesCreatedRecently(service: { created_at: string }) {
  return Date.now() - new Date(service.created_at).getTime() < 5000
}

/** True quando syncAttendances já gravou returning (+ last_done no full) — evita 2º fetch 0002. */
let attendancesCoveredReturning = false
/** True quando syncAttendances já buscou 0002 — truncado ou não, não refaz fallback. */
let attendancesFetched0002 = false

async function syncAttendances(stats: AvecSyncStats, mode: AvecSyncMode, syncRunId?: string) {
  const today = todayIso()
  // Uma janela serve attendances + returning (colapsa duplo 0002 no budget).
  const fetchFrom = mode === 'fast' ? `${today.slice(0, 7)}-01` : addCalendarDaysYmd(today, -90)
  const attendanceFrom = mode === 'fast' ? today : addCalendarDaysYmd(today, -7)
  const params = {
    inicio: isoToBr(fetchFrom),
    fim: isoToBr(today),
    site: avecSiteParam(),
    como_conheceu: '',
    limit: 250,
  }
  const result = await fetchSyncReport('0002', params)
  attendancesFetched0002 = true
  warnIfTruncated(stats, '0002', result)
  await snapshotReport('0002', params, result.rows, stats, syncRunId)

  let durationSumMinutes = 0
  let durationCount = 0
  const upsertInBatch = createBatchContactUpserter()
  const returningByDay = new Map<string, number>()

  for (const row of result.rows) {
    if (syncBudgetExhausted()) {
      markSyncBudgetExhausted(stats, 'attendances')
      break
    }
    try {
      const att = normalizeAttendanceRow(row)
      if (!att) continue

      const visitDay = att.lastVisitDay
      if (visitDay && (att.totalVisits ?? 0) > 1) {
        returningByDay.set(visitDay, (returningByDay.get(visitDay) ?? 0) + 1)
      }

      const attendedDay = att.attendedAt ? toSalonDateIso(att.attendedAt) : visitDay
      if (!attendedDay || attendedDay < attendanceFrom || attendedDay > today) continue

      // TM (Sprint 1) — só soma se a Avec mandou início+fim reais e o atendimento foi hoje.
      if (att.durationMinutes != null && att.attendedAt && toSalonDateIso(att.attendedAt) === today) {
        durationSumMinutes += att.durationMinutes
        durationCount++
      }

      const contact = await upsertInBatch({
        avecClientId: att.avecClientId ?? undefined,
        name: att.clientName,
        phone: att.phone,
        channel: 'avec',
        source: mode === 'fast' ? 'avec_sync_attended_fast' : 'avec_sync_attended',
        status: 'convertido',
      })
      if (contact.anonymized_at) {
        stats.attendances_synced++
        continue
      }

      if (att.serviceName) {
        const service = await findOrCreateService(contact.id, att.serviceName)
        const isNew = servicesCreatedRecently(service)
        if (isNew) stats.services_created++
        // 0002 desta unidade só manda ultima_visita (data) — sem hora. Não sobrescrever
        // o horário do 0051 Pago com meia-noite/placeholder.
        const doneAt = att.endedAt ?? att.startedAt ?? null
        if (doneAt) {
          await markServiceDone(service.id, {
            doneAt,
            professionalName: att.professional,
            lastPrice: att.price,
          })
          stats.services_completed++
        } else if (
          service.scheduled_at &&
          toSalonDateIso(service.scheduled_at) === today &&
          att.attendedAt &&
          toSalonDateIso(att.attendedAt) === today
        ) {
          // 0002 sem hora: conclui mantendo o wall-clock do 0051 (não inventa meia-noite).
          await markServiceDone(service.id, {
            doneAt: service.scheduled_at,
            professionalName: att.professional,
            lastPrice: att.price,
          })
          stats.services_completed++
        } else if (att.professional || att.price != null) {
          await patchServiceVisitMeta(service.id, {
            professionalName: att.professional,
            lastPrice: att.price,
            allowLastPrice: true,
          })
        }
        if (att.professional && isNailService(att.serviceName)) {
          await setPreferredManicurist(contact.id, att.professional)
        } else if (att.professional && isHairService(att.serviceName)) {
          await setPreferredHairstylist(contact.id, att.professional)
        }
      }

      stats.attendances_synced++
      if (syncRunId && stats.attendances_synced % 50 === 0) {
        await checkpointAvecSyncRun(syncRunId, stats).catch(() => {})
      }
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

  if (result.truncated || stats.aborted) {
    stats.warnings.push(
      stats.aborted
        ? 'recorrentes 0002: abort no orçamento — métricas returning não atualizadas (evita zerar)'
        : 'recorrentes 0002: truncado — métricas returning não atualizadas (evita zerar)',
    )
  } else {
    if (mode === 'fast') {
      await upsertSalonMetrics(today, {
        returning_clients: returningByDay.get(today) ?? 0,
      })
    } else {
      const days = listDaysInclusive(addCalendarDaysYmd(today, -7), today)
      for (const day of days) {
        await upsertSalonMetrics(day, { returning_clients: returningByDay.get(day) ?? 0 })
      }
      for (const row of result.rows) {
        try {
          const att = normalizeAttendanceRow(row)
          if (!att?.lastVisitDay || (att.totalVisits ?? 0) <= 1) continue
          const day = att.lastVisitDay
          const contact = await upsertContact({
            avecClientId: att.avecClientId ?? undefined,
            name: att.clientName,
            phone: att.phone,
            channel: 'avec',
            source: 'avec_sync_returning_0002',
            status: 'convertido',
          })
          if (contact.anonymized_at) continue
          const serviceName = att.serviceName || 'Atendimento'
          const service = await findOrCreateService(contact.id, serviceName)
          if (day === today) {
            const doneAt = att.endedAt ?? att.startedAt ?? null
            if (doneAt) {
              await markServiceDone(service.id, {
                doneAt,
                professionalName: att.professional,
                lastPrice: att.price,
              })
            } else if (
              service.scheduled_at &&
              toSalonDateIso(service.scheduled_at) === today
            ) {
              await markServiceDone(service.id, {
                doneAt: service.scheduled_at,
                professionalName: att.professional,
                lastPrice: att.price,
              })
            } else {
              await applyVisitDayToService(service.id, day, {
                professionalName: att.professional,
                lastPrice: att.price,
              })
            }
          } else {
            await applyVisitDayToService(service.id, day, {
              professionalName: att.professional,
              lastPrice: att.price,
            })
          }
        } catch (e) {
          stats.errors.push(`retorno contact: ${e instanceof Error ? e.message : String(e)}`)
        }
      }
    }
    attendancesCoveredReturning = true
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

/** Janela de backfill diário: AVEC_REVENUE_DAYS_BACK override; senão fast=1, full=7. */
function revenueDaysBack(mode: AvecSyncMode): number {
  const raw = process.env.AVEC_REVENUE_DAYS_BACK?.trim()
  if (raw) {
    const n = Number(raw)
    if (Number.isFinite(n) && n >= 0) return Math.floor(n)
  }
  return mode === 'fast' ? 1 : 7
}

/**
 * Faturamento dia a dia no intervalo [from, to] (YYYY-MM-DD, inclusive).
 * Sempre grava a linha do dia (mesmo receita 0) para Relatórios não marcar gap.
 */
export async function syncRevenueDateRange(
  stats: AvecSyncStats,
  from: string,
  to: string,
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

  const days = listDaysInclusive(from, to)

  for (const day of days) {
    const params = {
      inicio: isoToBr(day),
      fim: isoToBr(day),
      site: avecSiteParam(),
      limit: 250,
    }
    try {
      const result = await fetchSyncReport(reportId, params)
      warnIfTruncated(stats, reportId, result)
      await snapshotReport(reportId, params, result.rows, stats, syncRunId)

      if (result.truncated) {
        stats.warnings.push(
          `receita ${day}: truncado — métrica não atualizada (evita undercount/zero)`,
        )
        continue
      }

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

      const attendedInt = Math.round(attended)
      const revenueRounded = Math.round(revenue * 100) / 100
      // 0 preenche dia faltante; não zera métricas já gravadas se o payload veio vazio/ilegível.
      if (revenueRounded === 0 && attendedInt === 0) {
        const existing = await getSalonMetrics(day)
        if (existing && (Number(existing.revenue) > 0 || Number(existing.attended) > 0)) {
          continue
        }
      }
      await upsertSalonMetrics(day, {
        revenue: revenueRounded,
        attended: attendedInt,
        ticket_avg: attendedInt > 0 ? Math.round((revenue / attendedInt) * 100) / 100 : null,
      })
    } catch (e) {
      stats.errors.push(`receita ${day}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
}

/**
 * Faturamento dia a dia.
 * Fast: hoje + ontem (corrige atraso do relatório).
 * Full: últimos 7 dias + hoje (mesmo padrão do 0081).
 * Override: AVEC_REVENUE_DAYS_BACK=N (ex.: mês incompleto).
 */
async function syncRevenue(
  stats: AvecSyncStats,
  mode: AvecSyncMode,
  syncRunId?: string,
) {
  const today = todayIso()
  const daysBack = revenueDaysBack(mode)
  const from = addCalendarDaysYmd(today, -daysBack)
  await syncRevenueDateRange(stats, from, today, syncRunId)
}

/**
 * Cancelamentos dia a dia no intervalo [from, to].
 */
export async function syncCancellationsDateRange(
  stats: AvecSyncStats,
  from: string,
  to: string,
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

  const days = listDaysInclusive(from, to)

  for (const day of days) {
    const params = {
      inicio: isoToBr(day),
      fim: isoToBr(day),
      site: avecSiteParam(),
      limit: 250,
    }
    try {
      const result = await fetchSyncReport(reportId, params)
      warnIfTruncated(stats, reportId, result)
      await snapshotReport(reportId, params, result.rows, stats, syncRunId)

      if (result.truncated) {
        stats.warnings.push(
          `cancelamentos ${day}: truncado — métrica não atualizada (evita undercount)`,
        )
        continue
      }

      let cancelled = 0
      for (const row of result.rows) {
        const c = normalizeCancellationRow(row)
        if (!c) continue
        stats.cancellation_rows++
        if (!c.day || c.day === day) {
          cancelled += c.cancelled
          // c.noShow ignorado — métrica no_shows só via 0248
        }
      }

      await upsertSalonMetrics(day, { cancelled })
    } catch (e) {
      stats.errors.push(`cancelamentos ${day}: ${e instanceof Error ? e.message : String(e)}`)
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
  const today = todayIso()
  const daysBack = revenueDaysBack(mode)
  const from = addCalendarDaysYmd(today, -daysBack)
  await syncCancellationsDateRange(stats, from, today, syncRunId)
}

/**
 * No-shows oficiais — relatório 0248 com status=0.6 ("Faltou") no intervalo.
 */
export async function syncNoShows0248DateRange(
  stats: AvecSyncStats,
  from: string,
  to: string,
  syncRunId?: string,
) {
  const params = {
    inicio: isoToBr(from),
    fim: isoToBr(to),
    status: '0.6',
    limit: 250,
  }
  try {
    const result = await fetchSyncReport('0248', params)
    warnIfTruncated(stats, '0248', result)
    await snapshotReport('0248', params, result.rows, stats, syncRunId)

    if (result.truncated) {
      stats.warnings.push(
        'no-show 0248: truncado — métricas não atualizadas (evita zerar dias incompletos)',
      )
      return
    }

    const byDay = new Map<string, number>()
    for (const row of result.rows) {
      const appt = normalizeAppointmentRow(row)
      const day =
        (appt?.scheduledAt ? toSalonDateIso(appt.scheduledAt) : null) ??
        (typeof row.data === 'string' ? toSalonDateIso(parseAvecDateTime(String(row.data))) : null)
      if (!day) continue
      // Endpoint já filtrado por status=0.6 (Faltou).
      byDay.set(day, (byDay.get(day) ?? 0) + 1)
    }

    for (const [day, no_shows] of byDay) {
      await upsertSalonMetrics(day, { no_shows })
    }

    // Zera dias do intervalo sem falta (evita KPI stale após correção Avec).
    for (const day of listDaysInclusive(from, to)) {
      if (!byDay.has(day)) {
        await upsertSalonMetrics(day, { no_shows: 0 })
      }
    }
  } catch (e) {
    stats.errors.push(`no-show 0248: ${e instanceof Error ? e.message : String(e)}`)
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
  await syncNoShows0248DateRange(stats, from, today, syncRunId)
}

/**
 * Fallback se attendances foi pulado (budget) — senão no-op (dump já colapsado).
 */
async function syncReturningFrom0002(
  stats: AvecSyncStats,
  mode: AvecSyncMode,
  syncRunId?: string,
) {
  if (attendancesFetched0002 || attendancesCoveredReturning) return
  if (syncBudgetExhausted()) {
    markSyncBudgetExhausted(stats, 'recorrentes 0002')
    return
  }
  // Attendances não rodou: fetch mínimo MTD (fast) / 7d metrics (full sem last_done 90d).
  const today = todayIso()
  const from = mode === 'fast' ? `${today.slice(0, 7)}-01` : addCalendarDaysYmd(today, -7)
  const params = {
    inicio: isoToBr(from),
    fim: isoToBr(today),
    como_conheceu: '',
    limit: 250,
  }
  try {
    const result = await fetchSyncReport('0002', params)
    warnIfTruncated(stats, '0002', result)
    if (mode === 'full') {
      await snapshotReport('0002-returning', params, result.rows, stats, syncRunId)
    }
    if (result.truncated) {
      stats.warnings.push(
        'recorrentes 0002: truncado — métricas returning não atualizadas (evita zerar)',
      )
      return
    }
    const returningByDay = new Map<string, number>()
    for (const row of result.rows) {
      const att = normalizeAttendanceRow(row)
      if (!att?.lastVisitDay) continue
      if ((att.totalVisits ?? 0) > 1) {
        returningByDay.set(att.lastVisitDay, (returningByDay.get(att.lastVisitDay) ?? 0) + 1)
      }
    }
    if (mode === 'fast') {
      await upsertSalonMetrics(today, {
        returning_clients: returningByDay.get(today) ?? 0,
      })
    } else {
      for (const day of listDaysInclusive(from, today)) {
        await upsertSalonMetrics(day, { returning_clients: returningByDay.get(day) ?? 0 })
      }
    }
  } catch (e) {
    stats.errors.push(`recorrentes 0002: ${e instanceof Error ? e.message : String(e)}`)
  }
}

/**
 * TM atendimento — 0223 (`tempo`) é catálogo sem filtro de data.
 * Não grava como KPI do dia (só 0002 com duração real). Snapshot fica para auditoria.
 * Uma página basta (payload não é retido) — paginar 50k linhas estoura o sync.
 */
async function syncDurationFrom0223(stats: AvecSyncStats, syncRunId?: string) {
  try {
    const params = { profissional_id: '', limit: 250 }
    const result = await fetchSyncReport('0223', params, 1)
    warnIfTruncated(stats, '0223', result)
    await snapshotReport('0223', params, result.rows, stats, syncRunId)
    stats.warnings.push('TM 0223: catálogo ignorado para KPI do dia (fonte: 0002)')
  } catch (e) {
    stats.errors.push(`TM 0223: ${e instanceof Error ? e.message : String(e)}`)
  }
}

export async function runAvecSync(mode: AvecSyncMode = 'full'): Promise<AvecSyncRun> {
  // Fast e full compartilham o mesmo lease — evita overlap no Postgres entre cron/webhook.
  return withSyncLock(SYNC_LOCK_KEYS.avec, () => runAvecSyncUnlocked(mode), {
    // maxDuration route = 800s — lease precisa sobreviver a lambda ainda viva.
    ttlMs: 15 * 60 * 1000,
    owner: `avec-${mode}`,
  })
}

async function runAvecSyncUnlocked(mode: AvecSyncMode): Promise<AvecSyncRun> {
  if (!isAvecConfigured()) {
    throw new Error('Avec não configurado — defina AVEC_API_TOKEN')
  }

  // JWT ~12h: renova antes do primeiro report (evita 401 + banner "token expirado").
  await ensureFreshAvecApiToken({ minHoursLeft: 1 }).catch(() => {
    // sync continua — fetchAvecReport ainda tenta force-refresh no 401
  })

  const debug = process.env.AVEC_SYNC_DEBUG === '1' || process.env.AVEC_SYNC_DEBUG === 'true'
  const step = (label: string) => {
    if (debug) console.log(`[avec-sync] ${mode} ${label} @ ${new Date().toISOString()}`)
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

  try {
    await abandonStaleAvecSyncRuns()
  } catch {
    // best-effort — não bloqueia o sync
  }

  const run = await beginAvecSyncRun(mode, stats)
  const syncRunId = run.id
  beginSyncServiceCache()
  activeSyncDeadlineAt = Date.now() + AVEC_SYNC_BUDGET_MS
  attendancesCoveredReturning = false
  attendancesFetched0002 = false
  step(`begin ${run.id}`)

  try {
    await healImportadoStatus(stats)
    step('healed')
    // Catálogo 0004 só depois do core (P1/agenda/caixa) — não pode comer o budget primeiro.
    if (mode === 'fast') {
      // Caixa PRIMEIRO e sozinho — se o cron estourar maxDuration depois,
      // o faturamento de Hoje já está gravado (paridade BR / #95).
      step('revenue…')
      await syncRevenue(stats, mode, syncRunId)
      await checkpointAvecSyncRun(syncRunId, stats).catch(() => {})
      step(`revenue_rows=${stats.revenue_rows}`)
      if (!syncBudgetExhausted()) {
        step('cancel/noshow…')
        await Promise.all([
          syncCancellations(stats, mode, syncRunId),
          syncNoShows0248(stats, mode, syncRunId),
        ])
        await checkpointAvecSyncRun(syncRunId, stats).catch(() => {})
      } else {
        markSyncBudgetExhausted(stats, 'após revenue')
      }
      if (!syncBudgetExhausted()) {
        step('appointments…')
        await syncAppointments(stats, mode, syncRunId)
        await checkpointAvecSyncRun(syncRunId, stats).catch(() => {})
        step(`appointments=${stats.appointments_synced}`)
      } else {
        markSyncBudgetExhausted(stats, 'antes de appointments')
      }
      if (!syncBudgetExhausted()) {
        step('attendances…')
        await syncAttendances(stats, mode, syncRunId)
        step(`attendances=${stats.attendances_synced}`)
      } else {
        markSyncBudgetExhausted(stats, 'antes de attendances')
      }
      // TM 0223 + P2 0081 só no full — no fast estouravam os 300s (Sync interrompido).
      step('fast core done (0223/0081 deferred to full)')
    } else {
      // Full: P1/P2/P3 primeiro — ocupação/aquisição não pode morrer no timeout
      // depois de agenda/atendimentos. Cada etapa isolada (403/WAF não derruba o resto).
      for (const [label, fn] of [
        ['P1', () => syncP1Kpis(stats, syncRunId)],
        ['P2', () => syncP2Kpis(stats, syncRunId)],
        ['P3', () => syncP3Kpis(stats, syncRunId)],
        ['appointments', () => syncAppointments(stats, mode, syncRunId)],
        ['attendances', () => syncAttendances(stats, mode, syncRunId)],
        ['revenue', () => syncRevenue(stats, mode, syncRunId)],
        ['cancellations', () => syncCancellations(stats, mode, syncRunId)],
        ['no-shows-0248', () => syncNoShows0248(stats, mode, syncRunId)],
        ['tm-0223', () => syncDurationFrom0223(stats, syncRunId)],
      ] as const) {
        if (syncBudgetExhausted()) {
          markSyncBudgetExhausted(stats, `antes de ${label}`)
          break
        }
        try {
          step(`${label}…`)
          await fn()
        } catch (e) {
          stats.errors.push(`${label}: ${e instanceof Error ? e.message : String(e)}`)
        }
        await checkpointAvecSyncRun(syncRunId, stats).catch(() => {})
      }
    }
    if (!syncBudgetExhausted()) {
      await recomputeSalonMetricsFromRom()
    } else {
      markSyncBudgetExhausted(stats, 'antes de recompute')
    }
    // Returning: no-op se attendances já cobriu; senão fallback.
    // Com abort: não dispara 0002 extra — Hoje já tem caixa/agenda do checkpoint.
    if (!syncBudgetExhausted()) {
      try {
        await syncReturningFrom0002(stats, mode, syncRunId)
      } catch (e) {
        stats.errors.push(`recorrentes 0002: ${e instanceof Error ? e.message : String(e)}`)
      }
    }

    if (mode === 'full') {
      if (!syncBudgetExhausted()) {
        const dumpClients = await shouldSyncClientCatalog()
        if (dumpClients) {
          step('clients…')
          await syncClients(stats, syncRunId)
          step(`clients done upserted=${stats.clients_upserted}`)
        } else {
          stats.warnings.push(
            'Catálogo 0004 adiado — já sincronizado nas últimas 20h (DB leve; force com AVEC_SYNC_CLIENTS=1)',
          )
          step('clients skipped (recent dump)')
        }
      } else {
        markSyncBudgetExhausted(stats, 'antes do catálogo 0004')
      }
      if (!syncBudgetExhausted()) {
        // Limpeza silenciosa — não vira warning (senão full ok marca "partial").
        try {
          await purgeAvecStorageBloat({ keepSnapshotDays: 0, keepSyncRunDays: 2 })
        } catch {
          /* ignore */
        }
      }
    }

    stats.errors = formatAvecErrorList(stats.errors)
    // P1 0107 timeout etc. → warning soft (não pinta Hoje como incompleto).
    const softPeripheral = stats.errors.filter(isSoftAvecPeripheralError)
    if (softPeripheral.length > 0) {
      stats.errors = stats.errors.filter((e) => !isSoftAvecPeripheralError(e))
      stats.warnings.push(...softPeripheral)
    }

    // Truncamento / unit-id / órfãos ficam em warnings (UI), mas não impedem status ok.
    const hardWarnings = hardAvecSyncWarnings(stats.warnings)
    const hadCoreRows =
      stats.clients_upserted +
        stats.appointments_synced +
        stats.attendances_synced +
        stats.revenue_rows +
        stats.cancellation_rows >
      0
    const status: AvecSyncRun['status'] =
      stats.errors.length > 0 && !hadCoreRows
        ? 'error'
        : stats.errors.length > 0 || hardWarnings.length > 0 || Boolean(stats.aborted)
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

    return finished
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e)
    const msg = formatAvecUserMessage(raw) ?? raw
    stats.errors.push(msg)
    return finishAvecSyncRun(run.id, 'error', stats, msg)
  } finally {
    activeSyncDeadlineAt = null
    endSyncServiceCache()
  }
}

const ISO_DAY_RE = /^\d{4}-\d{2}-\d{2}$/

export function isIsoDay(value: string): boolean {
  return ISO_DAY_RE.test(value)
}

/** 1º de janeiro do ano do dia (fuso salão via YYYY-MM-DD já local). */
export function yearStartIso(day = todayIso()): string {
  return `${day.slice(0, 4)}-01-01`
}

export interface RevenueBackfillResult {
  from: string
  to: string
  days: number
  next_from: string | null
  done: boolean
  status: AvecSyncRun['status']
  stats: AvecSyncStats
  error?: string | null
}

/**
 * Backfill de métricas diárias (receita 0088 + cancelamentos + no-shows 0248)
 * para o Financeiro comparar meses anteriores sem ficar em R$ 0.
 *
 * Aceita chunk via `chunkDays` para caber no maxDuration 300s da Vercel.
 */
export async function runAvecRevenueBackfill(opts: {
  from: string
  to?: string
  chunkDays?: number
}): Promise<RevenueBackfillResult> {
  if (!isAvecConfigured()) {
    throw new Error('Avec não configurado — defina AVEC_API_TOKEN')
  }
  if (!isIsoDay(opts.from)) {
    throw new Error(`from inválido: ${opts.from}`)
  }
  const to = opts.to ?? todayIso()
  if (!isIsoDay(to)) {
    throw new Error(`to inválido: ${to}`)
  }
  if (opts.from > to) {
    throw new Error(`from (${opts.from}) > to (${to})`)
  }

  const chunkDays = Math.max(1, Math.min(62, Math.floor(opts.chunkDays ?? 14)))
  const chunkTo = (() => {
    const end = addCalendarDaysYmd(opts.from, chunkDays - 1)
    return end < to ? end : to
  })()
  const days = listDaysInclusive(opts.from, chunkTo).length
  const next_from = chunkTo < to ? addCalendarDaysYmd(chunkTo, 1) : null

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

  const run = await beginAvecSyncRun(
    `revenue-backfill:${opts.from}:${chunkTo}`,
    stats,
  )

  try {
    await syncRevenueDateRange(stats, opts.from, chunkTo, run.id)
    await syncCancellationsDateRange(stats, opts.from, chunkTo, run.id)
    await syncNoShows0248DateRange(stats, opts.from, chunkTo, run.id)

    stats.errors = formatAvecErrorList(stats.errors)
    const hardWarnings = hardAvecSyncWarnings(stats.warnings)
    const hadRows = stats.revenue_rows + stats.cancellation_rows > 0
    const status: AvecSyncRun['status'] =
      stats.errors.length > 0 && !hadRows
        ? 'error'
        : stats.errors.length > 0 || hardWarnings.length > 0
          ? 'partial'
          : 'ok'

    const finished = await finishAvecSyncRun(run.id, status, stats)
    return {
      from: opts.from,
      to: chunkTo,
      days,
      next_from,
      done: next_from == null,
      status: finished.status,
      stats,
      error: finished.error,
    }
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e)
    const msg = formatAvecUserMessage(raw) ?? raw
    stats.errors.push(msg)
    const finished = await finishAvecSyncRun(run.id, 'error', stats, msg)
    return {
      from: opts.from,
      to: chunkTo,
      days,
      next_from,
      done: false,
      status: finished.status,
      stats,
      error: finished.error,
    }
  }
}
