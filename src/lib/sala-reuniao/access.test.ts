import { describe, expect, it } from 'vitest'
import { canCancelSalaReuniao, canUseSalaReuniao } from '@/lib/sala-reuniao/access'

describe('sala-reuniao access', () => {
  it('bloqueia profissional mesmo com módulo no papel', () => {
    expect(
      canUseSalaReuniao({
        role: 'staff',
        modules: [],
        professionalName: 'Alison',
      }),
    ).toBe(false)
  })

  it('libera staff sem professional_name (módulo no pacote)', () => {
    expect(
      canUseSalaReuniao({
        role: 'staff',
        modules: [],
        professionalName: null,
      }),
    ).toBe(true)
  })

  it('libera financeiro e mkt pelo pacote', () => {
    expect(
      canUseSalaReuniao({
        role: 'financeiro',
        modules: [],
        professionalName: null,
      }),
    ).toBe(true)
    expect(
      canUseSalaReuniao({
        role: 'mkt',
        modules: [],
        professionalName: null,
      }),
    ).toBe(true)
  })

  it('cancelamento: dono ou admin', () => {
    const reservation = { created_by_employee_id: 'emp-1' }
    expect(
      canCancelSalaReuniao(
        {
          role: 'staff',
          employeeId: 'emp-1',
          modules: [],
          professionalName: null,
        },
        reservation,
      ),
    ).toBe(true)
    expect(
      canCancelSalaReuniao(
        {
          role: 'staff',
          employeeId: 'emp-2',
          modules: [],
          professionalName: null,
        },
        reservation,
      ),
    ).toBe(false)
    expect(
      canCancelSalaReuniao(
        {
          role: 'admin',
          employeeId: 'other',
          modules: [],
          professionalName: null,
        },
        reservation,
      ),
    ).toBe(true)
  })
})
