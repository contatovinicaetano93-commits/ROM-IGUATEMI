import { describe, expect, it } from 'vitest'
import {
  isProfessionalHiddenPath,
  isProfessionalStaff,
  PROFESSIONAL_HIDDEN_HREFS,
} from '@/lib/intranet/professional-nav'

describe('isProfessionalStaff', () => {
  it('só staff com professional_name', () => {
    expect(isProfessionalStaff('staff', 'Romeu Felipe')).toBe(true)
    expect(isProfessionalStaff('staff', '  ')).toBe(false)
    expect(isProfessionalStaff('staff', null)).toBe(false)
    expect(isProfessionalStaff('admin', 'Romeu Felipe')).toBe(false)
    expect(isProfessionalStaff('financeiro', 'Romeu Felipe')).toBe(false)
  })
})

describe('isProfessionalHiddenPath', () => {
  it('esconde Balcão, Pós-venda e Operação', () => {
    for (const href of PROFESSIONAL_HIDDEN_HREFS) {
      expect(isProfessionalHiddenPath(href)).toBe(true)
      expect(isProfessionalHiddenPath(`${href}/x`)).toBe(true)
    }
    expect(isProfessionalHiddenPath('/api/hoje')).toBe(true)
  })

  it('mantém Agenda, Contatos e Faturamento', () => {
    expect(isProfessionalHiddenPath('/pipeline')).toBe(false)
    expect(isProfessionalHiddenPath('/contatos')).toBe(false)
    expect(isProfessionalHiddenPath('/meu-faturamento')).toBe(false)
    expect(isProfessionalHiddenPath('/flow')).toBe(false)
  })
})
