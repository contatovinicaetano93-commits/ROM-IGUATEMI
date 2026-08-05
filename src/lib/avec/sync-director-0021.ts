/**
 * Sync Avec 0021 → salon_director_0021_months (faturamento por profissional, mês calendário).
 * Relatório gerência usa isso como warehouse offline do 0021.
 */

import { extractRows, fetchAvecReport, fmtAvecDate } from '@/lib/avec/client'
import { normalizeP1ProfessionalRevenueRow } from '@/lib/avec/normalize'
import { getAvecReportRegistry, resolveReportId } from '@/lib/avec/registry'
import type { AvecSyncStats } from '@/lib/avec/sync'
import { getSql } from '@/lib/db'
import {
  get0021MonthCoverage,
  is0021MonthCoverageReady,
  type Director0021ProfessionalRow,
} from '@/lib/director-report/from-db'
import { currentMonthKeySp } from '@/lib/director-report/period'
import type { MonthKey } from '@/lib/director-report/types'
import { resolveMonthWindow } from '@/lib/salon/month-window'

const MAX_PAGES_PER_MONTH = 40
const COVERAGE_FRESH_MS_PAST = 24 * 60 * 60_000
const COVERAGE_FRESH_MS_CURRENT = 6 * 60 * 60_000

function monthRangeBr(month: MonthKey, referenceDay?: string): { inicio: string; fim: string } {
  const w = resolveMonthWindow(month, referenceDay)
  const [fy, fm, fd] = w.from.split('-').map(Number)
  const [ty, tm, td] = w.to.split('-').map(Number)
  if (!fy || !fm || !fd || !ty || !tm || !td) throw new Error(`Mês inválido: ${month}`)
  return {
    inicio: fmtAvecDate(new Date(fy, fm - 1, fd)),
    fim: fmtAvecDate(new Date(ty, tm - 1, td)),
  }
}

function resolve0021ReportId(): string {
  const def = getAvecReportRegistry().find((r) => r.mapper === 'professionals_revenue')
  return def ? resolveReportId(def) : '0021'
}

export function isDirector0021MonthKey(v: string): v is MonthKey {
  if (!/^\d{4}-\d{2}$/.test(v)) return false
  const m = Number(v.slice(5, 7))
  return m >= 1 && m <= 12
}

function coverageFreshTtlMs(month: MonthKey): number {
  return month === currentMonthKeySp() ? COVERAGE_FRESH_MS_CURRENT : COVERAGE_FRESH_MS_PAST
}

/** Meses recentes para sync default (cobre comparativo trimestral típico da UI). */
function monthsToSync(now = new Date()): MonthKey[] {
  const current = currentMonthKeySp(now)
  const [yStr, mStr] = current.split('-')
  let y = Number(yStr)
  let m = Number(mStr)
  const out: MonthKey[] = []
  for (let i = 0; i < 8; i++) {
    out.push(`${y}-${String(m).padStart(2, '0')}` as MonthKey)
    m -= 1
    if (m < 1) {
      m = 12
      y -= 1
    }
  }
  return out
}

async function upsert0021Month(
  month: MonthKey,
  professionals: Director0021ProfessionalRow[],
  rowCount: number,
  truncated: boolean,
  sourceReport: string,
): Promise<void> {
  const sql = getSql()
  await sql`
    insert into salon_director_0021_months (
      month, professionals, row_count, truncated, source_report, synced_at
    ) values (
      ${month},
      ${JSON.stringify(professionals)}::jsonb,
      ${rowCount},
      ${truncated},
      ${sourceReport},
      now()
    )
    on conflict (month) do update set
      professionals = excluded.professionals,
      row_count = excluded.row_count,
      truncated = excluded.truncated,
      source_report = excluded.source_report,
      synced_at = now()
  `
}

async function preserveOrStub0021Month(
  month: MonthKey,
  rowCount: number,
  professionals: Director0021ProfessionalRow[],
  stats: AvecSyncStats,
  reason: string,
): Promise<'preserved' | 'stubbed'> {
  const prior = await get0021MonthCoverage(month)
  if (is0021MonthCoverageReady(prior) && rowCount === 0) {
    stats.warnings.push(
      `director-0021 ${month}: ${reason}; cobertura anterior preservada (${prior!.row_count} rows)`,
    )
    return 'preserved'
  }
  await upsert0021Month(month, professionals, rowCount, true, resolve0021ReportId())
  if (is0021MonthCoverageReady(prior) && rowCount > 0) {
    stats.warnings.push(
      `director-0021 ${month}: ${reason}; dados parciais gravados — cobertura marcada truncada (prior ${prior!.row_count} rows)`,
    )
  }
  return 'stubbed'
}

async function coverageIsFresh(month: MonthKey): Promise<boolean> {
  try {
    const sql = getSql()
    const rows = (await sql`
      select row_count, truncated, synced_at
      from salon_director_0021_months
      where month = ${month}
      limit 1
    `) as { row_count: number; truncated: boolean; synced_at: string | Date }[]
    const row = rows[0]
    if (!row || row.truncated || row.row_count <= 0) return false
    const ts = new Date(row.synced_at).getTime()
    if (!Number.isFinite(ts)) return false
    return Date.now() - ts < coverageFreshTtlMs(month)
  } catch {
    return false
  }
}

