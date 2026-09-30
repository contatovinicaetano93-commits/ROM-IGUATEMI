import type { AuthRole } from '@/lib/auth'

/**
 * Quem pode listar o cadastro completo de colaboradores (GET /api/employees).
 * Alinhado ao gate de PATCH/DELETE em /api/employees/[id] (panel_role admin).
 */
export function canListAllEmployees(role: AuthRole | null | undefined): boolean {
  return role === 'admin'
}
