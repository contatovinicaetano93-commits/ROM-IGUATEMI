import { describe, expect, it } from 'vitest'
import { isMissingIntranetRelation } from '@/lib/employees'

describe('isMissingIntranetRelation', () => {
  it('não trata CHECK de module_key como tabela ausente', () => {
    const err = new Error(
      'check constraint "intranet_employee_modules_module_key_check" of relation "intranet_employee_modules" is violated by some row',
    )
    expect(isMissingIntranetRelation(err)).toBe(false)
  })

  it('reconhece relation does not exist', () => {
    expect(
      isMissingIntranetRelation(new Error('relation "intranet_employees" does not exist')),
    ).toBe(true)
    expect(
      isMissingIntranetRelation(new Error('relation "intranet_employee_modules" does not exist')),
    ).toBe(true)
  })

  it('reconhece DATABASE_URL ausente', () => {
    expect(isMissingIntranetRelation(new Error('DATABASE_URL não configurada'))).toBe(true)
  })
})
