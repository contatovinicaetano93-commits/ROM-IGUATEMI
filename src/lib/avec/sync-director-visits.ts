/**
 * Sync 0002 → salon_client_visits (histórico cliente×pro×dia).
 * Sem essa tabela o Relatório gerência 0011 só existia via Avec ao vivo.
 */

import { extractRows, fetchAvecReport, fmtAvecDate } from '@/lib/avec/client'
import { normalizeAttendanceRow } from '@/lib/avec/normalize'
import type { AvecSyncStats } from '@/lib/avec/sync'
import { getSql } from '@/lib/db'
import {
  local0011ClientKey,
  previousQuarterKey,
  splitAvecProfessionalNames,
} from '@/lib/director-report/local-0011'
import { currentQuarterKeySp } from '@/lib/director-report/period'
import type { QuarterKey } from '@/lib/director-report/types'

const MAX_PAGES_PER_QUARTER = 40
/** Upserts em lote — insert linha a linha estourava o maxDuration no BR. */
const UPSERT_BATCH_SIZE = 80
const COVERAGE_FRESH_MS = 12 * 60 * 60_000

type VisitUpsert = {
  client_key: string
  visited_on: string
  client_name: string
  phone: string | null
  mobile: string | null
  email: string | null
  professional_names: string[]
  source_report: string
}

function quarterRangeBr(quarter: QuarterKey): { inicio: string; fim: string } {
  const [yStr, qStr] = quarter.split('-Q')
  const y = Number(yStr)
  const q = Number(qStr) as 1 | 2 | 3 | 4
  if (!y || !q || q < 1 || q > 4) throw new Error(`Trimestre inválido: ${quarter}`)
  const startMonth = (q - 1) * 3
  const start = new Date(y, startMonth, 1)
  const end = new Date(y, startMonth + 3, 0)
  return { inicio: fmtAvecDate(start), fim: fmtAvecDate(end) }
}

function avecBrToIso(ddmmYYYY: string): string {
  const [d, m, y] = ddmmYYYY.split('/')
  if (!d || !m || !y) throw new Error(`Data Avec inválida: ${ddmmYYYY}`)
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
}

function quartersToSync(now = new Date()): QuarterKey[] {
  const current = currentQuarterKeySp(now)
  const prior = previousQuarterKey(current)
  const yoy = `${Number(current.slice(0, 4)) - 1}-${current.slice(5)}` as QuarterKey
  const yoyPrior = previousQuarterKey(yoy)
  return [...new Set([current, prior, yoy, yoyPrior])]
}

export function isDirectorVisitQuarterKey(v: string): v is QuarterKey {
  return /^\d{4}-Q[1-4]$/.test(v)
}

async function upsertVisitBatch(batch: VisitUpsert[]): Promise<void> {
  if (batch.length === 0) return
  const sql = getSql()
  const keys = batch.map((b) => b.client_key)
  const days = batch.map((b) => b.visited_on)
  const names = batch.map((b) => b.client_name)
  const phones = batch.map((b) => b.phone)
  const mobiles = batch.map((b) => b.mobile)
  const emails = batch.map((b) => b.email)
  // text[] de JSON — evita text[][] e jsonb_to_recordset (binding frágil).
  const prosJson = batch.map((b) => JSON.stringify(b.professional_names ?? []))
  const sources = batch.map((b) => b.source_report)

  await sql`
    insert into salon_client_visits (
      client_key, visited_on, client_name, phone, mobile, email,
      professional_names, source_report, synced_at
    )
    select
      k,
      d::date,
      n,
      p,
      m,
      e,
      coalesce(
        (
          select array_agg(x)
          from jsonb_array_elements_text(pr::jsonb) as x
        ),
        '{}'::text[]
      ),
      s,
      now()
    from unnest(
      ${keys}::text[],
      ${days}::text[],
      ${names}::text[],
      ${phones}::text[],
      ${mobiles}::text[],
      ${emails}::text[],
      ${prosJson}::text[],
      ${sources}::text[]
    ) as t(k, d, n, p, m, e, pr, s)
    on conflict (client_key, visited_on, source_report) do update set
      client_name = excluded.client_name,
      phone = coalesce(excluded.phone, salon_client_visits.phone),
      mobile = coalesce(excluded.mobile, salon_client_visits.mobile),
      email = coalesce(excluded.email, salon_client_visits.email),
      professional_names = excluded.professional_names,
      synced_at = now()
  `
}

async function coverageIsFresh(quarter: QuarterKey): Promise<boolean> {
  try {
    const sql = getSql()
    const rows = (await sql`
      select row_count, truncated, synced_at
      from salon_visit_sync_coverage
      where period_key = ${quarter}
      limit 1
    `) as { row_count: number; truncated: boolean; synced_at: string | Date }[]
    const row = rows[0]
    if (!row || row.truncated || row.row_count <= 0) return false
    const ts = new Date(row.synced_at).getTime()
    if (!Number.isFinite(ts)) return false
    return Date.now() - ts < COVERAGE_FRESH_MS
  } catch {
    return false
  }
}

