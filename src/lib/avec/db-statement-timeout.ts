/**
 * Postgres statement_timeout (SQLSTATE 57014).
 * Em sync: tratar como abort limpo / partial — não deixar virar unhandled rejection nem HTTP 500.
 */

export const PG_STATEMENT_TIMEOUT_CODE = '57014'

export function isPostgresStatementTimeoutError(e: unknown): boolean {
  if (e && typeof e === 'object') {
    const code = (e as { code?: unknown }).code
    if (code === PG_STATEMENT_TIMEOUT_CODE || code === 57014) return true
  }
  const msg = e instanceof Error ? e.message : String(e ?? '')
  return /canceling statement due to statement timeout|statement timeout/i.test(msg)
}

export function statementTimeoutSoftMessage(stage?: string): string {
  const where = stage?.trim() ? ` em ${stage.trim()}` : ''
  return `sync: Postgres statement_timeout (57014)${where} — abort limpo parcial`
}

/** Marca abort + warning soft (idempotente se já abortado com o mesmo estágio). */
export function noteStatementTimeoutSoftFail(
  stats: { aborted?: boolean; warnings?: string[]; errors?: string[] },
  stage: string,
) {
  if (!stats.warnings) stats.warnings = []
  const msg = statementTimeoutSoftMessage(stage)
  if (!stats.warnings.some((w) => /statement_timeout \(57014\)/i.test(w))) {
    stats.warnings.push(msg)
  }
  if (!stats.aborted) stats.aborted = true
}
