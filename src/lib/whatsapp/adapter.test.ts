import { afterEach, describe, expect, it, vi } from 'vitest'
import { ManyChatApiAdapter, toManyChatWhatsAppPhone } from '@/lib/whatsapp/adapter'

describe('toManyChatWhatsAppPhone', () => {
  it('normaliza para E.164 com +', () => {
    expect(toManyChatWhatsAppPhone('11999998888')).toBe('+5511999998888')
    expect(toManyChatWhatsAppPhone('+5511999998888')).toBe('+5511999998888')
  })
})

describe('ManyChatApiAdapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('envia via sendContent após achar subscriber', async () => {
    vi.stubEnv('MANYCHAT_API_KEY', 'test-key')
    vi.stubEnv('MANYCHAT_SEND_MODE', 'content')

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('findBySystemField')) {
        return new Response(JSON.stringify({ status: 'success', data: [{ id: 42 }] }), {
          status: 200,
        })
      }
      if (url.includes('sendContent')) {
        expect(init?.method).toBe('POST')
        const body = JSON.parse(String(init?.body))
        expect(body.subscriber_id).toBe('42')
        expect(body.data.content.type).toBe('whatsapp')
        expect(body.data.content.messages[0].text).toBe('oi')
        return new Response(JSON.stringify({ status: 'success' }), { status: 200 })
      }
      throw new Error(`unexpected url ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const adapter = new ManyChatApiAdapter()
    await adapter.sendMessage('11999998888', 'oi')
    expect(fetchMock).toHaveBeenCalled()
  })

  it('cria subscriber quando não encontra', async () => {
    vi.stubEnv('MANYCHAT_API_KEY', 'test-key')
    vi.stubEnv('MANYCHAT_SEND_MODE', 'content')

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('findBySystemField')) {
        return new Response(JSON.stringify({ status: 'success', data: [] }), { status: 200 })
      }
      if (url.includes('createSubscriber')) {
        return new Response(JSON.stringify({ status: 'success', data: { id: 99 } }), {
          status: 200,
        })
      }
      if (url.includes('sendContent')) {
        return new Response(JSON.stringify({ status: 'success' }), { status: 200 })
      }
      throw new Error(`unexpected url ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const adapter = new ManyChatApiAdapter()
    await adapter.sendMessage('+5511988887777', 'teste')
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes('createSubscriber'))).toBe(true)
  })
})
