import { describe, expect, it } from 'vitest'
import {
  coalesceProfessionalsOccupancy,
  findNearProInMap,
  firstAndLastTokenKey,
  firstNameCompatible,
  matchDirectorProfessional,
  namesLooselyMatch,
  normalizeProKey,
  occupancyMergeKey,
  stripCargoSuffix,
  surnameCompatible,
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

  it('ponto de apelido Avec vira espaço', () => {
    expect(normalizeProKey('LUCAS.KAMPOS')).toBe('lucas kampos')
    expect(normalizeProKey('DANI.MARINIELLO')).toBe('dani mariniello')
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

describe('firstNameCompatible / namesLooselyMatch', () => {
  it('casa prefixo e typo Avec no prenome', () => {
    expect(firstNameCompatible('dani', 'daniela')).toBe(true)
    expect(firstNameCompatible('manu', 'manoel')).toBe(true)
    expect(firstNameCompatible('nanda', 'fernanda')).toBe(true)
    expect(surnameCompatible('kampos', 'campos')).toBe(true)
  })

  it('não casa prenome com token do meio', () => {
    expect(firstNameCompatible('dani', 'dantas')).toBe(true) // dantas starts with dani — but
    // namesLooselyMatch must not use that as first-token of MARCIEL DANTAS
    expect(
      namesLooselyMatch(
        occupancyMergeKey('DANI.MARINIELLO'),
        occupancyMergeKey('MARCIEL DANTAS DE BRITO'),
      ),
    ).toBe(false)
  })

  it('casa apelido 0126 com nome completo 0021', () => {
    expect(
      namesLooselyMatch(
        occupancyMergeKey('DANI.MARINIELLO'),
        occupancyMergeKey('DANIELA MARINIELLO'),
      ),
    ).toBe(true)
    expect(
      namesLooselyMatch(
        occupancyMergeKey('LUCAS.KAMPOS'),
        occupancyMergeKey('LUCAS CAMPOS DE MACEDO'),
      ),
    ).toBe(true)
    expect(
      namesLooselyMatch(
        occupancyMergeKey('MAURICIO CARVALHO'),
        occupancyMergeKey('MAURICIO DE CARVALHO LIMA'),
      ),
    ).toBe(true)
    expect(
      namesLooselyMatch(
        occupancyMergeKey('ALAN.A'),
        occupancyMergeKey('Alan Fernando de Albuquerque'),
      ),
    ).toBe(true)
    expect(
      namesLooselyMatch(occupancyMergeKey('JANDER'), occupancyMergeKey('JANDERSON DE SA BARROS')),
    ).toBe(true)
    expect(
      namesLooselyMatch(
        occupancyMergeKey('GABRIELPERTANELA'),
        occupancyMergeKey('GABRIEL LEANDRO PETARNELA'),
      ),
    ).toBe(true)
  })

  it('não mistura Ulisses / Jander↔Janaina', () => {
    expect(
      namesLooselyMatch(
        occupancyMergeKey('ULISSES PETRI'),
        occupancyMergeKey('ULISSES SILVA JUNIOR'),
      ),
    ).toBe(false)
    expect(
      namesLooselyMatch(occupancyMergeKey('JANDER'), occupancyMergeKey('JANAINA SANTANA')),
    ).toBe(false)
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

  it('casa apelido pontuado do 0126', () => {
    const byPro = new Map([
      [
        occupancyMergeKey('DANIELA MARINIELLO'),
        { name: 'DANIELA MARINIELLO', occupancy: null as number | null },
      ],
      [
        occupancyMergeKey('LUCAS CAMPOS DE MACEDO'),
        { name: 'LUCAS CAMPOS DE MACEDO', occupancy: null as number | null },
      ],
    ])
    expect(findNearProInMap(byPro, 'DANI.MARINIELLO')?.value.name).toBe('DANIELA MARINIELLO')
    expect(findNearProInMap(byPro, 'LUCAS.KAMPOS')?.value.name).toBe('LUCAS CAMPOS DE MACEDO')
  })

  it('não adivinha quando dois batem no mesmo first+last', () => {
    const byPro = new Map([
      ['lucas kampos', { name: 'Lucas Kampos' }],
      ['lucas sales', { name: 'Lucas Sales' }],
    ])
    expect(findNearProInMap(byPro, 'Lucas')).toBeNull()
  })
})

describe('coalesceProfessionalsOccupancy', () => {
  it('funde órfãos 0126 nas linhas 0021', () => {
    const merged = coalesceProfessionalsOccupancy([
      {
        name: 'DANIELA MARINIELLO',
        revenue: 8492,
        attended: 9,
        ticket_avg: 943,
        occupancy: null,
      },
      {
        name: 'LUCAS CAMPOS DE MACEDO',
        revenue: 63334,
        attended: 42,
        ticket_avg: 1508,
        occupancy: null,
      },
      {
        name: 'DANI.MARINIELLO',
        revenue: 0,
        attended: 0,
        ticket_avg: 0,
        occupancy: 0.4167,
      },
      {
        name: 'LUCAS.KAMPOS',
        revenue: 0,
        attended: 0,
        ticket_avg: 0,
        occupancy: 0.65625,
      },
      {
        name: 'TERMINAL SALAO',
        revenue: 0,
        attended: 0,
        ticket_avg: 0,
        occupancy: 0.14,
      },
    ])
    const dani = merged.find((p) => p.name === 'DANIELA MARINIELLO')
    const lucas = merged.find((p) => p.name === 'LUCAS CAMPOS DE MACEDO')
    expect(dani?.occupancy).toBeCloseTo(0.4167)
    expect(lucas?.occupancy).toBeCloseTo(0.65625)
    expect(merged.some((p) => p.name === 'DANI.MARINIELLO')).toBe(false)
    expect(merged.some((p) => p.name === 'LUCAS.KAMPOS')).toBe(false)
    expect(merged.some((p) => p.name === 'TERMINAL SALAO')).toBe(true)
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
    expect(matchDirectorProfessional('Lucas Kampos', withCollision)?.id).toBe('pro-lucas-kampos')
    expect(matchDirectorProfessional('Lucas Sales', withCollision)?.id).toBe('pro-lucas-sales')
  })
})
