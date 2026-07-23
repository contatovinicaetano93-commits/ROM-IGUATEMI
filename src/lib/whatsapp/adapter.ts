import { retryWithBackoff } from '@/lib/retry'
import { normalizePhone } from '@/lib/avec/normalize'

/**
 * Interface de mensageria WhatsApp.
 * Provedor atual: ManyChat (canal oficial Meta).
 * Evolution / WhatsApp Cloud API direta foram removidos.
 */
export interface WhatsAppAdapter {
  sendMessage(to: string, text: string): Promise<void>
}

type ManyChatJson = {
  status?: string
  message?: string
  code?: number
  data?: unknown
}

function digitsOnly(value: string): string {
  return value.replace(/\D/g, '')
}

/** ManyChat espera E.164 com + (ex.: +5511999998888). */
export function toManyChatWhatsAppPhone(to: string): string {
  const normalized = normalizePhone(to)
  if (normalized) return normalized
  const digits = digitsOnly(to)
  if (!digits) throw new Error('Telefone inválido para ManyChat')
  return `+${digits}`
}

function isConfigured(): boolean {
  return Boolean(process.env.MANYCHAT_API_KEY?.trim())
}

export function isManyChatConfigured(): boolean {
  return isConfigured()
}

export class ManyChatApiAdapter implements WhatsAppAdapter {
  private apiKey: string
  private baseUrl: string
  private outboundFlowNs: string | null
  private messageField: string
  private phoneFieldId: string | null
  private sendMode: 'auto' | 'content' | 'flow'

  constructor() {
    const apiKey = process.env.MANYCHAT_API_KEY?.trim()
    if (!apiKey) {
      throw new Error('MANYCHAT_API_KEY não configurado')
    }
    this.apiKey = apiKey
    this.baseUrl = (process.env.MANYCHAT_API_BASE_URL?.trim() || 'https://api.manychat.com').replace(
      /\/$/,
      '',
    )
    this.outboundFlowNs = process.env.MANYCHAT_OUTBOUND_FLOW_NS?.trim() || null
    this.messageField = process.env.MANYCHAT_MESSAGE_FIELD?.trim() || 'rom_outbound_text'
    this.phoneFieldId = process.env.MANYCHAT_PHONE_FIELD_ID?.trim() || null
    const mode = (process.env.MANYCHAT_SEND_MODE?.trim() || 'auto').toLowerCase()
    this.sendMode = mode === 'content' || mode === 'flow' ? mode : 'auto'
  }

  async sendMessage(to: string, text: string): Promise<void> {
    const phone = toManyChatWhatsAppPhone(to)
    const subscriberId = await this.resolveSubscriberId(phone)

    if (this.sendMode === 'flow') {
      await this.sendViaFlow(subscriberId, text)
      return
    }

    if (this.sendMode === 'content') {
      await this.sendViaContent(subscriberId, text)
      return
    }

    // auto: tenta texto livre (janela 24h); se Meta bloquear, usa fluxo/template.
    try {
      await this.sendViaContent(subscriberId, text)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      const needsTemplate =
        /24\s*h|message tag|template|outside.*window|3011|can't be sent/i.test(msg)
      if (!needsTemplate || !this.outboundFlowNs) throw e
      await this.sendViaFlow(subscriberId, text)
    }
  }

  private async resolveSubscriberId(phoneE164: string): Promise<string> {
    const found = await this.findSubscriberId(phoneE164)
    if (found) return found

    try {
      const created = await this.createSubscriber(phoneE164)
      if (created) return created
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      // Contato já existe no WhatsApp — tenta achar de novo.
      if (!/already exists|WhatsApp ID/i.test(msg)) throw e
    }

    const again = await this.findSubscriberId(phoneE164)
    if (again) return again
    throw new Error(`ManyChat: não foi possível resolver subscriber para ${phoneE164}`)
  }

