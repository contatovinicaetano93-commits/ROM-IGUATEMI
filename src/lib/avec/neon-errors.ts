/** Detecta bloqueio de cota Neon (transferência / tamanho) — sync deve skipar, não 500. */

export function isNeonQuotaError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e)
  const lower = msg.toLowerCase()
  return (
    lower.includes('data transfer quota') ||
    lower.includes('project size limit') ||
    lower.includes('could not extend file') ||
    (lower.includes('http status 402') && lower.includes('neon')) ||
    (lower.includes('402') && lower.includes('quota'))
  )
}

export function neonQuotaUserMessage(e?: unknown): string {
  const msg = e instanceof Error ? e.message : e ? String(e) : ''
  if (msg.toLowerCase().includes('project size limit') || msg.toLowerCase().includes('could not extend file')) {
    return 'Neon sem espaço (limite de tamanho). Purgue snapshots em /admin ou faça upgrade do plano.'
  }
  return 'Neon sem cota de transferência (HTTP 402). Pare crons agressivos, purge snapshots ou faça upgrade.'
}
