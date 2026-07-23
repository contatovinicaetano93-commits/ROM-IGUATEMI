/** Utilitário puro — seguro para importar em Client Components. */

/** Destinos internos permitidos ao voltar de um contato. */
const ALLOWED_RETURN_PREFIXES = [
  '/hoje',
  '/contatos',
  '/pipeline',
  '/dashboard',
  '/onboarding',
  '/financeiro',
  '/estoque',
  '/relatorios',
  '/admin',
  '/observability',
] as const

export function sanitizeRedirectPath(next: string | null | undefined, fallback = '/hoje') {
  if (!next || !next.startsWith('/') || next.startsWith('//')) return fallback
  if (next.includes('://') || next.includes('\\')) return fallback
  return next
}

/**
 * Sanitiza returnTo de detalhe de contato.
 * Só aceita paths internos conhecidos (evita open redirect).
 */
export function sanitizeContactReturnTo(
  next: string | null | undefined,
  fallback = '/contatos',
): string {
  const path = sanitizeRedirectPath(next, fallback)
  const bare = path.split('?')[0]?.split('#')[0] ?? path
  const allowed = ALLOWED_RETURN_PREFIXES.some(
    (prefix) => bare === prefix || bare.startsWith(`${prefix}/`),
  )
  return allowed ? path : fallback
}

/** Rótulo curto do botão voltar a partir do path de retorno. */
export function contactReturnLabel(returnTo: string): string {
  const bare = returnTo.split('?')[0]?.split('#')[0] ?? returnTo
  if (bare === '/hoje' || bare.startsWith('/hoje/')) return 'Hoje'
  if (bare === '/pipeline' || bare.startsWith('/pipeline/')) return 'Pipeline'
  if (bare === '/dashboard' || bare.startsWith('/dashboard/')) return 'Visão analítica'
  if (bare === '/financeiro' || bare.startsWith('/financeiro/')) return 'Financeiro'
  if (bare === '/estoque' || bare.startsWith('/estoque/')) return 'Estoque'
  if (bare === '/relatorios' || bare.startsWith('/relatorios/')) return 'Relatórios'
  if (bare.startsWith('/admin/relatorio-diretoria')) return 'Relatório diretoria'
  if (bare.startsWith('/admin')) return 'Admin'
  if (bare === '/onboarding' || bare.startsWith('/onboarding/')) return 'Onboarding'
  if (bare === '/contatos' || bare.startsWith('/contatos/')) return 'Contatos'
  return 'Voltar'
}

/** Monta href de contato com origem opcional (resiste a refresh). */
export function contactHref(contactId: string, returnTo?: string | null): string {
  const base = `/contatos/${contactId}`
  if (!returnTo) return base
  const safe = sanitizeContactReturnTo(returnTo, '')
  if (!safe) return base
  return `${base}?returnTo=${encodeURIComponent(safe)}`
}
