/**
 * Orçamento de parede do sync Avec em voo.
 * Estado no módulo separado para P1/P2/P3 não importarem sync.ts (ciclo).
 */

/** Não iniciar page loop / upsert massivo com menos que isto de orçamento. */
export const SYNC_HEAVY_STEP_MIN_MS = 30_000

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

/** ms restantes até o deadline; null se não há orçamento ativo. */
export function getSyncBudgetRemainingMs(now = Date.now()): number | null {
  if (activeSyncDeadlineAt == null) return null
  return activeSyncDeadlineAt - now
}

/**
 * true se dá para começar um passo pesado (fetch paginado / dump 0004).
 * Sem deadline ativo → true (sem guarda).
 */
export function hasSyncBudgetForHeavyStep(
  minMs: number = SYNC_HEAVY_STEP_MIN_MS,
  now = Date.now(),
): boolean {
  const remaining = getSyncBudgetRemainingMs(now)
  if (remaining == null) return true
  return remaining >= minMs
}

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
