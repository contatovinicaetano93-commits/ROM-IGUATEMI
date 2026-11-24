import { fetchAllAvecReport } from '@/lib/avec/client'
import {
  normalizeAttendanceRow,
  parseAvecDateTime,
  defaultCadenceDaysForServiceName,
  guessServiceCategory,
  isCadencePlaceholderServiceName,
} from '@/lib/avec/normalize'
import { upsertContact } from '@/lib/contacts'
import { getSql } from '@/lib/db'
import {
  listServices,
  addService,
  ensureServiceCadence,
  clearServiceCadence,
  recordServiceVisit,
  type ClientService,
} from '@/lib/services'
import { todayIso, toSalonDateIso } from '@/lib/salon/format'

export type LastDoneBackfillStats = {
  rows_seen: number
  contacts_touched: number
  services_filled: number
  services_skipped_has_done: number
  visits_recorded: number
  errors: string[]
  from: string
  to: string
  truncated: boolean
  /** Próximo `resumeFrom` se `maxChunks` cortou o loop. */
  next_resume_from: string | null
  chunks_done: number
}

function isoToBr(isoYmd: string): string {
  const [y, m, d] = isoYmd.split('-')
  if (!y || !m || !d) return isoYmd
  return `${d}/${m}/${y}`
}

function shiftYmd(ymd: string, deltaDays: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const dt = new Date(Date.UTC(y!, m! - 1, d!))
  dt.setUTCDate(dt.getUTCDate() + deltaDays)
  return dt.toISOString().slice(0, 10)
}

async function recordVisitForDay(
  service: ClientService,
  visitDoneAt: string,
  opts: { professionalName?: string | null; lastPrice?: number | null },
) {
  await recordServiceVisit({
    contactId: service.contact_id,
    clientServiceId: service.id,
    serviceName: service.name,
    category: service.category,
    doneAt: visitDoneAt,
    professionalName: opts.professionalName ?? service.professional_name,
    price: opts.lastPrice ?? null,
    source: 'avec',
  })
}

/**
 * Grava last_done_at a partir de ultima_visita (0002) — só data real da Avec.
 * - Não inventa visita: exige visitDayYmd do relatório.
 * - Só sobe last_done_at se null OU o dia da Avec é mais recente (data SP).
 * - Com recordVisit: grava client_service_visits mesmo quando last_done não sobe
 *   (fatias antigas no backfill de 2 anos).
 * - Não dispara aftercare nem limpa agenda futura.
 * Hora: 12:00 local quando a Avec só manda a data (granularidade dia — cadência usa dias).
 */
export async function applyVisitDayToService(
  serviceId: string,
  visitDayYmd: string,
  opts: {
    professionalName?: string | null
    lastPrice?: number | null
    /** Grava linha em client_service_visits (idempotente por dia SP). */
    recordVisit?: boolean
  } = {},
): Promise<'filled' | 'skipped' | 'missing'> {
  const doneAt = parseAvecDateTime(visitDayYmd, '12:00')
  if (!doneAt) return 'missing'

  const sql = getSql()
  const rows = (await sql`
    update client_services set
      last_done_at = case
        when last_done_at is null then ${doneAt}::timestamptz
        when (${doneAt}::timestamptz at time zone 'America/Sao_Paulo')::date
          > (last_done_at at time zone 'America/Sao_Paulo')::date
          then ${doneAt}::timestamptz
        else last_done_at
      end,
      professional_name = coalesce(${opts.professionalName ?? null}, professional_name),
      last_price = coalesce(${opts.lastPrice ?? null}, last_price)
    where id = ${serviceId}
      and (
        last_done_at is null
        or (${doneAt}::timestamptz at time zone 'America/Sao_Paulo')::date
          > (last_done_at at time zone 'America/Sao_Paulo')::date
      )
    returning *
  `) as ClientService[]

  let service: ClientService | undefined = rows[0]
  const outcome: 'filled' | 'skipped' = rows.length > 0 ? 'filled' : 'skipped'

  if (!service) {
    const existing = (await sql`
      select * from client_services where id = ${serviceId} limit 1
    `) as ClientService[]
    service = existing[0]
  }
  if (!service) return 'missing'

  if (opts.recordVisit) {
    await recordVisitForDay(service, doneAt, opts)
  }
  return outcome
}

async function findOrCreateServiceForBackfill(contactId: string, serviceName: string) {
  const services = await listServices(contactId)
  const match = services.find((s) => s.name.toLowerCase() === serviceName.toLowerCase())
  const cadenceDays = defaultCadenceDaysForServiceName(serviceName)
  if (match) {
    if (isCadencePlaceholderServiceName(serviceName)) {
      if (match.cadence_days != null) {
        const cleared = await clearServiceCadence(match.id)
        return cleared ?? { ...match, cadence_days: null }
      }
      return match
    }
    if (match.cadence_days == null && cadenceDays != null) {
      const patched = await ensureServiceCadence(match.id, cadenceDays)
      return patched ?? match
    }
    return match
  }
  return addService(contactId, {
    name: serviceName,
    category: guessServiceCategory(serviceName),
    cadenceDays,
  })
}

/**
 * Avec 0002 rejeita janela ≥ 365 dias por request ("inferior a 365 dias").
 * O total do backfill pode passar disso via fatias — teto = 2 anos.
 */
export const LAST_DONE_BACKFILL_MAX_DAYS = 730
/** Fatias menores = mais pontos de visita no histórico (ultima_visita por fatia). */
const DEFAULT_CHUNK_DAYS = 30
/** Upserts DB em paralelo por fatia (evento loop single-thread — ++ em stats é seguro). */
const DEFAULT_ROW_CONCURRENCY = 10

