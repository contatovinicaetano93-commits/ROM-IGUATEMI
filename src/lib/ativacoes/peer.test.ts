import { afterEach, describe, expect, it, vi } from 'vitest'

const getSqlForUrl = vi.hoisted(() => vi.fn())

vi.mock('@/lib/db', () => ({
  getSqlForUrl,
}))

import {
  listPeerBrandActivationsForMonth,
  mergeSharedActivations,
  peekPeerDatabaseUrl,
  PEER_LIST_SOFT_MS,
} from '@/lib/ativacoes/peer'
import type { BrandActivation } from '@/lib/ativacoes/types'

function stub(partial: Partial<BrandActivation> & Pick<BrandActivation, 'id' | 'day' | 'unit'>): BrandActivation {
  return {
    start_time: '10:00',
    end_time: '12:00',
    brand: 'X',
    condition: 'comercial',
    notes: null,
    status: 'confirmed',
    created_by_employee_id: null,
    created_by_name: 'A',
    created_by_role: 'mkt',
    cancelled_by_name: null,
    cancelled_at: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    writable: partial.unit === 'brasil',
    ...partial,
  }
}

describe('ativacoes peer', () => {
  it('resolve URL do peer a partir de UNIT_*', () => {
    expect(
      peekPeerDatabaseUrl('brasil', {
        UNIT_IGUATEMI_DATABASE_URL: 'postgres://ig',
      }),
    ).toBe('postgres://ig')
    expect(
      peekPeerDatabaseUrl('iguatemi', {
        UNIT_BRASIL_DATABASE_URL: 'postgres://br',
      }),
    ).toBe('postgres://br')
    expect(peekPeerDatabaseUrl('brasil', {})).toBeNull()
  })

  it('mescla e ordena calendário compartilhado', () => {
    const merged = mergeSharedActivations(
      [stub({ id: '1', day: '2026-09-28', unit: 'brasil', start_time: '14:00', end_time: '16:00' })],
      [stub({ id: '2', day: '2026-09-28', unit: 'iguatemi', start_time: '10:00', end_time: '11:00', writable: false })],
    )
    expect(merged.map((a) => a.id)).toEqual(['2', '1'])
  })

  it('mantém soft-timeout do peer bem abaixo do hard limit da Vercel', () => {
    expect(PEER_LIST_SOFT_MS).toBeLessThan(10_000)
    expect(PEER_LIST_SOFT_MS).toBeGreaterThan(0)
  })
})

const peerRow = {
  id: 'peer-1',
  day: '2026-09-02',
  start_time: '10:00:00',
  end_time: '11:00:00',
  brand: 'ROM',
  condition: 'comercial',
  notes: null,
  status: 'confirmed',
  created_by_employee_id: null,
  created_by_name: 'Ana',
  created_by_role: 'mkt',
  cancelled_by_name: null,
  cancelled_at: null,
  created_at: '2026-09-01T00:00:00.000Z',
  updated_at: '2026-09-01T00:00:00.000Z',
}

function installPeerSql(mode: 'ok' | 'missing-column' | 'timeout' | 'other') {
  const calls = { begin: 0, unsafe: 0 }
  const sql = Object.assign(
    async (strings: TemplateStringsArray) => {
      const text = strings.join(' ')
      if (mode === 'timeout') {
        throw Object.assign(new Error('canceling statement due to statement timeout'), {
          code: '57014',
        })
      }
      if (mode === 'other') throw new Error('connection reset')
      if (mode === 'missing-column' && text.includes('end_time::text as end_time')) {
        throw Object.assign(new Error('column "end_time" does not exist'), { code: '42703' })
      }
      return [peerRow]
    },
    {
      async unsafe(query: string, params?: unknown[]) {
        calls.unsafe += 1
        expect(query).toContain("set_config('statement_timeout'")
        expect(params).toEqual(['3500'])
        return []
      },
      async begin(fn: (txn: typeof sql) => Promise<unknown>) {
        calls.begin += 1
        return fn(sql)
      },
    },
  )
  getSqlForUrl.mockReset()
  getSqlForUrl.mockReturnValue(sql)
  return calls
}

describe('listPeerBrandActivationsForMonth', () => {
  const prevPanel = process.env.ROM_PANEL
  const prevPeer = process.env.UNIT_IGUATEMI_DATABASE_URL

  afterEach(() => {
    if (prevPanel === undefined) delete process.env.ROM_PANEL
    else process.env.ROM_PANEL = prevPanel
    if (prevPeer === undefined) delete process.env.UNIT_IGUATEMI_DATABASE_URL
    else process.env.UNIT_IGUATEMI_DATABASE_URL = prevPeer
    vi.restoreAllMocks()
  })

  it('lê o mês do peer com begin + unsafe', async () => {
    process.env.ROM_PANEL = 'brasil'
    process.env.UNIT_IGUATEMI_DATABASE_URL = 'postgres://iguatemi/db'
    const calls = installPeerSql('ok')

    const result = await listPeerBrandActivationsForMonth('2026-09')

    expect(calls.begin).toBe(1)
    expect(calls.unsafe).toBe(1)
    expect(result.offline).toBe(false)
    expect(result.activations.map((row) => row.id)).toEqual(['peer-1'])
    expect(getSqlForUrl).toHaveBeenCalledWith('postgres://iguatemi/db')
  })

  it('reconsulta só quando end_time não existe', async () => {
    process.env.ROM_PANEL = 'brasil'
    process.env.UNIT_IGUATEMI_DATABASE_URL = 'postgres://iguatemi/db'
    const calls = installPeerSql('missing-column')

    const result = await listPeerBrandActivationsForMonth('2026-09')

    expect(calls.begin).toBe(2)
    expect(calls.unsafe).toBe(2)
    expect(result.offline).toBe(false)
    expect(result.activations).toHaveLength(1)
  })

  it('timeout do statement não abre uma segunda transação', async () => {
    process.env.ROM_PANEL = 'brasil'
    process.env.UNIT_IGUATEMI_DATABASE_URL = 'postgres://iguatemi/db'
    const calls = installPeerSql('timeout')
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await listPeerBrandActivationsForMonth('2026-09')

    expect(calls.begin).toBe(1)
    expect(calls.unsafe).toBe(1)
    expect(result).toEqual({ activations: [], offline: true, unconfigured: false })
  })

  it('qualquer outra falha também não reconsulta', async () => {
    process.env.ROM_PANEL = 'brasil'
    process.env.UNIT_IGUATEMI_DATABASE_URL = 'postgres://iguatemi/db'
    const calls = installPeerSql('other')
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await listPeerBrandActivationsForMonth('2026-09')

    expect(calls.begin).toBe(1)
    expect(calls.unsafe).toBe(1)
    expect(result.offline).toBe(true)
  })
})