  private async findSubscriberId(phoneE164: string): Promise<string | null> {
    const digits = digitsOnly(phoneE164)

    // 1) System field `phone` (SMS) — funciona se criamos o contato com phone + whatsapp_phone.
    const bySystem = await this.apiGet<ManyChatJson>(
      `/fb/subscriber/findBySystemField?${new URLSearchParams({ phone: digits }).toString()}`,
    )
    const fromSystem = this.pickSubscriberId(bySystem?.data)
    if (fromSystem) return fromSystem

    // 2) Custom field espelho (recomendado para WhatsApp-only).
    if (this.phoneFieldId) {
      for (const value of [phoneE164, digits, `+${digits}`]) {
        const byCustom = await this.apiGet<ManyChatJson>(
          `/fb/subscriber/findByCustomField?${new URLSearchParams({
            field_id: this.phoneFieldId,
            field_value: value,
          }).toString()}`,
        )
        const id = this.pickSubscriberId(byCustom?.data)
        if (id) return id
      }
    }

    return null
  }

  private pickSubscriberId(data: unknown): string | null {
    if (!data) return null
    const rows = Array.isArray(data) ? data : [data]
    for (const row of rows) {
      if (!row || typeof row !== 'object') continue
      const id = (row as { id?: unknown }).id
      if (typeof id === 'number' || typeof id === 'string') return String(id)
    }
    return null
  }

  private async createSubscriber(phoneE164: string): Promise<string | null> {
    const digits = digitsOnly(phoneE164)
    const json = await this.apiPost<ManyChatJson>('/fb/subscriber/createSubscriber', {
      first_name: 'Cliente',
      whatsapp_phone: phoneE164,
      // Espelha no campo system `phone` para findBySystemField funcionar.
      phone: digits,
      has_opt_in_sms: true,
      has_opt_in_email: false,
      consent_phrase: 'ROM Club — contato operacional do salão',
    })
    return this.pickSubscriberId(json?.data)
  }

  private async sendViaContent(subscriberId: string, text: string): Promise<void> {
    await this.apiPost('/fb/sending/sendContent', {
      subscriber_id: subscriberId,
      data: {
        version: 'v2',
        content: {
          type: 'whatsapp',
          messages: [{ type: 'text', text }],
        },
      },
    })
  }

  private async sendViaFlow(subscriberId: string, text: string): Promise<void> {
    if (!this.outboundFlowNs) {
      throw new Error(
        'ManyChat: envie fora da janela 24h exige MANYCHAT_OUTBOUND_FLOW_NS (fluxo com template)',
      )
    }

    // Injeta texto dinâmico no custom field antes do fluxo (template usa o campo).
    await this.apiPost('/fb/subscriber/setCustomFieldByName', {
      subscriber_id: subscriberId,
      field_name: this.messageField,
      field_value: text,
    }).catch(() => {
      // Campo pode não existir ainda — o fluxo ainda pode usar template fixo.
    })

    await this.apiPost('/fb/sending/sendFlow', {
      subscriber_id: subscriberId,
      flow_ns: this.outboundFlowNs,
    })
  }

  private async apiGet<T>(path: string): Promise<T> {
    return this.request<T>('GET', path)
  }

  private async apiPost<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', path, body)
  }

  private async request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    return retryWithBackoff(
      async () => {
        const res = await fetch(`${this.baseUrl}${path}`, {
          method,
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            Accept: 'application/json',
            ...(body != null ? { 'Content-Type': 'application/json' } : {}),
          },
          body: body != null ? JSON.stringify(body) : undefined,
          signal: AbortSignal.timeout(15_000),
        })

        const raw = await res.text()
        let json: ManyChatJson | null = null
        try {
          json = raw ? (JSON.parse(raw) as ManyChatJson) : null
        } catch {
          json = null
        }

        if (!res.ok || json?.status === 'error') {
          const detail = json?.message || raw || res.statusText
          const err = new Error(`ManyChat API ${res.status}: ${detail}`)
          ;(err as Error & { status?: number; code?: number }).status = res.status
          if (typeof json?.code === 'number') {
            ;(err as Error & { code?: number }).code = json.code
          }
          throw err
        }

        return (json ?? {}) as T
      },
      {
        maxAttempts: 3,
        initialDelayMs: 1000,
        shouldRetry: (e) => {
          const status = (e as Error & { status?: number }).status
          return status === undefined || status >= 500
        },
      },
    )
  }
}

export function getWhatsAppAdapter(): WhatsAppAdapter {
  return new ManyChatApiAdapter()
}
