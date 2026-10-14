import { describe, expect, it } from 'vitest'
import type { ClientService } from '@/lib/services'
import { compareByOverdueThenName, urgencyForServices } from '@/lib/salon/urgency'

function service(overrides: Partial<ClientService> & Pick<ClientService, 'name'>): ClientService {
  return {
    id: 'svc-1',
    contact_id: 'contact-1',
    category: 'corte',
    cadence_days: 30,
    last_done_at: null,
    scheduled_at: null,
    product: null,
    notes: null,
    professional_name: null,
    last_price: null,
    active: true,
    created_at: new Date(Date.now() - 40 * 86_400_000).toISOString(),
    ...overrides,
  }
}

describe('urgencyForServices — cadência da última visita', () => {
  it('usa só o serviço com last_done mais recente (ignora SKU antigo)', () => {
    const result = urgencyForServices([
      service({
        id: 'a',
        name: 'PCT TERAPIA CAPILAR 8S novo',
        cadence_days: 30,
        last_done_at: new Date(Date.now() - 4 * 86_400_000).toISOString(),
      }),
      service({
        id: 'b',
        name: 'PCT TERAPIA CAPILAR 12S antigo',
        category: 'tratamento',
        cadence_days: 30,
        last_done_at: new Date(Date.now() - 90 * 86_400_000).toISOString(),
      }),
    ])

    expect(result.overdue).toBe(0)
    expect(result.max_overdue_days).toBe(0)
  })

  it('marca atrasado pela última visita além da cadência', () => {
    const result = urgencyForServices([
      service({
        id: 'a',
        name: 'Corte',
        cadence_days: 30,
        last_done_at: new Date(Date.now() - 40 * 86_400_000).toISOString(),
      }),
      service({
        id: 'b',
        name: 'Coloração',
        category: 'coloracao',
        cadence_days: 45,
        last_done_at: new Date(Date.now() - 90 * 86_400_000).toISOString(),
      }),
    ])

    expect(result.overdue).toBe(1)
    expect(result.max_overdue_days).toBeGreaterThanOrEqual(10)
  })
})

describe('compareByOverdueThenName', () => {
  it('prioriza mais dias sem retorno e desempatada por nome A–Z', () => {
    const rows = [
      { name: 'Zelia', max_overdue_days: 10 },
      { name: 'Ana', max_overdue_days: 10 },
      { name: 'Bruno', max_overdue_days: 40 },
      { name: 'Carla', max_overdue_days: 0 },
    ]
    const sorted = [...rows].sort(compareByOverdueThenName)
    expect(sorted.map((r) => r.name)).toEqual(['Bruno', 'Ana', 'Zelia', 'Carla'])
  })
})
