/**
 * Orçamento de parede do sync Avec em voo.
 * Estado no módulo separado para P1/P2/P3 não importarem sync.ts (ciclo).
 */

let activeSyncDeadlineAt: number | null = null

export function setActiveSyncDeadlineAt(deadlineAt: number | null) {
  activeSyncDeadlineAt = deadlineAt
}

export function getActiveSyncDeadlineAt(): number | null {
  return activeSyncDeadlineAt
}

export function isSyncBudgetExhausted(): boolean {
  return activeSyncDeadlineAt != null && Date.now() >= activeSyncDeadlineAt
}

/** Alias — paridade com call sites existentes. */
export const syncBudgetExhausted = isSyncBudgetExhausted

/** Marca abort limpo + warning soft (idempotente). */
export function noteSyncBudgetExhausted(
  stats: { aborted?: boolean; warnings?: string[] },
  stage: string,
) {
  if (stats.aborted) return
  stats.aborted = true
  if (!stats.warnings) stats.warnings = []
  stats.warnings.push(`sync: orçamento esgotado em ${stage} (abort limpo)`)
}

/** Alias — paridade com call sites existentes. */
export const markSyncBudgetExhausted = noteSyncBudgetExhausted
