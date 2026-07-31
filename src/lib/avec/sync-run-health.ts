/**
 * Helpers de saúde de runs Avec — paridade Cérebro empty-kill.
 * Sem DB; usável em sync-meta / Hoje / testes.
 */

export type AvecRunHealthRow = {
  status: string
  created_at: string
  error?: string | null
}

/** Orphan/kill sem progresso útil — não deve mascarar ok/partial mais antigo. */
export function isEmptyKillAvecRun(row: Pick<AvecRunHealthRow, 'status' | 'error'>): boolean {
  if (row.status !== 'error') return false
  const e = row.error ?? ''
  return /abandoned|Sync interrompido|timeout\/kill|interrompido/i.test(e)
}

function runTime(row: Pick<AvecRunHealthRow, 'created_at'>): number {
  return new Date(row.created_at).getTime()
}

/** Entre finished, ignora empty-kill se houver candidato mais saudável. */
export function pickNewestUsableAvecRun<T extends AvecRunHealthRow>(
  runs: Array<T | null | undefined>,
): T | null {
  const finished = runs.filter((row): row is T => row != null)
  if (finished.length === 0) return null
  const withoutEmptyKills = finished.filter((row) => !isEmptyKillAvecRun(row))
  const candidates = withoutEmptyKills.length > 0 ? withoutEmptyKills : finished
  return candidates.reduce((latest, row) => (runTime(row) >= runTime(latest) ? row : latest))
}

/**
 * Badge Hoje: preferir fast usável (caixa/agenda); full só se fast for empty-kill/ausente.
 * Evita full parcial em analytics pintar Hoje quando o fast ok ainda vale.
 */
export function pickHojeAvecSyncRun<T extends AvecRunHealthRow>(
  fast: T | null | undefined,
  full: T | null | undefined,
): T | null {
  if (fast != null && !isEmptyKillAvecRun(fast)) return fast
  if (full != null && !isEmptyKillAvecRun(full)) return full
  return fast ?? full ?? null
}
