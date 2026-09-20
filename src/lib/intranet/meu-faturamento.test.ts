import { describe, expect, it } from 'vitest'
import { resolveMeuFaturamento } from '@/lib/intranet/meu-faturamento'
import type { P1ProfessionalRow } from '@/lib/salon/p1-metrics'

const sample: P1ProfessionalRow[] = [
  { name: 'Ana Souza', revenue: 1200, attended: 10, ticket_avg: 120, occupancy: 0.4 },
  { name: 'Cida', revenue: 0, attended: 0, ticket_avg: 0, occupancy: null },
]

describe('resolveMeuFaturamento', () => {
  it('sem nome ou sem snapshot → null (não inventa 0)', () => {
    expect(resolveMeuFaturamento(sample, null).revenue).toBeNull()
    expect(resolveMeuFaturamento([], 'Ana').revenue).toBeNull()
  })

  it('casa por nome próximo e preserva R$ 0 real', () => {
    const ana = resolveMeuFaturamento(sample, 'Ana Souza - Colorista')
    expect(ana.matched_name).toBe('Ana Souza')
    expect(ana.revenue).toBe(1200)
    expect(ana.attended).toBe(10)

    const cida = resolveMeuFaturamento(sample, 'Cida')
    expect(cida.revenue).toBe(0)
    expect(cida.occupancy).toBeNull()
  })

  it('nome sem match → null', () => {
    expect(resolveMeuFaturamento(sample, 'Fulano Inexistente').matched_name).toBeNull()
    expect(resolveMeuFaturamento(sample, 'Fulano Inexistente').revenue).toBeNull()
  })
})
