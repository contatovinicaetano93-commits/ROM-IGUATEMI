import { describe, expect, it } from 'vitest'
import {
  buildProfessionalDayMetrics,
  buildUnitDayMetrics,
  canViewUnitDayRevenue,
} from '@/lib/intranet/resumo-do-dia'
import type { ScheduledServiceRow } from '@/lib/services'

function row(
  partial: Partial<ScheduledServiceRow> & { contact_id: string },
): ScheduledServiceRow {
  return {
    id: partial.id ?? `s-${partial.contact_id}`,
    contact_id: partial.contact_id,
    name: partial.name ?? 'Corte',
    category: partial.category ?? 'corte',
    cadence_days: null,
    product: null,
    notes: null,
    last_done_at: partial.last_done_at ?? null,
    scheduled_at: partial.scheduled_at ?? '2026-09-23T12:00:00.000Z',
    active: true,
    created_at: '2026-09-23T00:00:00.000Z',
    professional_name: partial.professional_name ?? 'Jefferson',
    last_price: partial.last_price ?? null,
    contact_name: partial.contact_name ?? 'Cliente',
  }
}

describe('buildProfessionalDayMetrics', () => {
  it('soma last_price dos concluídos e conta cabeças; null se sem preço', () => {
    const withPrice = buildProfessionalDayMetrics('2026-09-23', 'Jefferson', {
      scheduled: [row({ contact_id: 'a' }), row({ contact_id: 'b' })],
      courtesy: [],
      completed: [
        row({ contact_id: 'c', last_price: 100 }),
        row({ contact_id: 'c', last_price: 50 }), // mesma cabeça
        row({ contact_id: 'd', last_price: 80 }),
      ],
    })
    expect(withPrice.mode).toBe('professional')
    expect(withPrice.title).toBe('Meu dia')
    expect(withPrice.scheduled).toBe(2)
    expect(withPrice.attended).toBe(2)
    expect(withPrice.revenue).toBe(230)
    expect(withPrice.no_shows).toBeNull()

    const noPrice = buildProfessionalDayMetrics('2026-09-23', 'Jefferson', {
      scheduled: [],
      courtesy: [],
      completed: [row({ contact_id: 'x', last_price: null })],
    })
    expect(noPrice.revenue).toBeNull()
    expect(noPrice.attended).toBe(1)
  })
})

describe('buildUnitDayMetrics', () => {
  it('respeita canViewMoney e não inventa 0', () => {
    const salon = {
      day: '2026-09-23',
      revenue: 5000,
      attended: 12,
      no_shows: 2,
      cancelled: 1,
      ticket_avg: 400,
    }
    const money = buildUnitDayMetrics(salon, 8, true)
    expect(money.title).toBe('Resumo do dia')
    expect(money.revenue).toBe(5000)
    expect(money.scheduled).toBe(8)
    expect(money.no_shows).toBe(2)

    const blind = buildUnitDayMetrics(salon, 8, false)
    expect(blind.revenue).toBeNull()
    expect(blind.ticket_avg).toBeNull()
    expect(blind.attended).toBe(12)

    const missing = buildUnitDayMetrics(null, 3, true)
    expect(missing.revenue).toBeNull()
    expect(missing.attended).toBeNull()
    expect(missing.scheduled).toBe(3)
  })
})

describe('canViewUnitDayRevenue', () => {
  it('admin e financeiro sim; staff não', () => {
    expect(canViewUnitDayRevenue('admin')).toBe(true)
    expect(canViewUnitDayRevenue('financeiro')).toBe(true)
    expect(canViewUnitDayRevenue('staff')).toBe(false)
  })
})
