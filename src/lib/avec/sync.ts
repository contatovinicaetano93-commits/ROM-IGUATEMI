import { getSql } from '@/lib/db'
import { MemoryCache } from '@/lib/cache'
import { NOVOS_WINDOW_DAYS } from '@/lib/salon/constants'
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
  clearServiceSchedule,
  clearOrphanSchedulesForDay,
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
  avecHadCoreProgress,
  resolveAvecFinishStatus,
} from '@/lib/avec/sync-finish-status'
import {
  getActiveSyncDeadlineAt,
  isSyncBudgetExhausted,
  noteSyncBudgetExhausted,
  setActiveSyncDeadlineAt,
} from '@/lib/avec/sync-budget'

export {
  getActiveSyncDeadlineAt,
  isSyncBudgetExhausted,
  noteSyncBudgetExhausted,
} from '@/lib/avec/sync-budget'
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
import { syncDirectorVisits } from '@/lib/avec/sync-director-visits'
import { getDeploymentContext } from '@/lib/deployment'
import {
  getSalonMetrics,
  upsertSalonMetrics,
} from '@/lib/salon/metrics'
import { todayIso, toSalonDateIso } from '@/lib/salon/format'
import { syncP1Kpis } from '@/lib/avec/sync-p1'
import { syncP2Kpis } from '@/lib/avec/sync-p2'
import { syncP3Kpis } from '@/lib/avec/sync-p3'
import type { RomPanelId } from '@/lib/brand'
import { avecSiteParam, getAvecUnitId } from '@/lib/brand'
import { ensureFreshAvecApiToken } from '@/lib/avec/token-store'
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

export type AvecSyncMode = 'fast' | 'full'

/**
 * Fatias do sync full — cada uma cabe no orçamento Vercel (~720s).
 * `all` = comportamento admin/legado (P1…catálogo numa única execução).
 */
export type AvecSyncStage = 'all' | 'ops' | 'agenda' | 'catalog'

/**
 * Escopo do fast: `kpi` = só caixa/cancel/noshow (webhook após ingest já
 * atualizou o contato). `all` = agenda+atendidos também (cron).
 */
export type AvecSyncScope = 'all' | 'kpi'

export function parseAvecSyncScope(value: string | null | undefined): AvecSyncScope {
  return value === 'kpi' ? 'kpi' : 'all'
}

