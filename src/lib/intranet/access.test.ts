import { describe, expect, it } from 'vitest'
import { canAccessProtectedPath } from '@/lib/intranet/access'

describe('canAccessProtectedPath', () => {
  it('mantém o pacote staff: operação sim, gestão não', () => {
    expect(canAccessProtectedPath('/hoje', 'staff', [])).toBe(true)
    expect(canAccessProtectedPath('/pipeline', 'staff', [])).toBe(true)
    expect(canAccessProtectedPath('/api/contacts', 'staff', [])).toBe(true)
    expect(canAccessProtectedPath('/financeiro', 'staff', [])).toBe(false)
    expect(canAccessProtectedPath('/dashboard', 'staff', [])).toBe(false)
    expect(canAccessProtectedPath('/admin', 'staff', [])).toBe(false)
  })

  it('libera extra sem promover o papel', () => {
    expect(canAccessProtectedPath('/financeiro', 'staff', ['financeiro'])).toBe(true)
    expect(canAccessProtectedPath('/api/financeiro/despesas', 'staff', ['financeiro'])).toBe(true)
    expect(canAccessProtectedPath('/relatorios', 'staff', ['financeiro'])).toBe(false)
    expect(canAccessProtectedPath('/relatorios', 'staff', ['relatorios'])).toBe(true)
    expect(canAccessProtectedPath('/estoque', 'staff', ['estoque'])).toBe(true)
    expect(canAccessProtectedPath('/dashboard', 'staff', ['dashboard'])).toBe(true)
    expect(canAccessProtectedPath('/api/kpis', 'staff', ['dashboard'])).toBe(true)
    expect(canAccessProtectedPath('/admin', 'staff', ['dashboard'])).toBe(false)
  })

  it('financeiro ganha pipeline só com extra', () => {
    expect(canAccessProtectedPath('/financeiro', 'financeiro', [])).toBe(true)
    expect(canAccessProtectedPath('/pipeline', 'financeiro', [])).toBe(false)
    expect(canAccessProtectedPath('/pipeline', 'financeiro', ['pipeline'])).toBe(true)
    expect(canAccessProtectedPath('/dashboard', 'financeiro', [])).toBe(false)
  })

  it('estoque não entra em financeiro nem Visão analítica', () => {
    expect(canAccessProtectedPath('/estoque', 'estoque', [])).toBe(true)
    expect(canAccessProtectedPath('/hoje', 'estoque', [])).toBe(true)
    expect(canAccessProtectedPath('/financeiro', 'estoque', [])).toBe(false)
    expect(canAccessProtectedPath('/financeiro', 'estoque', ['financeiro'])).toBe(true)
  })

  it('admin continua irrestrito; sem role bloqueia', () => {
    expect(canAccessProtectedPath('/admin', 'admin', [])).toBe(true)
    expect(canAccessProtectedPath('/api/avec/sync', 'admin', [])).toBe(true)
    expect(canAccessProtectedPath('/financeiro', null, [])).toBe(false)
  })

  it('auditoria fica só no admin, mesmo com extras', () => {
    expect(canAccessProtectedPath('/auditoria', 'admin', [])).toBe(true)
    expect(canAccessProtectedPath('/api/intranet/audit', 'admin', [])).toBe(true)
    expect(canAccessProtectedPath('/auditoria', 'staff', [])).toBe(false)
    expect(canAccessProtectedPath('/auditoria', 'staff', ['dashboard'])).toBe(false)
    expect(canAccessProtectedPath('/api/intranet/audit', 'financeiro', [])).toBe(false)
    expect(canAccessProtectedPath('/api/intranet/notifications', 'staff', [])).toBe(true)
  })

  it('meu faturamento é self-serve — qualquer papel autenticado, sem grant de dashboard', () => {
    expect(canAccessProtectedPath('/meu-faturamento', 'staff', [])).toBe(true)
    expect(canAccessProtectedPath('/api/kpis/meu-faturamento', 'staff', [])).toBe(true)
    expect(canAccessProtectedPath('/api/kpis/meu-faturamento', 'estoque', [])).toBe(true)
    expect(canAccessProtectedPath('/api/kpis/meu-faturamento', 'financeiro', [])).toBe(true)
    expect(canAccessProtectedPath('/api/kpis', 'staff', [])).toBe(false)
    expect(canAccessProtectedPath('/dashboard', 'staff', [])).toBe(false)
  })

  it('profissional (staff + professional_name) sem Balcão/Pós-venda/Operação', () => {
    const opts = { professionalName: 'Alison Alvarez' }
    expect(canAccessProtectedPath('/hoje', 'staff', [], opts)).toBe(false)
    expect(canAccessProtectedPath('/recepcao', 'staff', [], opts)).toBe(false)
    expect(canAccessProtectedPath('/pos-venda', 'staff', [], opts)).toBe(false)
    expect(canAccessProtectedPath('/api/hoje', 'staff', [], opts)).toBe(false)
    expect(canAccessProtectedPath('/pipeline', 'staff', [], opts)).toBe(true)
    expect(canAccessProtectedPath('/contatos', 'staff', [], opts)).toBe(true)
    expect(canAccessProtectedPath('/meu-faturamento', 'staff', [], opts)).toBe(true)
  })

  it('staff genérico ainda alcança deep links de Operação (redirect na página)', () => {
    expect(canAccessProtectedPath('/hoje', 'staff', [])).toBe(true)
    expect(canAccessProtectedPath('/recepcao', 'staff', [])).toBe(true)
    expect(canAccessProtectedPath('/pos-venda', 'staff', [])).toBe(true)
    expect(canAccessProtectedPath('/api/hoje', 'staff', [])).toBe(true)
  })
})
