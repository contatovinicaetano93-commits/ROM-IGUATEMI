import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DirectorProfessional, QuarterKey } from './types'

const db = vi.hoisted(() => ({
  coverage: new Map<string, unknown>(),
  coverage0021: new Map<string, { month: string; row_count: number; truncated: boolean; synced_at: string; professionals?: unknown[] }>(),
  visits: new Map<string, unknown[]>(),
  sqlMock: vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = Array.from(strings).join('')
    if (/from salon_director_0021_months/i.test(text) && /where month/i.test(text)) {
      const month = String(values[0])
      const cov = db.coverage0021.get(month)
      if (/select professionals/i.test(text)) {
        return cov?.professionals ? [{ professionals: cov.professionals }] : []
      }
      return cov ? [cov] : []
    }
    if (/from salon_client_visits/i.test(text)) {
      return db.visits.get(String(values[0])) ?? []
    }
    if (/from salon_visit_sync_coverage/i.test(text) && /where period_key/i.test(text)) {
      return db.coverage.get(String(values[0])) ? [db.coverage.get(String(values[0]))] : []
    }
    return []
  }),
}))

vi.mock('@/lib/db', () => ({
  getSql: () => db.sqlMock,
}))

import {
  is0021MonthCoverageReady,
  isVisitCoverageReady,
  tryFetch0011QuarterPairFromDb,
  tryFetch0021MonthFromDb,
} from './from-db'

const pros: DirectorProfessional[] = [
  {
    id: 'pro-1',
    name: 'Pro Teste',
    avec_pro_id: null,
    role: 'hairstylist',
    active: true,
  },
]

function readyCoverage(period: QuarterKey) {
  return {
    period_key: period,
    row_count: 10,
    truncated: false,
    synced_at: '2026-08-03',
  }
}

function visit(
  clientKey: string,
  clientName: string,
  visitedOn: string,
  professionalNames = ['Pro Teste'],
) {
  return {
    client_key: clientKey,
    visited_on: visitedOn,
    client_name: clientName,
    phone: clientKey.replace(/^p:/, ''),
    mobile: clientKey.replace(/^p:/, ''),
    email: null,
    professional_names: professionalNames,
  }
}

beforeEach(() => {
  db.coverage.clear()
  db.coverage0021.clear()
  db.visits.clear()
  db.sqlMock.mockClear()
})

describe('isVisitCoverageReady', () => {
  it('exige cobertura não truncada com linhas', () => {
    expect(isVisitCoverageReady(null)).toBe(false)
    expect(
      isVisitCoverageReady({
        period_key: '2026-Q2',
        row_count: 0,
        truncated: false,
        synced_at: '2026-08-03',
      }),
    ).toBe(false)
    expect(
      isVisitCoverageReady({
        period_key: '2026-Q2',
        row_count: 120,
        truncated: true,
        synced_at: '2026-08-03',
      }),
    ).toBe(false)
    expect(
      isVisitCoverageReady({
        period_key: '2026-Q2',
        row_count: 120,
        truncated: false,
        synced_at: '2026-08-03',
      }),
    ).toBe(true)
  })
})

describe('tryFetch0011QuarterPairFromDb', () => {
  it('retorna selected via DB quando compare ainda não tem cobertura completa', async () => {
    db.coverage.set('2026-Q2', readyCoverage('2026-Q2'))
    db.coverage.set('2026-Q1', readyCoverage('2026-Q1'))
    db.visits.set('2026-Q1', [
      visit('p:111', 'Cliente Retornou', '2026-02-10'),
      visit('p:222', 'Cliente Na Lista', '2026-02-11'),
    ])
    db.visits.set('2026-Q2', [visit('p:111', 'Cliente Retornou', '2026-05-10')])

    const pair = await tryFetch0011QuarterPairFromDb('2026-Q2', '2025-Q4', pros)

    expect(pair).not.toBeNull()
    expect(pair?.selected.source).toBe('local')
    expect(pair?.selected.note).toMatch(/proxy última visita 0002/i)
    expect(pair?.compare.source).toBe('none')
    expect(pair?.compare.note).toMatch(/cobertura faltante/i)
    expect(pair?.compare.note).toMatch(/2025-Q4/)
  })

  it('retorna null quando a cobertura do selected está incompleta', async () => {
    db.coverage.set('2026-Q2', readyCoverage('2026-Q2'))

    const pair = await tryFetch0011QuarterPairFromDb('2026-Q2', '2026-Q1', pros)

    expect(pair).toBeNull()
  })
})

describe('is0021MonthCoverageReady', () => {
  it('exige cobertura não truncada com linhas', () => {
    expect(is0021MonthCoverageReady(null)).toBe(false)
    expect(
      is0021MonthCoverageReady({
        month: '2026-07',
        row_count: 0,
        truncated: false,
        synced_at: '2026-08-03',
      }),
    ).toBe(false)
    expect(
      is0021MonthCoverageReady({
        month: '2026-07',
        row_count: 12,
        truncated: true,
        synced_at: '2026-08-03',
      }),
    ).toBe(false)
    expect(
      is0021MonthCoverageReady({
        month: '2026-07',
        row_count: 12,
        truncated: false,
        synced_at: '2026-08-03',
      }),
    ).toBe(true)
  })
})

describe('tryFetch0021MonthFromDb', () => {
  it('retorna mapa por profissional quando cobertura pronta', async () => {
    db.coverage0021.set('2026-07', {
      month: '2026-07',
      row_count: 2,
      truncated: false,
      synced_at: '2026-08-03',
      professionals: [
        { name: 'Pro A', revenue: 1000, attended: 10, ticket_avg: 100 },
        { name: 'Pro B', revenue: 500, attended: 5, ticket_avg: 100 },
      ],
    })

    const map = await tryFetch0021MonthFromDb('2026-07')

    expect(map).not.toBeNull()
    expect(map?.get('Pro A')).toMatchObject({ revenue: 1000, attended: 10, ticketAvg: 100 })
    expect(map?.get('Pro B')).toMatchObject({ revenue: 500, attended: 5, ticketAvg: 100 })
  })

  it('retorna null quando cobertura truncada ou ausente', async () => {
    db.coverage0021.set('2026-06', {
      month: '2026-06',
      row_count: 5,
      truncated: true,
      synced_at: '2026-08-03',
      professionals: [{ name: 'Pro A', revenue: 1, attended: 1, ticket_avg: 1 }],
    })

    expect(await tryFetch0021MonthFromDb('2026-06')).toBeNull()
    expect(await tryFetch0021MonthFromDb('2025-01')).toBeNull()
  })
})
