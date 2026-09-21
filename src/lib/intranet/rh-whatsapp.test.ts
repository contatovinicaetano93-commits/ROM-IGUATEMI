import { describe, expect, it, afterEach, vi } from 'vitest'
import { getRhWhatsAppNumber, RH_WHATSAPP_DEFAULT, RH_WHATSAPP_PREFILL } from '@/lib/intranet/rh-whatsapp'
import { whatsAppUrl } from '@/lib/salon/format'

describe('rh whatsapp fab', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('usa o número padrão do RH', () => {
    expect(getRhWhatsAppNumber()).toBe(RH_WHATSAPP_DEFAULT)
  })

  it('aceita override NEXT_PUBLIC_RH_WHATSAPP_NUMBER', () => {
    vi.stubEnv('NEXT_PUBLIC_RH_WHATSAPP_NUMBER', '11988887777')
    expect(getRhWhatsAppNumber()).toBe('11988887777')
  })

  it('monta wa.me com DDI 55 e mensagem', () => {
    const href = whatsAppUrl(RH_WHATSAPP_DEFAULT, RH_WHATSAPP_PREFILL)
    expect(href).toContain('https://wa.me/5511993455589')
    expect(href).toContain(encodeURIComponent(RH_WHATSAPP_PREFILL))
  })
})
