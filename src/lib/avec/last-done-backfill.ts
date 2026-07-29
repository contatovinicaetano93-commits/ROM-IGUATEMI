import { fetchAllAvecReport } from '@/lib/avec/client'
import {
  normalizeAttendanceRow,
  parseAvecDateTime,
  defaultCadenceDaysForServiceName,
  guessServiceCategory,
} from '@/lib/avec/normalize'
import { upsertContact } from '@/lib/contacts'
import { getSql } from '@/lib/db'
import { listServices, addService, ensureServiceCadence } from '@/lib/services'
import { todayIso } from '@/lib/salon/format'

export type LastDoneBackfillStats = {
  rows_seen: number
  contacts_touched: number
  services_filled: number
  services_skipped_has_done: number
  errors: string[]
  from: string
  to: string
  truncated: boolean
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

/**
 * Grava last_done_at a partir de ultima_visita (0002) — só data real da Avec.
 * - Não inventa visita: exige lastVisitDay do relatório.
 * - Só preenche se last_done_at é null OU o dia da Avec é mais recente (data SP).
 * - Não dispara aftercare nem limpa agenda futura.
 * Hora: 12:00 local quando a Avec só manda a data (granularidade dia — cadência usa dias).
 */
export async function applyVisitDayToService(
  serviceId: string,
  visitDayYmd: string,
  opts: { professionalName?: string | null; lastPrice?: number | null } = {},
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
    returning id
  `) as { id: string }[]

  if (rows.length > 0) return 'filled'

  const exists = (await sql`
    select id from client_services where id = ${serviceId} limit 1
  `) as { id: string }[]
  return exists.length ? 'skipped' : 'missing'
}

async function findOrCreateServiceForBackfill(contactId: string, serviceName: string) {
  const services = await listServices(contactId)
  const match = services.find((s) => s.name.toLowerCase() === serviceName.toLowerCase())
  const cadenceDays = defaultCadenceDaysForServiceName(serviceName)
  if (match) {
    if (match.cadence_days == null) {
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
 * One-shot / admin: percorre 0002 e preenche last_done_at com ultima_visita real.
 */
export async function runLastDoneBackfill(opts?: {
  daysBack?: number
  maxPages?: number
}): Promise<LastDoneBackfillStats> {
  const daysBack = Math.min(Math.max(opts?.daysBack ?? 180, 7), 366)
  const today = todayIso()
  const from = shiftYmd(today, -daysBack)
  const params = {
    inicio: isoToBr(from),
    fim: isoToBr(today),
    como_conheceu: '',
    limit: 250,
  }

  const stats: LastDoneBackfillStats = {
    rows_seen: 0,
    contacts_touched: 0,
    services_filled: 0,
    services_skipped_has_done: 0,
    errors: [],
    from,
    to: today,
    truncated: false,
  }

  const result = await fetchAllAvecReport('0002', params, opts?.maxPages ?? 80)
  stats.truncated = Boolean(result.truncated)

  for (const row of result.rows) {
    const att = normalizeAttendanceRow(row)
    if (!att?.lastVisitDay) continue
    stats.rows_seen++
    try {
      const contact = await upsertContact({
        avecClientId: att.avecClientId ?? undefined,
        name: att.clientName,
        phone: att.phone,
        channel: 'avec',
        source: 'avec_last_done_backfill',
      })
      if (contact.anonymized_at) continue
      stats.contacts_touched++
      const serviceName = att.serviceName || 'Atendimento'
      const service = await findOrCreateServiceForBackfill(contact.id, serviceName)
      const outcome = await applyVisitDayToService(service.id, att.lastVisitDay, {
        professionalName: att.professional,
        lastPrice: att.price,
      })
      if (outcome === 'filled') stats.services_filled++
      else if (outcome === 'skipped') stats.services_skipped_has_done++
    } catch (e) {
      if (stats.errors.length < 30) {
        stats.errors.push(e instanceof Error ? e.message : String(e))
      }
    }
  }

  return stats
}
