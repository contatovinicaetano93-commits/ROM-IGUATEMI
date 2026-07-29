import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/avec/client', () => ({
  isAvecConfigured: vi.fn(() => false),
  isAvecMock: vi.fn(() => false),
}))

vi.mock('./avec-live', () => ({
  fetchLiveDirectorBlocks: vi.fn(),
  directorFullBudget: vi.fn(() => ({})),
  directorUiBudget: vi.fn(() => ({})),
  DIRECTOR_UI_SLIM_MAX_PAGES: 4,
}))

vi.mock('./professionals', () => ({
  listDirectorProfessionals: vi.fn(() => [
    { id: 'p1', name: 'Pro Teste', role: 'hairstylist', active: true },
  ]),
  DIRECTOR_FLOOR_ROLES: ['hairstylist', 'makeup'],
}))

import { isAvecConfigured, isAvecMock } from '@/lib/avec/client'
import { buildDirectorReport } from './build'

describe('buildDirectorReport — só dados reais', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('sem Avec e sem forceMock → source error e blocos vazios', async () => {
    vi.mocked(isAvecConfigured).mockReturnValue(false)
    vi.mocked(isAvecMock).mockReturnValue(false)
    const r = await buildDirectorReport({ stages: '0011', forceMock: false })
    expect(r.source).toBe('error')
    expect(r.return_blocks).toEqual([])
    expect(r.revenue_blocks).toEqual([])
    expect(r.schedule_note).toMatch(/sem fixture/i)
  })

  it('forceMock → source mock com fixture', async () => {
    const r = await buildDirectorReport({ stages: '0011', forceMock: true })
    expect(r.source).toBe('mock')
    expect(r.return_blocks.length).toBeGreaterThan(0)
  })
})