export function parseAvecSyncStage(value: string | null | undefined): AvecSyncStage {
  if (value === 'ops' || value === 'agenda' || value === 'catalog' || value === 'all') {
    return value
  }
  return 'all'
}

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
  /** Linhas 0223 com campo tempo válido (TM cadastrado). */
  duration_rows?: number
  /** Visitas 0002 gravadas em salon_client_visits (0011 offline). */
  director_visits_upserted?: number
  /** Meses 0021 gravados em salon_director_0021_months (faturamento por pro). */
  director_0021_months_upserted?: number
  /** Fatia do full (ops/agenda/catalog/all) — min-gap por estágio. */
  stage?: AvecSyncStage
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
  // Só Avec: stock tem beginRun próprio (locks distintos).
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
        or created_at < now() - interval '14 minutes'
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
  opts?: { finishedOnly?: boolean; stage?: AvecSyncStage },
): Promise<AvecSyncRun | null> {
  const sql = getSql()
  // NÃO fazer UPDATE aqui — Relatórios/Hoje/Visão chamam isto a cada load e
  // o write no pooler (max:1) deixava os painéis em “Carregando…”.
  // Orphans são saneados em beginAvecSyncRun / abandonStaleAvecSyncRuns.
  const finishedOnly = opts?.finishedOnly === true
  const stage = opts?.stage
  if (kind && stage) {
    // Runs legados sem stats.stage contam como 'all'.
    const rows = finishedOnly
      ? ((await sql`
          select * from avec_sync_runs
          where kind = ${kind}
            and coalesce(stats->>'stage', 'all') = ${stage}
            and coalesce(stats->>'running', 'false') <> 'true'
          order by created_at desc
          limit 1
        `) as AvecSyncRun[])
      : ((await sql`
          select * from avec_sync_runs
          where kind = ${kind}
            and coalesce(stats->>'stage', 'all') = ${stage}
          order by created_at desc
          limit 1
        `) as AvecSyncRun[])
    return rows[0] ?? null
  }
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
  // Sem kind: só Avec (nunca stock_*), para Hoje/Admin não mentirem o status.
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
 * Default 14 min: budget full ≈ 12 min + margem (lock TTL 15 min).
 */
export async function abandonStaleAvecSyncRuns(maxAgeMs = 14 * 60_000): Promise<number> {
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

/** @deprecated use isSyncBudgetExhausted — alias interno legado */
function syncBudgetExhausted(): boolean {
  return isSyncBudgetExhausted()
}

function markSyncBudgetExhausted(stats: AvecSyncStats, stage: string) {
  noteSyncBudgetExhausted(stats, stage)
}

async function fetchSyncReport(
  reportId: string,
  params: Parameters<typeof fetchAllAvecReport>[1] = {},
  maxPages?: number,
) {
  return fetchAllAvecReport(reportId, params, maxPages, {
    deadlineAt: getActiveSyncDeadlineAt(),
  })
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

/** Catálogo 0004 é pesado — no máximo 1×/20h no cron (paridade Iguatemi). */
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

/** Dump / sync Avec com canal avec preso em "novo" → importado (≠ lead WhatsApp). */
async function healImportadoStatus(stats: AvecSyncStats) {
  try {
    const sql = getSql()
    // Dump/histórico/cliente Avec real → importado.
    // Órfãos operacionais (agenda/atendimento) sem avec_client_id ficam em Novos (30d).
    await sql`
      update contacts
      set status = 'importado'
      where status = 'novo'
        and channel = 'avec'
        and anonymized_at is null
        and (
          avec_client_id is not null
          or coalesce(source, '') like 'avec_sync_clients%'
          or coalesce(source, '') like 'avec_backfill%'
          or coalesce(source, '') like 'avec_lake%'
          or coalesce(source, '') like 'avec_last_done%'
          or coalesce(source, '') like 'avec_sync_returning%'
        )
    `
    // Desfaz heal antigo só para órfãos operacionais (não dump/returning/last_done),
    // limitados à janela Novos (NOVOS_WINDOW_DAYS).
    const restored = await sql`
      update contacts
      set status = 'novo'
      where status = 'importado'
        and channel = 'avec'
        and avec_client_id is null
        and anonymized_at is null
        and coalesce(source, '') not like 'avec_sync_clients%'
        and coalesce(source, '') not like 'avec_backfill%'
        and coalesce(source, '') not like 'avec_lake%'
        and coalesce(source, '') not like 'avec_last_done%'
        and coalesce(source, '') not like 'avec_sync_returning%'
        and created_at >= ((current_timestamp at time zone 'America/Sao_Paulo')::date - (${NOVOS_WINDOW_DAYS}::int - 1))::timestamp at time zone 'America/Sao_Paulo'
      returning id
    `
    const n = Array.isArray(restored) ? restored.length : 0
    if (n > 0) {
      stats.warnings.push(`heal importado: ${n} órfão(s) operacionais restaurado(s) para Novos`)
    }
    MemoryCache.deletePrefix('contacts:novos:')
    MemoryCache.deletePrefix('contacts:queue-counts:')
  } catch (e) {
    stats.warnings.push(`heal importado: ${e instanceof Error ? e.message : String(e)}`)
  }
}

async function syncClients(stats: AvecSyncStats, syncRunId?: string) {
  try {
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
  // Fast: ontem → amanhã — Hoje/KPI + operação do dia seguinte.
  // Semana (+7 Contatos Agendados) e horizonte +21d ficam no full/agenda —
  // no BR a janela de 7d estourava o orçamento e abortava reconcile/KPI.
  const range = mode === 'fast' ? periodRange(1, 1) : periodRange(1, 21)
  // 0051: site = origem Online/Local ("" = todos). Unidade vem do token (salon_id).
  const params = { ...range, site: '', profissional_id: '', limit: 250 }
  const result = await fetchSyncReport('0051', params)
  warnIfTruncated(stats, '0051', result)
  // Snapshot pesado só no full — no fast o payload 0051 come budget sem valor operacional.
  if (mode === 'full') {
    await snapshotReport('0051', params, result.rows, stats, syncRunId)
  }

  const today = todayIso()
  const yesterday = addCalendarDaysYmd(today, -1)
  const upsertInBatch = createBatchContactUpserter()
  /** Serviços que devem permanecer abertos hoje (Agendado/Aguardando/Em Atendimento). */
  const todayOpenServiceIds: string[] = []
  /** Agendados por dia = cabeças (contato único), não linhas 0051. */
  const bookedHeadsByDay = new Map<string, Set<string>>()
  const rowsByDay = new Map<string, number>()

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

      if (apptDay) {
        rowsByDay.set(apptDay, (rowsByDay.get(apptDay) ?? 0) + 1)
      }

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
        status: isPaid ? 'convertido' : isLostOutcome ? undefined : 'agendado',
      })
      // Tombstone LGPD: upsert casa no id, mas não reescreve serviços/prefs/PII.
      if (contact.anonymized_at) {
        stats.appointments_synced++
        continue
      }

      // Cabeça do dia: 1 contato com ≥1 linha aberta/paga (ignora cancel/no-show).
      if (apptDay && !isCancelled && !isNoShow && !isNegativeOutcome) {
        let heads = bookedHeadsByDay.get(apptDay)
        if (!heads) {
          heads = new Set()
          bookedHeadsByDay.set(apptDay, heads)
        }
        heads.add(contact.id)
      }

      if (serviceName && scheduledAt) {
        const service = await findOrCreateService(contact.id, serviceName)
        const isNew = servicesCreatedRecently(service)
        if (isNew) stats.services_created++

        // 0051 status Pago = comanda fechada → Concluídos no Pipeline (paridade IG).
        if (isPaid) {
          await markServiceDone(service.id, {
            doneAt: scheduledAt,
            professionalName: appt.professional,
            lastPrice: appt.price,
          })
          stats.services_completed++
        } else if (isLostOutcome) {
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

  // Reconcilia órfãos de hoje + KPI Agendados por dia (hoje/ontem + dias com linha).
  // Truncado/abort: keep-set incompleto — não limpar nem gravar KPI parcial.
  try {
    if (result.truncated || stats.aborted) {
      stats.warnings.push(
        stats.aborted
          ? 'agenda: reconcile/KPI adiado — sync abortou no orçamento (keep-set incompleto)'
          : 'agenda: reconcile/KPI adiado — 0051 truncado (keep-set incompleto)',
      )
    } else {
      if ((rowsByDay.get(today) ?? 0) > 0) {
        const cleared = await clearOrphanSchedulesForDay(today, todayOpenServiceIds)
        if (cleared > 0) {
          stats.warnings.push(`agenda: ${cleared} agendamento(s) órfão(s) removido(s) do dia`)
        }
      }
      // Só hoje + ontem: evita insert de dias futuros com revenue=0 (ruído em Relatórios).
      // Contatos Agendados usa client_services, não este KPI.
      for (const day of [today, yesterday]) {
        await upsertSalonMetrics(day, {
          appointments: bookedHeadsByDay.get(day)?.size ?? 0,
        })
      }
    }
  } catch (e) {
    stats.errors.push(`agenda reconcile: ${e instanceof Error ? e.message : String(e)}`)
  }
}

function servicesCreatedRecently(service: { created_at: string }) {
  return Date.now() - new Date(service.created_at).getTime() < 5000
}

/** True quando syncAttendances já gravou mix (+ last_done no full) — evita 2º fetch 0002. */
let attendancesCoveredReturning = false

async function syncAttendances(stats: AvecSyncStats, mode: AvecSyncMode, syncRunId?: string) {
  const today = todayIso()
  // Uma janela serve attendances + returning (colapsa duplo 0002 no budget).
  // Fast: ontem+hoje (é o que gravamos em mix). Full: 90d (last_done histórico).
  // Antes o fast puxava MTD inteiro só para escrever 2 dias — caro no BR.
  const fetchFrom =
    mode === 'fast' ? addCalendarDaysYmd(today, -1) : addCalendarDaysYmd(today, -90)
  const attendanceFrom = mode === 'fast' ? today : addCalendarDaysYmd(today, -7)
  const params = {
    inicio: isoToBr(fetchFrom),
    fim: isoToBr(today),
    site: avecSiteParam(),
    como_conheceu: '',
    limit: 250,
  }
  const result = await fetchSyncReport('0002', params)
  warnIfTruncated(stats, '0002', result)
  await snapshotReport('0002', params, result.rows, stats, syncRunId)

  const upsertInBatch = createBatchContactUpserter()
  /** Mix do dia (Cérebro NOVOS·RECORRENTES): 0002 total_visitas na ultima_visita. */
  const returningByDay = new Map<string, number>()
  const newByDay = new Map<string, number>()
  let durationSumMinutes = 0
  let durationCount = 0

  for (const row of result.rows) {
    if (syncBudgetExhausted()) {
      markSyncBudgetExhausted(stats, 'attendances')
      break
    }
    try {
      const att = normalizeAttendanceRow(row)
      if (!att) continue

      const visitDay = att.lastVisitDay
      const visits = att.totalVisits
      if (visitDay && visits != null) {
        if (visits > 1) {
          returningByDay.set(visitDay, (returningByDay.get(visitDay) ?? 0) + 1)
        } else if (visits === 1) {
          newByDay.set(visitDay, (newByDay.get(visitDay) ?? 0) + 1)
        }
      }

      const attendedDay = att.attendedAt ? toSalonDateIso(att.attendedAt) : visitDay
      if (!attendedDay || attendedDay < attendanceFrom || attendedDay > today) continue

      // TM do dia: duração real 0002 (início+fim) — 0223 é catálogo sem data.
      if (att.durationMinutes != null && att.attendedAt && toSalonDateIso(att.attendedAt) === today) {
        durationSumMinutes += att.durationMinutes
        durationCount++
      }

      if (!att.avecClientId && !att.phone) {
        stats.warnings.push('atendimento: linha sem avec_client_id e sem telefone — ignorada')
        continue
      }

      const contact = await upsertInBatch({
        avecClientId: att.avecClientId ?? undefined,
        name: att.clientName,
        phone: att.phone,
        channel: 'avec',
        source: mode === 'fast' ? 'avec_sync_attended_fast' : 'avec_sync_attended',
      })

      if (contact.anonymized_at) {
        stats.attendances_synced++
        continue
      }

      await updateContact(contact.id, { status: 'convertido' })

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

  // TM + mix só em dump completo (truncado/abort → não sobrescreve com amostra).
  if (result.truncated || stats.aborted) {
    stats.warnings.push(
      stats.aborted
        ? 'mix 0002: abort no orçamento — novos/recorrentes/TM não atualizados (evita zerar)'
        : 'mix 0002: truncado — novos/recorrentes/TM não atualizados (evita zerar)',
    )
  } else {
    if (durationCount > 0) {
      await upsertSalonMetrics(today, {
        service_duration_sum_minutes: durationSumMinutes,
        service_duration_count: durationCount,
      })
    }
    if (mode === 'fast') {
      // Fast 0002 cobre ontem+hoje — gravar mix dos dois dias (não só today).
      for (const day of [addCalendarDaysYmd(today, -1), today]) {
        await upsertSalonMetrics(day, {
          new_clients: newByDay.get(day) ?? 0,
          returning_clients: returningByDay.get(day) ?? 0,
        })
      }
    } else {
      const days = listDaysInclusive(addCalendarDaysYmd(today, -7), today)
      for (const day of days) {
        await upsertSalonMetrics(day, {
          new_clients: newByDay.get(day) ?? 0,
          returning_clients: returningByDay.get(day) ?? 0,
        })
      }
      // last_done histórico (só full; fast já marca done no loop de attendances do dia).
      for (const row of result.rows) {
        try {
          const att = normalizeAttendanceRow(row)
          if (!att?.lastVisitDay || (att.totalVisits ?? 0) <= 1) continue
          if (!att.avecClientId && !att.phone) {
            stats.warnings.push('recorrentes 0002: linha sem avec_client_id e sem telefone — ignorada')
            continue
          }
          const day = att.lastVisitDay
          const contact = await upsertContact({
            avecClientId: att.avecClientId ?? undefined,
            name: att.clientName,
            phone: att.phone,
            channel: 'avec',
            source: 'avec_sync_returning_0002',
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

/** Hoje primeiro — se o budget estourar, prioriza KPI do dia corrente. */
function listDaysNewestFirst(fromIso: string, toIso: string): string[] {
  return listDaysInclusive(fromIso, toIso).reverse()
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
 * Faturamento dia a dia.
 * Fast: hoje + ontem (corrige atraso do relatório).
 * Full: últimos 7 dias + hoje (mesmo padrão do 0081).
 * Override: AVEC_REVENUE_DAYS_BACK=N (ex.: mês incompleto).
 * Sempre grava a linha do dia (mesmo receita 0) para Relatórios não marcar gap.
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
  const daysBack = revenueDaysBack(mode)
  const from = addCalendarDaysYmd(today, -daysBack)
  const days = listDaysNewestFirst(from, today)

  for (const day of days) {
    if (syncBudgetExhausted()) {
      markSyncBudgetExhausted(stats, 'revenue')
      break
    }
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
      // 0 preenche dia passado fechado; não zera métricas já gravadas se o payload veio vazio.
      if (revenueRounded === 0 && attendedInt === 0) {
        const existing = await getSalonMetrics(day)
        if (existing && (Number(existing.revenue) > 0 || Number(existing.attended) > 0)) {
          continue
        }
        // Hoje: 0088 vazio de manhã ≠ caixa fechado em R$0 — mantém NULL (UI "—").
        if (day === today) {
          stats.warnings.push(
            `receita ${day}: 0088 vazio — não grava R$0 (caixa do dia ainda não lançou)`,
          )
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
 * Cancelamentos / no-shows dia a dia (mesmo backfill do faturamento).
 */
async function syncCancellations(
  stats: AvecSyncStats,
  mode: AvecSyncMode,
  syncRunId?: string,
) {
  const today = todayIso()
  const daysBack = mode === 'fast' ? 1 : 7
  const from = addCalendarDaysYmd(today, -daysBack)
  await syncCancellationsRange(from, today, stats, syncRunId)
}

/**
 * Cancelamentos (0052) dia a dia em [from, to] — usado no sync diário e no backfill analítico.
 */
export async function syncCancellationsRange(
  from: string,
  to: string,
  stats: AvecSyncStats,
  syncRunId?: string,
  // Mantido p/ callers de backfill — sync diário já grava cancelled=0 sempre (paridade IG).
  _opts?: { zeroEmptyDays?: boolean },
) {
  const def = getDailyReports().find((r) => r.mapper === 'cancellations')
  if (!def) return

  let reportId = resolveReportId(def)
  if (!reportId && isAvecMock()) reportId = 'cancellations'
  if (!reportId) {
    stats.warnings.push('AVEC_REPORT_CANCELLATIONS não configurado — cancelamentos pulados')
    return
  }

  const days = listDaysNewestFirst(from, to)

  for (const day of days) {
    if (syncBudgetExhausted()) {
      markSyncBudgetExhausted(stats, 'cancellations')
      break
    }
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

      // Cabeças (DISTINCT cliente) — rates vs Agendados; orphan rows sem id somam 1.
      const cancelledHeads = new Set<string>()
      let cancelledOrphans = 0
      for (const row of result.rows) {
        const c = normalizeCancellationRow(row)
        if (!c) continue
        stats.cancellation_rows++
        if (!c.day || c.day === day) {
          if (c.cancelled <= 0) continue
          if (c.avecClientId) cancelledHeads.add(c.avecClientId)
          else cancelledOrphans += c.cancelled
        }
      }
      const cancelled = cancelledHeads.size + cancelledOrphans

      // Sempre grava cancelled (inclui 0) — paridade IG; evita KPI stale em dias vazios.
      await upsertSalonMetrics(day, { cancelled })
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
  await syncNoShows0248Range(from, today, stats, syncRunId)
}

/**
 * No-shows 0248 no intervalo [from, to].
 * Zera no_shows em todo dia do intervalo sem falta (paridade IG).
 */
export async function syncNoShows0248Range(
  from: string,
  to: string,
  stats: AvecSyncStats,
  syncRunId?: string,
  // Mantido p/ callers de backfill — sync diário já zera o range inteiro (paridade IG).
  _opts?: { zeroTodayIfEmpty?: boolean; zeroEmptyDays?: boolean },
) {
  if (syncBudgetExhausted()) {
    markSyncBudgetExhausted(stats, 'no-shows-0248')
    return
  }
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

    // Cabeças por dia (DISTINCT cliente_id); orphan sem id soma 1.
    const byDay = new Map<string, Set<string>>()
    const orphansByDay = new Map<string, number>()
    for (const row of result.rows) {
      const appt = normalizeAppointmentRow(row)
      const day =
        (appt?.scheduledAt ? toSalonDateIso(appt.scheduledAt) : null) ??
        (typeof row.data === 'string'
          ? toSalonDateIso(parseAvecDateTime(String(row.data)))
          : null)
      if (!day) continue
      // Endpoint já filtrado por status=0.6 (Faltou).
      if (appt?.avecClientId) {
        let set = byDay.get(day)
        if (!set) {
          set = new Set()
          byDay.set(day, set)
        }
        set.add(appt.avecClientId)
      } else {
        orphansByDay.set(day, (orphansByDay.get(day) ?? 0) + 1)
      }
    }

    const daysWithNoshow = new Set([...byDay.keys(), ...orphansByDay.keys()])
    for (const day of daysWithNoshow) {
      const no_shows = (byDay.get(day)?.size ?? 0) + (orphansByDay.get(day) ?? 0)
      if (syncBudgetExhausted()) {
        markSyncBudgetExhausted(stats, 'no-shows-0248 upsert')
        break
      }
      await upsertSalonMetrics(day, { no_shows })
    }

    // Zera dias do intervalo sem falta (paridade IG; limpa stale após correção Avec).
    for (const day of listDaysNewestFirst(from, to)) {
      if (syncBudgetExhausted()) {
        markSyncBudgetExhausted(stats, 'no-shows-0248 zero')
        break
      }
      if (!daysWithNoshow.has(day)) {
        await upsertSalonMetrics(day, { no_shows: 0 })
      }
    }
  } catch (e) {
    stats.errors.push(`no-show 0248: ${e instanceof Error ? e.message : String(e)}`)
  }
}

/**
 * Fallback se attendances foi pulado (budget) — senão no-op (dump já colapsado).
 */
async function syncReturningFrom0002(
  stats: AvecSyncStats,
  mode: AvecSyncMode,
  syncRunId?: string,
) {
  // Só pula se o dump 0002 já gravou mix. Truncado/abort NÃO seta
  // attendancesCoveredReturning — o fallback ainda precisa rodar.
  if (attendancesCoveredReturning) return
  if (syncBudgetExhausted()) {
    markSyncBudgetExhausted(stats, 'recorrentes 0002')
    return
  }
  // Attendances não rodou: fetch mínimo ontem+hoje (fast) / 7d metrics (full sem last_done 90d).
  const today = todayIso()
  const from = mode === 'fast' ? addCalendarDaysYmd(today, -1) : addCalendarDaysYmd(today, -7)
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
    const newByDay = new Map<string, number>()
    for (const row of result.rows) {
      const att = normalizeAttendanceRow(row)
      if (!att?.lastVisitDay || att.totalVisits == null) continue
      if (att.totalVisits > 1) {
        returningByDay.set(att.lastVisitDay, (returningByDay.get(att.lastVisitDay) ?? 0) + 1)
      } else if (att.totalVisits === 1) {
        newByDay.set(att.lastVisitDay, (newByDay.get(att.lastVisitDay) ?? 0) + 1)
      }
    }
    if (mode === 'fast') {
      for (const day of [addCalendarDaysYmd(today, -1), today]) {
        await upsertSalonMetrics(day, {
          new_clients: newByDay.get(day) ?? 0,
          returning_clients: returningByDay.get(day) ?? 0,
        })
      }
    } else {
      for (const day of listDaysInclusive(from, today)) {
        await upsertSalonMetrics(day, {
          new_clients: newByDay.get(day) ?? 0,
          returning_clients: returningByDay.get(day) ?? 0,
        })
      }
    }
    attendancesCoveredReturning = true
  } catch (e) {
    stats.errors.push(`recorrentes 0002: ${e instanceof Error ? e.message : String(e)}`)
  }
}

/**
 * TM atendimento — 0223 (`tempo`) é catálogo sem filtro de data.
 * Não grava como KPI do dia (fonte: 0002 com duração real). Snapshot só no full.
 */
async function syncDurationFrom0223(
  stats: AvecSyncStats,
  mode: AvecSyncMode,
  syncRunId?: string,
) {
  if (mode !== 'full') return
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

export async function runAvecSync(
  mode: AvecSyncMode = 'full',
  opts?: { stage?: AvecSyncStage; scope?: AvecSyncScope },
): Promise<AvecSyncRun> {
  const stage: AvecSyncStage = mode === 'full' ? (opts?.stage ?? 'all') : 'all'
  const scope: AvecSyncScope = mode === 'fast' ? (opts?.scope ?? 'all') : 'all'
  // Locks separados: full/ops às 10:20 não deve matar o fast de :25 (Hoje).
  // Estágios full ainda compartilham avecFull (evita duas fatias no mesmo DB).
  const lockKey = mode === 'fast' ? SYNC_LOCK_KEYS.avecFast : SYNC_LOCK_KEYS.avecFull
  return withSyncLock(lockKey, () => runAvecSyncUnlocked(mode, stage, scope), {
    // maxDuration route = 800s — lease precisa sobreviver a lambda ainda viva.
    ttlMs: 15 * 60 * 1000,
    owner:
      mode === 'fast' && scope === 'kpi'
        ? 'avec-fast-kpi'
        : stage === 'all'
          ? `avec-${mode}`
          : `avec-${mode}-${stage}`,
  })
}

async function runAvecSyncUnlocked(
  mode: AvecSyncMode,
  stage: AvecSyncStage,
  scope: AvecSyncScope,
): Promise<AvecSyncRun> {
  if (!isAvecConfigured()) {
    throw new Error('Avec não configurado — defina AVEC_API_TOKEN')
  }

  // JWT ~12h: renova antes do primeiro report (evita 401 + banner "token expirado").
  await ensureFreshAvecApiToken({ minHoursLeft: 1 }).catch(() => {
    // sync continua — fetchAvecReport ainda tenta force-refresh no 401
  })

  const deployment = getDeploymentContext()
  const runOps = mode === 'full' && (stage === 'all' || stage === 'ops')
  const runAgenda = mode === 'full' && (stage === 'all' || stage === 'agenda')
  const runCatalog = mode === 'full' && (stage === 'all' || stage === 'catalog')

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
    stage: mode === 'full' ? stage : undefined,
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
  setActiveSyncDeadlineAt(Date.now() + AVEC_SYNC_BUDGET_MS)
  attendancesCoveredReturning = false

  try {
    // Catalog-only: se o dump 0004 já rodou nas últimas 20h, evita heal+lock pesado
    // (cron 2×/dia ainda acorda a fatia — sai cedo com purge leve).
    if (runCatalog && !runOps && !runAgenda) {
      const dumpClients = await shouldSyncClientCatalog()
      if (!dumpClients) {
        stats.warnings.push(
          'Catálogo 0004 adiado — já sincronizado nas últimas 20h (DB leve; force com AVEC_SYNC_CLIENTS=1)',
        )
        try {
          await purgeAvecStorageBloat({ keepSnapshotDays: 0, keepSyncRunDays: 2 })
        } catch {
          /* ignore */
        }
        const finished = await finishAvecSyncRun(run.id, 'ok', stats)
        await logEvent({
          contactId: null,
          channel: 'avec',
          direction: 'in',
          handledBy: 'system',
          payload: { avec_sync: stats, status: 'ok', mode },
        })
        return finished
      }
    }

    await healImportadoStatus(stats)
    // Catálogo 0004 só depois do core (P1/agenda/caixa) — não pode comer o budget primeiro.
    if (mode === 'fast') {
      // Caixa PRIMEIRO e sozinho — se o cron estourar maxDuration depois,
      // o faturamento de Hoje já está gravado (antes ficava 0 com sync morto).
      await syncRevenue(stats, mode, syncRunId)
      await checkpointAvecSyncRun(syncRunId, stats).catch(() => {})
      if (!syncBudgetExhausted()) {
        await Promise.all([
          syncCancellations(stats, mode, syncRunId),
          syncNoShows0248(stats, mode, syncRunId),
        ])
        await checkpointAvecSyncRun(syncRunId, stats).catch(() => {})
      } else {
        markSyncBudgetExhausted(stats, 'após revenue')
      }
      // Webhook: ingest já agendou/concluiu o contato — só precisa caixa/KPI.
      // Cron fast (scope=all) ainda reconcilia agenda/atendidos.
      if (scope === 'all') {
        // Sequencial: agenda e atendidos compartilham phones — Promise.all
        // gerava corrida em contacts_phone_idx (partial com duplicate key).
        if (!syncBudgetExhausted()) {
          await syncAppointments(stats, mode, syncRunId)
          await checkpointAvecSyncRun(syncRunId, stats).catch(() => {})
        } else {
          markSyncBudgetExhausted(stats, 'antes de appointments')
        }
        if (!syncBudgetExhausted()) {
          await syncAttendances(stats, mode, syncRunId)
        } else {
          markSyncBudgetExhausted(stats, 'antes de attendances')
        }
      } else {
        stats.warnings.push(
          'fast/kpi: agenda/atendidos pulados — webhook já aplicou o contato (cron reconcilia)',
        )
      }
    } else {
      // Full fatiado: ops (P1–P3/TM) → agenda (caixa) → catalog (0004).
      // Cada fatia tem cron próprio — cabe no orçamento sem abortar o core.
      const opsSteps = [
        ['P1', () => syncP1Kpis(stats, syncRunId)],
        ['P2', () => syncP2Kpis(stats, syncRunId)],
        ['P3', () => syncP3Kpis(stats, syncRunId)],
        ['tm-0223', () => syncDurationFrom0223(stats, mode, syncRunId)],
      ] as const
      // director-visits primeiro: o Relatório gerência depende disso e o budget
      // do full/agenda costuma esgotar antes do bloco no fim do sync.
      const agendaSteps = [
        ['director-visits', () => syncDirectorVisits(stats, syncRunId, { shouldAbort: () => syncBudgetExhausted() })],
        ['appointments', () => syncAppointments(stats, mode, syncRunId)],
        ['attendances', () => syncAttendances(stats, mode, syncRunId)],
        ['revenue', () => syncRevenue(stats, mode, syncRunId)],
        ['cancellations', () => syncCancellations(stats, mode, syncRunId)],
        ['no-shows-0248', () => syncNoShows0248(stats, mode, syncRunId)],
      ] as const
      const steps = [
        ...(runOps ? opsSteps : []),
        ...(runAgenda ? agendaSteps : []),
      ]
      for (const [label, fn] of steps) {
        if (syncBudgetExhausted()) {
          markSyncBudgetExhausted(stats, `antes de ${label}`)
          break
        }
        try {
          await fn()
        } catch (e) {
          stats.errors.push(`${label}: ${e instanceof Error ? e.message : String(e)}`)
        }
        await checkpointAvecSyncRun(syncRunId, stats).catch(() => {})
      }
    }
    // Não rodar recomputeSalonMetricsFromRom aqui: ele sobrescrevia Agendados (0051)
    // e, antes, zerava novos (count orgânico). Mix/agenda vêm do 0002/0051 acima.
    // Webhook ainda chama recompute para feedback imediato até o fast sync.
    // Returning: no-op se attendances já cobriu; senão fallback.
    // Com abort: não dispara 0002 extra — Hoje já tem caixa/agenda do checkpoint.
    if (
      (mode === 'fast' ? scope === 'all' : runAgenda) &&
      !syncBudgetExhausted()
    ) {
      try {
        await syncReturningFrom0002(stats, mode, syncRunId)
      } catch (e) {
        stats.errors.push(`recorrentes 0002: ${e instanceof Error ? e.message : String(e)}`)
      }
    }

    // director-visits já roda como 1º passo do full/agenda (acima).

    if (runCatalog) {
      if (!syncBudgetExhausted()) {
        const dumpClients = await shouldSyncClientCatalog()
        if (dumpClients) {
          await syncClients(stats, syncRunId)
        } else {
          stats.warnings.push(
            'Catálogo 0004 adiado — já sincronizado nas últimas 20h (DB leve; force com AVEC_SYNC_CLIENTS=1)',
          )
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
    const hadCoreRows = avecHadCoreProgress(stats)
    const status = resolveAvecFinishStatus({
      errorCount: stats.errors.length,
      hardWarningCount: hardWarnings.length,
      aborted: Boolean(stats.aborted),
      hadCoreRows,
    })

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
    const status = resolveAvecFinishStatus({
      errorCount: stats.errors.length,
      hardWarningCount: 0,
      aborted: Boolean(stats.aborted),
      hadCoreRows: avecHadCoreProgress(stats),
      thrown: true,
    })
    return finishAvecSyncRun(run.id, status, stats, msg)
  } finally {
    setActiveSyncDeadlineAt(null)
    endSyncServiceCache()
  }
}
