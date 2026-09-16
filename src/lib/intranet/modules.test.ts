import { describe, expect, it } from 'vitest'
import {
  extrasBeyondRole,
  hasPanelModule,
  parseGrantableModules,
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

describe('extrasBeyondRole', () => {
  it('não persiste o que já vem do papel', () => {
    expect(extrasBeyondRole('staff', ['pipeline', 'financeiro'])).toEqual(['financeiro'])
    expect(extrasBeyondRole('admin', ['financeiro', 'dashboard'])).toEqual([])
  })
})
