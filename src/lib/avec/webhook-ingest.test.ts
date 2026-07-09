import { describe, expect, it } from 'vitest'
import { normalizeAvecWebhookBody } from '@/lib/avec/webhook-ingest'

describe('normalizeAvecWebhookBody', () => {
  it('aceita payload ROM flat', () => {
    const n = normalizeAvecWebhookBody({
      event: 'appointment.created',
      client_id: '99',
      name: 'Ana',
      service_name: 'Corte',
      scheduled_at: '2026-07-10T14:00:00.000Z',
      professional_name: 'Walter',
      price: 120,
    })
    expect(n.event).toBe('appointment.created')
    expect(n.client_id).toBe('99')
    expect(n.professional_name).toBe('Walter')
    expect(n.price).toBe(120)
  })

  it('aceita aliases BR aninhados', () => {
    const n = normalizeAvecWebhookBody({
      tipo: 'agendamento.criado',
      cliente: { id: '44', nome: 'Marina', celular: '11988887777' },
      agendamento: {
        servico: 'Manicure',
        data: '10/07/2026',
        hora: '15:30',
        profissional: 'Dani',
        valor: '90,00',
      },
    })
    expect(n.event).toBe('appointment.created')
    expect(n.client_id).toBe('44')
    expect(n.service_name).toBe('Manicure')
    expect(n.professional_name).toBe('Dani')
    expect(n.price).toBe(90)
    expect(n.scheduled_at).toBeTruthy()
  })
})
