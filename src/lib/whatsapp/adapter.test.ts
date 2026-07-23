import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  WhatsAppCloudApiAdapter,
  toWhatsAppCloudPhone,
  verifyMetaHubSignature,
} from '@/lib/whatsapp/adapter'
import { createHmac } from 'crypto'

describe('toWhatsAppCloudPhone', () => {
  it('normaliza para dígitos com DDI', () => {
    expect(toWhatsAppCloudPhone('11999998888')).toBe('5511999998888')
    expect(toWhatsAppCloudPhone('+5511999998888')).toBe('5511999998888')
  })
})

describe('verifyMetaHubSignature', () => {
  it('valida HMAC sha256', () => {
    const secret = 'app-secret'
    const body = '{"object":"whatsapp_business_account"}'
    const sig = 'sha256=' + createHmac('sha256', secret).update(body, 'utf8').digest('hex')
    expect(verifyMetaHubSignature(body, sig, secret)).toBe(true)
    expect(verifyMetaHubSignature(body, 'sha256=deadbeef', secret)).toBe(false)
  })
})

describe('WhatsAppCloudApiAdapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('envia texto via Graph API', async () => {
    vi.stubEnv('WHATSAPP_CLOUD_TOKEN', 'token')
    vi.stubEnv('WHATSAPP_PHONE_NUMBER_ID', '123456')
    vi.stubEnv('WHATSAPP_SEND_MODE', 'text')

    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.method).toBe('POST')
      const body = JSON.parse(String(init?.body))
      expect(body.to).toBe('5511999998888')
      expect(body.type).toBe('text')
      expect(body.text.body).toBe('oi')
      return new Response(JSON.stringify({ messages: [{ id: 'wamid.x' }] }), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const adapter = new WhatsAppCloudApiAdapter()
    await adapter.sendMessage('11999998888', 'oi')
    expect(fetchMock).toHaveBeenCalled()
  })

  it('faz fallback para template fora da janela 24h', async () => {
    vi.stubEnv('WHATSAPP_CLOUD_TOKEN', 'token')
    vi.stubEnv('WHATSAPP_PHONE_NUMBER_ID', '123456')
    vi.stubEnv('WHATSAPP_SEND_MODE', 'auto')
    vi.stubEnv('WHATSAPP_TEMPLATE_AFTERCARE', 'rom_aftercare')
    vi.stubEnv('WHATSAPP_TEMPLATE_BODY_PARAM', '0')

    let calls = 0
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      calls++
      const body = JSON.parse(String(init?.body))
      if (calls === 1) {
        expect(body.type).toBe('text')
        return new Response(
          JSON.stringify({
            error: { message: 'Re-engagement message', code: 131047 },
          }),
          { status: 400 },
        )
      }
      expect(body.type).toBe('template')
      expect(body.template.name).toBe('rom_aftercare')
      return new Response(JSON.stringify({ messages: [{ id: 'wamid.y' }] }), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const adapter = new WhatsAppCloudApiAdapter()
    await adapter.sendMessage('+5511988887777', 'obrigado pela visita')
    expect(calls).toBe(2)
  })
})
