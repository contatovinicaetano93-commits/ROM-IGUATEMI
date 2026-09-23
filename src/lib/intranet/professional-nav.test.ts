import { describe, expect, it } from 'vitest'
import {
  isProfessionalHiddenPath,
  isProfessionalStaff,
  shouldHideOpsShellNav,
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

describe('shouldHideOpsShellNav', () => {
  it('esconde Balcão/Pós/Operação de qualquer papel autenticado', () => {
    expect(shouldHideOpsShellNav('admin', null)).toBe(true)
    expect(shouldHideOpsShellNav('financeiro', null)).toBe(true)
    expect(shouldHideOpsShellNav('estoque', null)).toBe(true)
    expect(shouldHideOpsShellNav('mkt', null)).toBe(true)
    expect(shouldHideOpsShellNav('staff', null)).toBe(true)
    expect(shouldHideOpsShellNav('staff', 'Romeu Felipe')).toBe(true)
    expect(shouldHideOpsShellNav(null, null)).toBe(false)
  })
})

describe('isProfessionalHiddenPath', () => {
  it('marca Balcão, Pós-venda e Operação', () => {
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

  it('deep links legados continuam marcados (páginas redirecionam para Agenda/Contatos)', () => {
    expect(PROFESSIONAL_HIDDEN_HREFS).toEqual(['/hoje', '/recepcao', '/pos-venda'])
  })
})
