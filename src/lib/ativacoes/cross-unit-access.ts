/**
 * Quem pode criar/cancelar ativação na unidade irmã a partir desta intranet.
 * Allowlist explícita — não generalizar sem decisão humana.
 */
const CROSS_UNIT_WRITE_EMAILS = new Set(['amanda.souza@romconcept.com.br'])

export function normalizeAtivacaoActorEmail(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase()
}

/** true só para e-mails na allowlist (ex.: Amanda MKT). */
export function canWritePeerAtivacoes(session: { user?: string | null } | null | undefined): boolean {
  const email = normalizeAtivacaoActorEmail(session?.user)
  if (!email) return false
  return CROSS_UNIT_WRITE_EMAILS.has(email)
}

export function listCrossUnitWriteEmailsForTests(): string[] {
  return [...CROSS_UNIT_WRITE_EMAILS]
}
