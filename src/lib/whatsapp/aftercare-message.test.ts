import { afterEach, describe, expect, it } from 'vitest'
import {
  buildAftercareWhatsAppMessage,
  resolveAftercareBookingLink,
} from '@/lib/whatsapp/aftercare-message'

const originalBookingLink = process.env.WHATSAPP_BOOKING_LINK

afterEach(() => {
  if (originalBookingLink === undefined) delete process.env.WHATSAPP_BOOKING_LINK
  else process.env.WHATSAPP_BOOKING_LINK = originalBookingLink
})

describe('resolveAftercareBookingLink', () => {
  it('aceita link explícito da unidade', () => {
    expect(resolveAftercareBookingLink('https://wa.me/5511999999999')).toBe(
      'https://wa.me/5511999999999',
    )
  })

  it('recusa link claramente do Brasil (env herdado)', () => {
    process.env.WHATSAPP_BOOKING_LINK = 'https://wa.me/5511?text=ROM%20Club%20Brasil'
    expect(resolveAftercareBookingLink(null)).toBe('')
    expect(resolveAftercareBookingLink('https://maps.example/av-brasil-123')).toBe('')
  })
})

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

  it('omite cadência e link quando null / link BR rejeitado', () => {
    process.env.WHATSAPP_BOOKING_LINK = 'https://example.com/rom-club-brasil'
    const text = buildAftercareWhatsAppMessage({
      contactName: 'Bia',
      serviceName: 'Corte',
      cadenceDays: null,
      bookingLink: null,
    })
    expect(text).not.toContain('dias')
    expect(text).toContain('responder esta mensagem')
    expect(text).not.toContain('rom-club-brasil')
  })
})