function aggregate0021Rows(
  rows: Record<string, unknown>[],
): Director0021ProfessionalRow[] {
  const byName = new Map<string, Director0021ProfessionalRow>()
  for (const row of rows) {
    const p = normalizeP1ProfessionalRevenueRow(row)
    if (!p) continue
    const cur = byName.get(p.name) ?? {
      name: p.name,
      revenue: 0,
      attended: 0,
      ticket_avg: 0,
    }
    cur.revenue += p.revenue
    cur.attended += p.attended
    cur.ticket_avg = cur.attended > 0 ? cur.revenue / cur.attended : p.ticketAvg
    byName.set(p.name, cur)
  }
  return [...byName.values()]
}

async function syncOneMonth(
  month: MonthKey,
  stats: AvecSyncStats,
  opts?: Pick<SyncDirector0021Opts, 'shouldAbort'>,
): Promise<void> {
  const reportId = resolve0021ReportId()
  const { inicio, fim } = monthRangeBr(month)
  let pagesFetched = 0
  let truncated = false
  let aborted = false
  const allRows: Record<string, unknown>[] = []

  try {
    for (let page = 1; page <= MAX_PAGES_PER_MONTH; page++) {
      if (opts?.shouldAbort?.()) {
        aborted = true
        truncated = true
        stats.aborted = true
        break
      }

      const payload = await fetchAvecReport(
        reportId,
        { inicio, fim, limit: 250, page },
        { timeoutMs: 55_000 },
      )
      pagesFetched = page
      const rows = extractRows(payload)
      if (rows.length === 0) {
        if (page === 1 && allRows.length === 0) {
          const prior = await get0021MonthCoverage(month)
          if (is0021MonthCoverageReady(prior)) {
            stats.warnings.push(
              `director-0021 ${month}: Avec vazio; cobertura anterior preservada (${prior!.row_count} rows)`,
            )
            return
          }
        }
        break
      }

      allRows.push(...rows)
      if (rows.length < 250) break
      if (page === MAX_PAGES_PER_MONTH) truncated = true
    }
  } catch (e) {
    const professionals = aggregate0021Rows(allRows)
    await preserveOrStub0021Month(
      month,
      professionals.length,
      professionals,
      stats,
      'falha no sync',
    )
    throw e
  }

  const professionals = aggregate0021Rows(allRows)
  const rowCount = professionals.length

  if (aborted) {
    const outcome = await preserveOrStub0021Month(
      month,
      rowCount,
      professionals,
      stats,
      'abortado por orçamento',
    )
    if (outcome === 'stubbed') {
      stats.warnings.push(`director-0021 ${month}: abortado por orçamento; cobertura marcada truncada`)
    }
    return
  }

  if (!truncated) {
    const prior = await get0021MonthCoverage(month)
    if (
      is0021MonthCoverageReady(prior) &&
      prior &&
      (rowCount === 0 || (prior.row_count > 5 && rowCount < prior.row_count * 0.5))
    ) {
      await preserveOrStub0021Month(
        month,
        rowCount,
        professionals,
        stats,
        `resultado incompleto (${rowCount} vs prior ${prior.row_count})`,
      )
      return
    }
  }

  await upsert0021Month(month, professionals, rowCount, truncated, reportId)
  stats.director_0021_months_upserted = (stats.director_0021_months_upserted ?? 0) + 1

  if (truncated) {
    stats.warnings.push(`director-0021 ${month}: truncado em ${MAX_PAGES_PER_MONTH} páginas`)
  } else {
    stats.warnings.push(`director-0021 ${month}: ${rowCount} profissionais (${pagesFetched} pág.)`)
  }
}

export type SyncDirector0021Opts = {
  /** Se omitido, sincroniza os últimos 8 meses. */
  months?: MonthKey[]
  /** Re-sincroniza mesmo com cobertura fresca. */
  force?: boolean
  shouldAbort?: () => boolean
}

/**
 * Full sync: grava meses recentes para o Relatório gerência 0021.
 * Best-effort — falha de um mês não aborta o sync.
 */
export async function syncDirector0021(
  stats: AvecSyncStats,
  _syncRunId?: string,
  opts?: SyncDirector0021Opts,
): Promise<void> {
  const months = opts?.months?.length ? opts.months : monthsToSync()
  for (const month of months) {
    if (opts?.shouldAbort?.()) {
      stats.aborted = true
      stats.warnings.push(`director-0021: abortado por orçamento antes de ${month}`)
      break
    }
    try {
      if (!opts?.force && (await coverageIsFresh(month))) {
        stats.warnings.push(`director-0021 ${month}: cobertura fresca — pulado`)
        continue
      }
      await syncOneMonth(month, stats, opts)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (/salon_director_0021_months/i.test(msg)) {
        stats.warnings.push(`director-0021: schema pendente (${msg.slice(0, 80)})`)
        return
      }
      stats.errors.push(`director-0021 ${month}: ${msg.slice(0, 160)}`)
    }
  }
}

/** Helper de teste / admin — intervalo Avec de um mês calendário. */
export function director0021MonthWindow(month: MonthKey): { inicio: string; fim: string } {
  return monthRangeBr(month)
}
