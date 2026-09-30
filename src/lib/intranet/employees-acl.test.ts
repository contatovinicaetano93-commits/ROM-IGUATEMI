import { describe, expect, it } from 'vitest'
import { canListAllEmployees } from '@/lib/intranet/employees-acl'
import type { AuthRole } from '@/lib/auth'

describe('canListAllEmployees', () => {
  it('permite apenas panel_role admin', () => {
    expect(canListAllEmployees('admin')).toBe(true)
  })

  it('nega staff, financeiro, estoque e mkt', () => {
    const denied: AuthRole[] = ['staff', 'financeiro', 'estoque', 'mkt']
    for (const role of denied) {
      expect(canListAllEmployees(role)).toBe(false)
    }
  })

  it('nega sessão ausente', () => {
    expect(canListAllEmployees(null)).toBe(false)
    expect(canListAllEmployees(undefined)).toBe(false)
  })
})
