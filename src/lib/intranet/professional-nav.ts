import type { AuthRole } from '@/lib/auth'

/**
 * Seções de operação unitária que o cargo Profissional não usa —
 * Agenda + Contatos + Meu faturamento cobrem o dia a dia dele.
 */
export const PROFESSIONAL_HIDDEN_HREFS = ['/hoje', '/recepcao', '/pos-venda'] as const

/** Staff com `professional_name` = cabeleireiro/profissional da unidade. */
export function isProfessionalStaff(
  role: AuthRole | null | undefined,
  professionalName: string | null | undefined,
): boolean {
  return role === 'staff' && Boolean(professionalName?.trim())
}

/** Path (página ou API) oculto/bloqueado para o cargo Profissional. */
export function isProfessionalHiddenPath(pathname: string): boolean {
  const path = (pathname.split('?')[0] || '/').replace(/\/$/, '') || '/'
  for (const href of PROFESSIONAL_HIDDEN_HREFS) {
    if (path === href || path.startsWith(`${href}/`)) return true
  }
  // Operação/Balcão/Pós-venda leem /api/hoje.
  if (path === '/api/hoje' || path.startsWith('/api/hoje/')) return true
  return false
}
