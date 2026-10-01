import { describe, expect, it } from 'vitest'
import { canAccessFolha } from '@/lib/folha/access'

describe('canAccessFolha', () => {
  it('libera admin e quem tem o módulo folha', () => {
    expect(canAccessFolha({ role: 'admin' })).toBe(true)
    expect(canAccessFolha({ role: 'financeiro', modules: ['folha'] })).toBe(true)
    expect(canAccessFolha({ role: 'staff', modules: ['folha'] })).toBe(true)
  })

  it('bloqueia staff/financeiro sem o módulo', () => {
    expect(canAccessFolha({ role: 'staff' })).toBe(false)
    expect(canAccessFolha({ role: 'financeiro' })).toBe(false)
    expect(canAccessFolha({ role: 'mkt' })).toBe(false)
    expect(canAccessFolha({ role: 'estoque' })).toBe(false)
  })
})
