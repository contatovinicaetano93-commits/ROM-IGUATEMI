/**
 * Pure helpers for Avec sync finish status — unit-testable without DB.
 */

export type AvecCoreProgressStats = {
  clients_upserted: number
  appointments_synced: number
  attendances_synced: number
  revenue_rows: number
  cancellation_rows: number
  /** Full/ops — P1/P2/P3 contam como progresso (sem agenda/caixa). */
  p1_rows?: number
  p2_rows?: number
  p3_rows?: number
}

export function avecHadCoreProgress(stats: AvecCoreProgressStats): boolean {
  return (
    stats.clients_upserted +
      stats.appointments_synced +
      stats.attendances_synced +
      stats.revenue_rows +
      stats.cancellation_rows +
      (stats.p1_rows ?? 0) +
      (stats.p2_rows ?? 0) +
      (stats.p3_rows ?? 0) >
    0
  )
}

export type AvecFinishStatusInput = {
  errorCount: number
  hardWarningCount: number
  aborted: boolean
  hadCoreRows: boolean
  /** Outer catch — unexpected throw mid-sync */
  thrown?: boolean
}

/**
 * Resolve final avec_sync_runs.status for normal finish and catch paths.
 * Catch with progress or abort → partial (não pintar Cérebro de error falso).
 */
export function resolveAvecFinishStatus(
  input: AvecFinishStatusInput,
): 'ok' | 'partial' | 'error' {
  if (input.thrown) {
    return input.hadCoreRows || input.aborted ? 'partial' : 'error'
  }
  // Abort limpo sem core ainda é partial (dados parciais / orçamento).
  if (input.errorCount > 0 && !input.hadCoreRows && !input.aborted) return 'error'
  if (input.errorCount > 0 || input.hardWarningCount > 0) {
    return 'partial'
  }
  // Abort limpo com core + só soft warnings → ok (não assusta Visão/Cérebro).
  if (input.aborted) {
    return input.hadCoreRows ? 'ok' : 'partial'
  }
  return 'ok'
}
