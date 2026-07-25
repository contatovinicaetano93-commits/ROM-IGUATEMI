import { describe, expect, it } from 'vitest'
import {
  findNearProInMap,
  firstAndLastTokenKey,
  matchDirectorProfessional,
  normalizeProKey,
  occupancyMergeKey,
  stripCargoSuffix,
} from './match-pro'
import type { DirectorProfessional } from './types'

const pros: DirectorProfessional[] = [
  { id: 'pro-dani-mariniello', name: 'Dani Mariniello', avec_pro_id: '99', role: 'hairstylist', active: true },
  { id: 'pro-vitor-m', name: 'Vitor M', avec_pro_id: null, role: 'hairstylist', active: true },
  { id: 'pro-walter-leal', name: 'Walter Leal', avec_pro_id: null, role: 'hairstylist', active: true },
]

describe('normalizeProKey', () => {
  it('remove acentos e case', () => {
    expect(normalizeProKey('Maurício Carvalho')).toBe('mauricio carvalho')
  })
})

describe('stripCargoSuffix / occupancyMergeKey', () => {
  it('remove cargo após hífen', () => {
    expect(stripCargoSuffix('Ana Silva - Cabeleireira')).toBe('Ana Silva')
    expect(occupancyMergeKey('Ana Silva - Cabeleireira')).toBe('ana silva')
  })

  it('remove cargo entre parênteses', () => {
    expect(stripCargoSuffix('João (Barbeiro)')).toBe('João')
  })
})

describe('firstAndLastTokenKey', () => {
  it('pega primeiro e último', () => {
    expect(firstAndLastTokenKey('maria clara souza')).toBe('maria souza')
  })
})

describe('findNearProInMap', () => {
  it('casa first+last entre 0021 e 0126', () => {
    const byPro = new Map([
      ['maria clara souza', { name: 'Maria Clara Souza', occupancy: null as number | null }],
    ])
    const hit = findNearProInMap(byPro, 'Maria Souza - Manicure')
    expect(hit?.value.name).toBe('Maria Clara Souza')
  })

  it('casa apelido ⊂ nome completo (Mauricio / Diogo / Douglas)', () => {
    const byPro = new Map([
      [occupancyMergeKey('MAURICIO DE CARVALHO LIMA'), { name: 'MAURICIO DE CARVALHO LIMA', occupancy: null as number | null }],
      [occupancyMergeKey('DIOGO MARCELO PITARO'), { name: 'DIOGO MARCELO PITARO', occupancy: null as number | null }],
      [occupancyMergeKey('DOUGLAS DA CONCEIÇÃO GARCIA'), { name: 'DOUGLAS DA CONCEIÇÃO GARCIA', occupancy: null as number | null }],
    ])
    expect(findNearProInMap(byPro, 'MAURICIO CARVALHO')?.value.name).toBe('MAURICIO DE CARVALHO LIMA')
    expect(findNearProInMap(byPro, 'DIOGO PITARO')?.value.name).toBe('DIOGO MARCELO PITARO')
    expect(findNearProInMap(byPro, 'DOUGLAS GARCIA')?.value.name).toBe('DOUGLAS DA CONCEIÇÃO GARCIA')
  })

  it('casa sobrenome com typo leve (kampos/campos)', () => {
    const byPro = new Map([
      [occupancyMergeKey('LUCAS CAMPOS DE MACEDO'), { name: 'LUCAS CAMPOS DE MACEDO', occupancy: null as number | null }],
    ])
    expect(findNearProInMap(byPro, ' LUCAS.KAMPOS')?.value.name).toBe('LUCAS CAMPOS DE MACEDO')
  })

  it('não adivinha quando dois batem no mesmo first+last', () => {
    const byPro = new Map([
      ['lucas kampos', { name: 'Lucas Kampos' }],
      ['lucas sales', { name: 'Lucas Sales' }],
    ])
    expect(findNearProInMap(byPro, 'Lucas')).toBeNull()
  })
})

describe('matchDirectorProfessional', () => {
  it('casa por avec_pro_id', () => {
    expect(matchDirectorProfessional('99', pros)?.id).toBe('pro-dani-mariniello')
  })

  it('casa nome completo', () => {
    expect(matchDirectorProfessional('DANI MARINIELLO', pros)?.id).toBe('pro-dani-mariniello')
  })

  it('casa prefixo / primeiro nome', () => {
    expect(matchDirectorProfessional('Dani', pros)?.id).toBe('pro-dani-mariniello')
    expect(matchDirectorProfessional('Walter', pros)?.id).toBe('pro-walter-leal')
  })

  it('casa Vitor M', () => {
    expect(matchDirectorProfessional('Vitor M', pros)?.id).toBe('pro-vitor-m')
  })

  it('casa com sufixo de cargo', () => {
    expect(matchDirectorProfessional('Walter Leal - Cabeleireiro', pros)?.id).toBe('pro-walter-leal')
  })

  it('não adivinha quando dois profissionais colidem no mesmo primeiro nome', () => {
    const withCollision: DirectorProfessional[] = [
      ...pros,
      { id: 'pro-lucas-kampos', name: 'Lucas Kampos', avec_pro_id: null, role: 'hairstylist', active: true },
      { id: 'pro-lucas-sales', name: 'Lucas Sales', avec_pro_id: null, role: 'hairstylist', active: true },
    ]
    expect(matchDirectorProfessional('Lucas', withCollision)).toBeNull()
    // nome completo continua funcionando normalmente, sem ambiguidade
    expect(matchDirectorProfessional('Lucas Kampos', withCollision)?.id).toBe('pro-lucas-kampos')
    expect(matchDirectorProfessional('Lucas Sales', withCollision)?.id).toBe('pro-lucas-sales')
  })
})
