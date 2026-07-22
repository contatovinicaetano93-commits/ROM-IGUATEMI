import { describe, expect, it } from 'vitest'
import { buildAftercareWhatsAppMessage } from '@/lib/whatsapp/aftercare-message'

describe('buildAftercareWhatsAppMessage', () => {
  it('inclui nome, serviço e cadência', () => {
    const text = buildAftercareWhatsAppMessage({
      contactName: 'Ana Silva',
      serviceName: 'Coloração',
      cadenceDays: 45,
      bookingLink: 'https://example.com/agendar',
    })
    expect(text).toContain('Ana')
    expect(text).toContain('Coloração')
    expect(text).toContain('45 dias')
    expect(text).toContain('https://example.com/agendar')
  })

  it('omite cadência quando null', () => {
    const text = buildAftercareWhatsAppMessage({
      contactName: 'Bia',
      serviceName: 'Corte',
      cadenceDays: null,
      bookingLink: null,
    })
    expect(text).not.toContain('dias')
    expect(text).toContain('responder esta mensagem')
  })
})
