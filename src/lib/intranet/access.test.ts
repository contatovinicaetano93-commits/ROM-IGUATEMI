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

  it('estoque não entra em financeiro nem Rom Adm', () => {
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
})
