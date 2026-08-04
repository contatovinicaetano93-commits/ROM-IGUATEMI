import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DirectorProfessional, QuarterKey } from './types'

const db = vi.hoisted(() => ({
  coverage: new Map<string, unknown>(),
  visits: new Map<string, unknown[]>(),
  sqlMock: vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = Array.from(strings).join('')
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

import { isVisitCoverageReady, tryFetch0011QuarterPairFromDb } from './from-db'

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