function visitDayFromAttendance(att: {
  lastVisitDay: string | null
  attendedAt: string | null
}): string | null {
  if (att.lastVisitDay) return att.lastVisitDay
  if (att.attendedAt) return toSalonDateIso(att.attendedAt)
  return null
}

/**
 * One-shot / admin: percorre 0002 e preenche last_done_at + client_service_visits.
 * Janelas longas são fatiadas (chunkDays) — a Avec limita cada request a <365 dias.
 * Use maxChunks + resumeFrom para rodar 2 anos sem estourar maxDuration.
 */
export async function runLastDoneBackfill(opts?: {
  daysBack?: number
  maxPages?: number
  /** Tamanho de cada fatia Avec (7–180, default 30). */
  chunkDays?: number
  /** Paralelismo de upsert por fatia (1–20, default 10). */
  rowConcurrency?: number
  /** Grava histórico em client_service_visits (default true). */
  recordVisit?: boolean
  /** Limite de fatias nesta invocação (resume). */
  maxChunks?: number
  /** Retoma a partir deste fim de fatia (YYYY-MM-DD, inclusive). */
  resumeFrom?: string
}): Promise<LastDoneBackfillStats> {
  const daysBack = Math.min(
    Math.max(opts?.daysBack ?? 730, 7),
    LAST_DONE_BACKFILL_MAX_DAYS,
  )
  const chunkDays = Math.min(Math.max(opts?.chunkDays ?? DEFAULT_CHUNK_DAYS, 7), 180)
  const rowConcurrency = Math.min(
    Math.max(opts?.rowConcurrency ?? DEFAULT_ROW_CONCURRENCY, 1),
    20,
  )
  const recordVisit = opts?.recordVisit !== false
  const maxChunks =
    opts?.maxChunks != null && Number.isFinite(opts.maxChunks)
      ? Math.max(1, Math.floor(opts.maxChunks))
      : null

  const today = todayIso()
  const from = shiftYmd(today, -daysBack)
  const maxPagesPerChunk = opts?.maxPages ?? 80

  const stats: LastDoneBackfillStats = {
    rows_seen: 0,
    contacts_touched: 0,
    services_filled: 0,
    services_skipped_has_done: 0,
    visits_recorded: 0,
    errors: [],
    from,
    to: today,
    truncated: false,
    next_resume_from: null,
    chunks_done: 0,
  }

  // Fatias do presente para o passado; apply só sobe last_done_at se a data for mais nova.
  let chunkEnd =
    opts?.resumeFrom && /^\d{4}-\d{2}-\d{2}$/.test(opts.resumeFrom)
      ? opts.resumeFrom < today
        ? opts.resumeFrom
        : today
      : today

  while (chunkEnd >= from) {
    if (maxChunks != null && stats.chunks_done >= maxChunks) {
      stats.next_resume_from = chunkEnd
      break
    }

    let chunkStart = shiftYmd(chunkEnd, -(chunkDays - 1))
    if (chunkStart < from) chunkStart = from

    const params = {
      inicio: isoToBr(chunkStart),
      fim: isoToBr(chunkEnd),
      como_conheceu: '',
      limit: 250,
    }
    console.info(
      `[last-done-backfill] fatia ${params.inicio}→${params.fim} (maxPages=${maxPagesPerChunk})`,
    )
    try {
      const result = await fetchAllAvecReport('0002', params, maxPagesPerChunk)
      if (result.truncated) stats.truncated = true
      console.info(
        `[last-done-backfill] fatia ok rows=${result.rows.length} truncated=${Boolean(result.truncated)}`,
      )

      let next = 0
      const workers = Array.from({ length: rowConcurrency }, async () => {
        while (true) {
          const i = next++
          if (i >= result.rows.length) break
          const att = normalizeAttendanceRow(result.rows[i]!)
          const visitDay = att ? visitDayFromAttendance(att) : null
          if (!visitDay) continue
          stats.rows_seen++
          try {
            const contact = await upsertContact({
              avecClientId: att!.avecClientId ?? undefined,
              name: att!.clientName,
              phone: att!.phone,
              channel: 'avec',
              source: 'avec_last_done_backfill',
            })
            if (contact.anonymized_at) continue
            stats.contacts_touched++
            const serviceName = att!.serviceName || 'Atendimento'
            const service = await findOrCreateServiceForBackfill(contact.id, serviceName)
            const outcome = await applyVisitDayToService(service.id, visitDay, {
              professionalName: att!.professional,
              lastPrice: att!.price,
              recordVisit,
            })
            if (outcome === 'filled') stats.services_filled++
            else if (outcome === 'skipped') stats.services_skipped_has_done++
            if (recordVisit) stats.visits_recorded++
          } catch (e) {
            if (stats.errors.length < 30) {
              stats.errors.push(e instanceof Error ? e.message : String(e))
            }
          }
        }
      })
      await Promise.all(workers)
      console.info(
        `[last-done-backfill] fatia gravada filled=${stats.services_filled} skipped=${stats.services_skipped_has_done} visits=${stats.visits_recorded} seen=${stats.rows_seen}`,
      )
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error(`[last-done-backfill] fatia falhou ${params.inicio}→${params.fim}: ${msg}`)
      if (stats.errors.length < 30) stats.errors.push(`fatia ${params.inicio}→${params.fim}: ${msg}`)
    }

    stats.chunks_done++
    if (chunkStart <= from) break
    chunkEnd = shiftYmd(chunkStart, -1)
  }

  return stats
}
