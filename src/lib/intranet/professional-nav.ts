import type { AuthRole } from '@/lib/auth'

/**
 * Seções de operação unitária redundantes com Agenda + Contatos.
 * Ficam no menu só para staff operacional (recepção / pós-venda / gestora),
 * sem `professional_name`. Admin, dono, finanças, estoque, mkt e
 * cabeleireiros não as veem no top/bottom nav.
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
 * Quem não deve ver Balcão / Pós-venda / Operação no menu.
 * Staff sem vínculo Avec (recepção, pós-venda, gestora) continua vendo.
 */
export function shouldHideOpsShellNav(
  role: AuthRole | null | undefined,
  professionalName: string | null | undefined,
): boolean {
  if (!role) return false
  if (isProfessionalStaff(role, professionalName)) return true
  return role !== 'staff'
}

/** Path (página ou API) oculto no menu / bloqueado para profissional. */
export function isProfessionalHiddenPath(pathname: string): boolean {
  const path = (pathname.split('?')[0] || '/').replace(/\/$/, '') || '/'
  for (const href of PROFESSIONAL_HIDDEN_HREFS) {
    if (path === href || path.startsWith(`${href}/`)) return true
  }
  // Operação/Balcão/Pós-venda leem /api/hoje.
  if (path === '/api/hoje' || path.startsWith('/api/hoje/')) return true
  return false
}
