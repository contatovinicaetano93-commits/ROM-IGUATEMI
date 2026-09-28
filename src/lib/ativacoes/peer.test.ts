import { describe, expect, it } from 'vitest'
import { mergeSharedActivations, peekPeerDatabaseUrl } from '@/lib/ativacoes/peer'
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
})
