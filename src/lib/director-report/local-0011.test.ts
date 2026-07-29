import { describe, expect, it } from 'vitest'
import {
  aggregateLocal0011ByPro,
  local0011ClientKey,
  previousQuarterKey,
  splitAvecProfessionalNames,
} from './local-0011'
import type { DirectorProfessional } from './types'

const pros: DirectorProfessional[] = [
  {
    id: 'pro-beto',
    name: 'Beto Fortes',
    avec_pro_id: null,
    role: 'hairstylist',
    active: true,
  },
  {
    id: 'pro-dani',
    name: 'Daniel Viana Martins',
    avec_pro_id: null,
    role: 'hairstylist',
    active: true,
  },
]

describe('previousQuarterKey', () => {
  it('volta um trimestre', () => {
    expect(previousQuarterKey('2026-Q2')).toBe('2026-Q1')
    expect(previousQuarterKey('2026-Q1')).toBe('2025-Q4')
  })
})

describe('local0011ClientKey / splitAvecProfessionalNames', () => {
  it('prioriza telefone', () => {
    expect(local0011ClientKey('11999998888', 'Ana')).toBe('p:11999998888')
    expect(local0011ClientKey(null, 'Ana Silva')).toBe('n:ana silva')
  })

  it('parte lista de profissionais Avec', () => {
    expect(splitAvecProfessionalNames('BETO FORTES,DANIEL VIANA MARTINS')).toEqual([
      'BETO FORTES',
      'DANIEL VIANA MARTINS',
    ])
  })
})

describe('aggregateLocal0011ByPro', () => {
  it('calcula taxa e lista distintas por profissional', () => {
    const p1 = [
      {
        key: 'p:111',
        name: 'Cliente A',
        email: null,
        phone: '111',
        mobile: '111',
        lastVisit: '2026-03-10',
        proNames: ['BETO FORTES'],
      },
      {
        key: 'p:222',
        name: 'Cliente B',
        email: null,
        phone: '222',
        mobile: '222',
        lastVisit: '2026-03-11',
        proNames: ['BETO FORTES'],
      },
      {
        key: 'p:333',
        name: 'Cliente C',
        email: null,
        phone: '333',
        mobile: '333',
        lastVisit: '2026-03-12',
        proNames: ['DANIEL VIANA MARTINS'],
      },
    ]
    const p2 = [
      {
        key: 'p:111',
        name: 'Cliente A',
        email: null,
        phone: '111',
        mobile: '111',
        lastVisit: '2026-05-01',
        proNames: ['BETO FORTES'],
      },
    ]

    const byPro = aggregateLocal0011ByPro(p1, p2, pros)
    const beto = byPro.get('Beto Fortes')
    const dani = byPro.get('Daniel Viana Martins')

    expect(beto?.returnRates[0]).toBe(0.5) // 1/2
    expect(beto?.clients).toHaveLength(1)
    expect(beto?.clients[0]?.name).toBe('Cliente B')
    expect(beto?.clientsTotalHint).toBe(2)
    expect(beto?.clientsReturnedHint).toBe(1)

    expect(dani?.returnRates[0]).toBe(0) // 0/1
    expect(dani?.clients).toHaveLength(1)
    expect(dani?.clients[0]?.name).toBe('Cliente C')
  })

  it('usa lista 0007 de não-retornados quando fornecida', () => {
    const p1 = [
      {
        key: 'p:111',
        name: 'Cliente A',
        email: null,
        phone: '111',
        mobile: '111',
        lastVisit: '2026-03-10',
        proNames: ['BETO FORTES'],
      },
      {
        key: 'p:222',
        name: 'Cliente B',
        email: null,
        phone: '222',
        mobile: '222',
        lastVisit: '2026-03-11',
        proNames: ['BETO FORTES'],
      },
    ]
    const byPro = aggregateLocal0011ByPro(p1, [], pros, new Set(['p:222']))
    const beto = byPro.get('Beto Fortes')
    expect(beto?.returnRates[0]).toBe(0.5)
    expect(beto?.clients.map((c) => c.name)).toEqual(['Cliente B'])
  })
})
