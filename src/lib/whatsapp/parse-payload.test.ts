import { describe, expect, it } from 'vitest'
import { parseWhatsAppPayload } from '@/lib/whatsapp/parse-payload'

describe('parseWhatsAppPayload', () => {
  it('aceita payload simples { from, text }', () => {
    const parsed = parseWhatsAppPayload({ from: '11999998888', text: '  Olá  ' })
    expect(parsed).toEqual({ from: '+5511999998888', text: 'Olá' })
  })

  it('ignora mensagens enviadas pelo próprio bot (fromMe)', () => {
    expect(parseWhatsAppPayload({ from: '11999998888', text: 'oi', fromMe: true })).toBeNull()
  })

  it('parseia webhook ManyChat (last_input_text + whatsapp_phone)', () => {
    const parsed = parseWhatsAppPayload({
      id: 123,
      whatsapp_phone: '+5511999998888',
      last_input_text: 'Quero agendar',
    })
    expect(parsed).toEqual({ from: '+5511999998888', text: 'Quero agendar' })
  })

  it('parseia webhook Evolution legado com remoteJid', () => {
    const parsed = parseWhatsAppPayload({
      data: {
        key: { remoteJid: '5511999998888@s.whatsapp.net', fromMe: false },
        message: { conversation: 'Quero agendar' },
      },
    })
    expect(parsed).toEqual({ from: '+5511999998888', text: 'Quero agendar' })
  })

  it('retorna null para payload inválido', () => {
    expect(parseWhatsAppPayload(null)).toBeNull()
    expect(parseWhatsAppPayload({})).toBeNull()
  })
})
