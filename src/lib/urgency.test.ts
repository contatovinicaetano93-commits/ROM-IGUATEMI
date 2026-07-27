import { describe, expect, it } from 'vitest'
import type { ClientService } from '@/lib/services'
import { urgencyForServices } from '@/lib/salon/urgency'

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

describe('urgencyForServices (compat)', () => {
  it('marca serviço atrasado quando cadência venceu', () => {
    const result = urgencyForServices([
      service({
        name: 'Corte',
        cadence_days: 30,
        last_done_at: new Date(Date.now() - 35 * 86_400_000).toISOString(),
      }),
    ])

    expect(result.overdue).toBe(1)
    expect(result.urgency_score).toBeGreaterThan(0)
    expect(result.top_action).toContain('atrasado')
  })

  it('prioriza atrasados sobre vencendo em urgency_score', () => {
    const overdue = urgencyForServices([
      service({
        name: 'Coloração',
        category: 'coloracao',
        cadence_days: 45,
        last_done_at: new Date(Date.now() - 50 * 86_400_000).toISOString(),
      }),
    ])
    const dueSoon = urgencyForServices([
      service({
        name: 'Corte',
        cadence_days: 30,
        last_done_at: new Date(Date.now() - 28 * 86_400_000).toISOString(),
      }),
    ])

    expect(overdue.urgency_score).toBeGreaterThan(dueSoon.urgency_score)
  })
})
