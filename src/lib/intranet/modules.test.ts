import { describe, expect, it } from 'vitest'
import {
  extrasBeyondRole,
  effectiveModules,
  canSeeNavHref,
  hasPanelModule,
  parseGrantableModules,
  roleModulePack,
} from '@/lib/intranet/modules'

describe('parseGrantableModules', () => {
  it('ignora chave desconhecida e mantém a ordem do catálogo', () => {
    expect(parseGrantableModules(['dashboard', 'nope', 'financeiro'])).toEqual([
      'financeiro',
      'dashboard',
    ])
  })
})

describe('hasPanelModule', () => {
  it('admin vê todos os módulos grantable', () => {
    expect(hasPanelModule('admin', [], 'financeiro')).toBe(true)
    expect(hasPanelModule('admin', [], 'dashboard')).toBe(true)
  })

  it('staff ganha financeiro só com extra', () => {
    expect(hasPanelModule('staff', [], 'financeiro')).toBe(false)
    expect(hasPanelModule('staff', ['financeiro'], 'financeiro')).toBe(true)
    expect(hasPanelModule('staff', [], 'pipeline')).toBe(true)
  })

  it('financeiro não ganha pipeline no pacote', () => {
    expect(hasPanelModule('financeiro', [], 'pipeline')).toBe(false)
    expect(hasPanelModule('financeiro', ['pipeline'], 'pipeline')).toBe(true)
    expect(hasPanelModule('financeiro', [], 'relatorios')).toBe(true)
  })
})

describe('roleModulePack / effectiveModules', () => {
  it('exporta o pacote fixo do papel', () => {
    expect(roleModulePack('estoque')).toEqual(['estoque'])
    expect(effectiveModules('staff', ['dashboard'])).toEqual(['pipeline', 'contatos', 'dashboard'])
  })
})

describe('extrasBeyondRole', () => {
  it('não persiste o que já vem do papel', () => {
    expect(extrasBeyondRole('staff', ['pipeline', 'financeiro'])).toEqual(['financeiro'])
    expect(extrasBeyondRole('admin', ['financeiro', 'dashboard'])).toEqual([])
  })
})

describe('canSeeNavHref', () => {
  it('Gestão de usuário e auditoria só para admin', () => {
    expect(canSeeNavHref('/pessoas', 'admin', [])).toBe(true)
    expect(canSeeNavHref('/pessoas', 'staff', [])).toBe(false)
    expect(canSeeNavHref('/auditoria', 'financeiro', [])).toBe(false)
  })

  it('módulos grantable respeitam o pacote + extras', () => {
    expect(canSeeNavHref('/financeiro', 'staff', [])).toBe(false)
    expect(canSeeNavHref('/financeiro', 'staff', ['financeiro'])).toBe(true)
    expect(canSeeNavHref('/contatos', 'financeiro', [])).toBe(false)
  })

  it('ninguém vê Balcão/Pós/Operação no menu; Agenda e Contatos ficam', () => {
    for (const role of ['admin', 'staff', 'financeiro', 'estoque', 'mkt'] as const) {
      expect(canSeeNavHref('/hoje', role, [])).toBe(false)
      expect(canSeeNavHref('/recepcao', role, [])).toBe(false)
      expect(canSeeNavHref('/pos-venda', role, [])).toBe(false)
    }
    expect(canSeeNavHref('/hoje', 'staff', [], { professionalName: 'Alison' })).toBe(false)
    expect(canSeeNavHref('/pipeline', 'staff', [], { professionalName: 'Alison' })).toBe(true)
    expect(canSeeNavHref('/contatos', 'staff', [], { professionalName: 'Alison' })).toBe(true)
    expect(canSeeNavHref('/pipeline', 'admin', [])).toBe(true)
    expect(canSeeNavHref('/contatos', 'admin', [])).toBe(true)
  })
})
