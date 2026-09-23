import {
  calendarMonthRangeBr,
  fetchAllAvecReport,
  formatTruncationWarning,
  type AvecReportFetchResult,
  withRequiredAvecReportParams,
} from '@/lib/avec/client'
import {
  getActiveSyncDeadlineAt,
  isSyncBudgetExhausted,
  noteSyncBudgetExhausted,
} from '@/lib/avec/sync-budget'
import { normalizeCommission8123Row } from '@/lib/avec/normalize'
import { resolveReportId, getDailyReports } from '@/lib/avec/registry'
import { saveReportSnapshot } from '@/lib/avec/snapshots'
import {
  upsertSalonCommissionsDaily,
  type CommissionProfessionalRow,
} from '@/lib/salon/commission-metrics'

type SyncStatsLike = {
  snapshots_saved: number
  errors: string[]
  warnings?: string[]
  commissions_rows?: number
  aborted?: boolean
}

function reportDeadline() {
  return { deadlineAt: getActiveSyncDeadlineAt() }
}

function skipIfBudgetExhausted(stats: SyncStatsLike, stage: string): boolean {
  if (!isSyncBudgetExhausted()) return false
  noteSyncBudgetExhausted(stats, stage)
  return true
}

function todayIsoLocal() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function asRows(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) {
    return result.every((item) => item && typeof item === 'object')
      ? (result as Record<string, unknown>[])
      : []
  }
  if (result && typeof result === 'object') {
    const rows = (result as { rows?: unknown }).rows
    if (Array.isArray(rows) && rows.every((item) => item && typeof item === 'object')) {
      return rows as Record<string, unknown>[]
    }
  }
  return []
}

function warnIfTruncated(
  stats: SyncStatsLike,
  reportId: string,
  result: AvecReportFetchResult,
): boolean {
  if (!result.truncated) return false
  stats.warnings = stats.warnings ?? []
  stats.warnings.push(formatTruncationWarning(reportId, result))
  return true
}

async function snapshotSafe(
  reportId: string,
  params: Record<string, unknown>,
  rows: Record<string, unknown>[],
  stats: SyncStatsLike,
  syncRunId?: string,
) {
  try {
    await saveReportSnapshot(reportId, params, rows, syncRunId, { keepPayload: false, retain: 1 })
    stats.snapshots_saved++
  } catch (e) {
    stats.warnings = stats.warnings ?? []
    stats.warnings.push(`snapshot ${reportId}: ${e instanceof Error ? e.message : String(e)}`)
  }
}

export type SyncCommissionsOpts = {
  /** Dia ISO (YYYY-MM-DD) âncora do snapshot; default = hoje SP. */
  anchorDay?: string
}

/**
 * Sync 8123 → salon_commissions_daily (mês calendário MTD, igual P1).
 * Só no full/daily — não entra no fast KPI.
 * Espelha a_pagar / abatimentos; não recalcula % de comissão.
 */
export async function syncCommissions8123(
  stats: SyncStatsLike,
  syncRunId?: string,
  opts?: SyncCommissionsOpts,
) {
  const day =
    opts?.anchorDay && /^\d{4}-\d{2}-\d{2}$/.test(opts.anchorDay)
      ? opts.anchorDay
      : todayIsoLocal()
  const def = getDailyReports().find((r) => r.mapper === 'professionals_commissions')
  const reportId = def ? resolveReportId(def) : null
  if (!reportId) return

  if (skipIfBudgetExhausted(stats, 'comissões 8123')) return

  const { inicio, fim } = calendarMonthRangeBr(day)
  const params = withRequiredAvecReportParams(reportId, { inicio, fim, limit: 250 })

  try {
    const result = await fetchAllAvecReport(reportId, params, undefined, reportDeadline())
    const rows = asRows(result)
    const truncated = warnIfTruncated(stats, reportId, result)
    await snapshotSafe(reportId, params, rows, stats, syncRunId)
    if (truncated) return

    const professionals: CommissionProfessionalRow[] = []
    for (const row of rows) {
      const parsed = normalizeCommission8123Row(row)
      if (!parsed) continue
      professionals.push(parsed)
      stats.commissions_rows = (stats.commissions_rows ?? 0) + 1
    }

    if (professionals.length > 0) {
      await upsertSalonCommissionsDaily(day, professionals)
    }
  } catch (e) {
    stats.errors.push(`8123 commissions: ${e instanceof Error ? e.message : String(e)}`)
  }
}
