import { afterEach, describe, expect, it, vi } from 'vitest'
import { sendFinanceReminder } from '@/lib/whatsapp/reminders'

const sendMessage = vi.fn(async () => undefined)

vi.mock('@/lib/whatsapp/adapter', () => ({
  getWhatsAppAdapter: () => ({ sendMessage }),
}))

vi.mock('@/lib/brand', () => ({
  getBrand: () => ({ displayName: 'ROM CLUB IGUATEMI' }),
}))

vi.mock('@/lib/deployment', () => ({
  defaultProductionHost: () => 'rom-iguatemi.vercel.app',
}))

describe('sendFinanceReminder', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    sendMessage.mockClear()
  })

  it('retorna sent:false quando nenhum número está configurado', async () => {
    vi.stubEnv('FINANCE_WHATSAPP_NUMBER', '')
    vi.stubEnv('ADMIN_WHATSAPP_NUMBER', '')
    const result = await sendFinanceReminder()
    expect(result).toEqual({
      sent: false,
      reason: 'nenhum_numero_configurado',
      sent_to: [],
      failed: 0,
    })
    expect(sendMessage).not.toHaveBeenCalled()
  })

  it('envia para FINANCE_WHATSAPP_NUMBER e ADMIN_WHATSAPP_NUMBER (dedupe)', async () => {
    vi.stubEnv('FINANCE_WHATSAPP_NUMBER', '5511999990001')
    vi.stubEnv('ADMIN_WHATSAPP_NUMBER', '5511999990001')
    const result = await sendFinanceReminder()
    expect(result.sent).toBe(true)
    expect(result.sent_to).toEqual(['5511999990001'])
    expect(result.failed).toBe(0)
    expect(sendMessage).toHaveBeenCalledTimes(1)
    expect(sendMessage.mock.calls[0][1]).toMatch(/Lembrete Financeiro — ROM CLUB IGUATEMI/)
    expect(sendMessage.mock.calls[0][1]).toMatch(/rom-iguatemi\.vercel\.app\/financeiro/)
  })
})