async function syncOneQuarter(
  quarter: QuarterKey,
  stats: AvecSyncStats,
  syncRunId?: string,
): Promise<void> {
  const sql = getSql()
  const { inicio, fim } = quarterRangeBr(quarter)
  const periodStart = avecBrToIso(inicio)
  const periodEnd = avecBrToIso(fim)

  let pagesFetched = 0
  let rowCount = 0
  let truncated = false
  const seen = new Set<string>()
  let batch: VisitUpsert[] = []

  const flush = async () => {
    if (batch.length === 0) return
    const chunk = batch
    batch = []
    await upsertVisitBatch(chunk)
    rowCount += chunk.length
    stats.director_visits_upserted = (stats.director_visits_upserted ?? 0) + chunk.length
  }

  for (let page = 1; page <= MAX_PAGES_PER_QUARTER; page++) {
    const payload = await fetchAvecReport(
      '0002',
      { inicio, fim, como_conheceu: '', limit: 250, page },
      { timeoutMs: 55_000 },
    )
    pagesFetched = page
    const rows = extractRows(payload)
    if (rows.length === 0) break

    for (const row of rows) {
      const att = normalizeAttendanceRow(row)
      if (!att?.clientName || !att.lastVisitDay) continue
      const phone = att.phone
      const key = local0011ClientKey(phone, att.clientName)
      if (!key) continue
      const dedupe = `${key}|${att.lastVisitDay}`
      if (seen.has(dedupe)) continue
      seen.add(dedupe)

      const proRaw =
        typeof row.todas_os_profissionais === 'string'
          ? row.todas_os_profissionais
          : att.professional
      const pros = splitAvecProfessionalNames(proRaw)
      const email =
        typeof row.email === 'string' && row.email.trim() ? row.email.trim() : null

      batch.push({
        client_key: key,
        visited_on: att.lastVisitDay,
        client_name: att.clientName,
        phone,
        mobile: phone,
        email,
        professional_names: pros,
        source_report: '0002',
      })
      if (batch.length >= UPSERT_BATCH_SIZE) await flush()
    }

    if (rows.length < 250) break
    if (page === MAX_PAGES_PER_QUARTER) truncated = true
  }

  await flush()

  await sql`
    insert into salon_visit_sync_coverage (
      period_key, period_start, period_end, pages_fetched, row_count, truncated, synced_at
    ) values (
      ${quarter},
      ${periodStart}::date,
      ${periodEnd}::date,
      ${pagesFetched},
      ${rowCount},
      ${truncated},
      now()
    )
    on conflict (period_key) do update set
      period_start = excluded.period_start,
      period_end = excluded.period_end,
      pages_fetched = excluded.pages_fetched,
      row_count = excluded.row_count,
      truncated = excluded.truncated,
      synced_at = now()
  `

  if (truncated) {
    stats.warnings.push(`director-visits ${quarter}: truncado em ${MAX_PAGES_PER_QUARTER} páginas 0002`)
  } else {
    stats.warnings.push(
      `director-visits ${quarter}: ${rowCount} visitas (${pagesFetched} pág.)${syncRunId ? '' : ''}`,
    )
  }
}

export type SyncDirectorVisitsOpts = {
  /** Se omitido, sincroniza corrente + anterior + YoY. */
  quarters?: QuarterKey[]
  /** Re-sincroniza mesmo com cobertura fresca (<12h). */
  force?: boolean
}

/**
 * Full sync: grava trimestres corrente + anterior + YoY (para comparativo gerência).
 * Best-effort — falha de um trimestre não aborta o sync.
 */
export async function syncDirectorVisits(
  stats: AvecSyncStats,
  syncRunId?: string,
  opts?: SyncDirectorVisitsOpts,
): Promise<void> {
  const quarters = opts?.quarters?.length ? opts.quarters : quartersToSync()
  for (const q of quarters) {
    try {
      if (!opts?.force && (await coverageIsFresh(q))) {
        stats.warnings.push(`director-visits ${q}: cobertura fresca — pulado`)
        continue
      }
      await syncOneQuarter(q, stats, syncRunId)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      // Tabela ainda não migrada — não derruba o sync full.
      if (/salon_client_visits|salon_visit_sync_coverage/i.test(msg)) {
        stats.warnings.push(`director-visits: schema pendente (${msg.slice(0, 80)})`)
        return
      }
      stats.errors.push(`director-visits ${q}: ${msg.slice(0, 160)}`)
    }
  }
}

/** Helper de teste / admin — intervalo Avec de um trimestre. */
export function directorVisitQuarterWindow(quarter: QuarterKey): {
  inicio: string
  fim: string
  isoStart: string
  isoEnd: string
} {
  const { inicio, fim } = quarterRangeBr(quarter)
  return { inicio, fim, isoStart: avecBrToIso(inicio), isoEnd: avecBrToIso(fim) }
}
