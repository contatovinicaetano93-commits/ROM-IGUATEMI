/** Postgres SQLSTATE 57014 — statement_timeout / query cancel. */
export function isDbStatementTimeoutError(e: unknown): boolean {
  if (e && typeof e === 'object' && 'code' in e) {
    const code = (e as { code?: unknown }).code
    if (code === '57014' || code === 57014) return true
  }
  const msg = e instanceof Error ? e.message : String(e)
  return /statement timeout|canceling statement due to statement timeout|query_canceled/i.test(msg)
}
