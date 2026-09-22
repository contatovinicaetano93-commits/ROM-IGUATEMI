import type { AuthRole } from '@/lib/auth'

/**
 * Seções redundantes com Agenda + Contatos.
 * Fora do menu de todo mundo — rotas podem existir por deep link antigo.
 */
export const PROFESSIONAL_HIDDEN_HREFS = ['/hoje', '/recepcao', '/pos-venda'] as const

/** Staff com `professional_name` = cabeleireiro/profissional da unidade. */
export function isProfessionalStaff(
  role: AuthRole | null | undefined,
  professionalName: string | null | undefined,
): boolean {
  return role === 'staff' && Boolean(professionalName?.trim())
}

/**
 * Balcão / Pós-venda / Operação fora do menu para qualquer papel.
 * Agenda + Contatos cobrem recepção, pós-venda e gestão do dia.
 */
export function shouldHideOpsShellNav(
  role: AuthRole | null | undefined,
  _professionalName?: string | null,
): boolean {
  return Boolean(role)
}

/** Path das seções redundantes (página ou API /api/hoje). */
export function isProfessionalHiddenPath(pathname: string): boolean {
  const path = (pathname.split('?')[0] || '/').replace(/\/$/, '') || '/'
  for (const href of PROFESSIONAL_HIDDEN_HREFS) {
    if (path === href || path.startsWith(`${href}/`)) return true
  }
  if (path === '/api/hoje' || path.startsWith('/api/hoje/')) return true
  return false
}
