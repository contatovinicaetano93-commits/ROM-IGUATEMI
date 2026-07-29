/**
 * Detecta bloqueio de cota Postgres (transferência / tamanho) — sync deve skipar, não 500
 * (legado Neon 402; também cobre mensagens genéricas de quota).
 * BR e IG usam Supabase; só o Cérebro usa Neon.
 */

export function isDbQuotaError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e)
  const lower = msg.toLowerCase()
  if (
    lower.includes('data transfer quota') ||
    lower.includes('project size limit') ||
    lower.includes('could not extend file')
  ) {
    return true
  }
  // 402 Payment Required / HTTP status 402 (com ou sem "neon"/"quota" no texto)
  if (/\b402\b/.test(lower) && (lower.includes('payment required') || lower.includes('quota') || lower.includes('neon'))) {
    return true
  }
  if (lower.includes('http status 402')) return true
  return false
}

export function dbQuotaUserMessage(e?: unknown): string {
  const msg = e instanceof Error ? e.message : e ? String(e) : ''
  if (msg.toLowerCase().includes('project size limit') || msg.toLowerCase().includes('could not extend file')) {
    return 'Banco sem espaço (limite de tamanho). Purgue snapshots em /admin ou faça upgrade do plano Supabase.'
  }
  return 'Banco sem cota de transferência (HTTP 402). Pare crons agressivos, purge snapshots ou faça upgrade do plano Supabase.'
}
