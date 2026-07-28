/**
 * Detecta bloqueio de cota / pagamento no Postgres gerenciado
 * (legado Neon 402; também cobre mensagens genéricas de quota).
 * BR e IG usam Supabase; só o Cérebro usa Neon.
 */

export function isNeonQuotaError(e: unknown): boolean {
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

export function neonQuotaUserMessage(e?: unknown): string {
  const msg = e instanceof Error ? e.message : e ? String(e) : ''
  if (msg.toLowerCase().includes('project size limit') || msg.toLowerCase().includes('could not extend file')) {
    return 'Postgres sem espaço (limite de tamanho no projeto). Purgue dados antigos em /admin ou faça upgrade do plano Supabase.'
  }
  return 'Postgres sem cota de transferência (HTTP 402). Confira o DATABASE_URL (deve ser Supabase pooler nesta unidade), pause crons agressivos ou faça upgrade.'
}
