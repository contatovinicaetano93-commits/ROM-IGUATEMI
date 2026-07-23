import { createHmac, timingSafeEqual } from 'crypto'
import { retryWithBackoff } from '@/lib/retry'
import { normalizePhone } from '@/lib/avec/normalize'

/**
 * Interface de mensageria WhatsApp.
 * Provedor atual: WhatsApp Cloud API oficial (Meta Graph).
 */
export interface WhatsAppAdapter {
  sendMessage(to: string, text: string): Promise<void>
}

type GraphErrorBody = {
  error?: {
    message?: string
    type?: string
    code?: number
    error_subcode?: number
    error_data?: { details?: string }
  }
}

function digitsOnly(value: string): string {
  return value.replace(/\D/g, '')
}

/** Cloud API espera dígitos com DDI, sem + (ex.: 5511999998888). */
export function toWhatsAppCloudPhone(to: string): string {
  const normalized = normalizePhone(to)
  const digits = digitsOnly(normalized ?? to)
  if (digits.length < 10) throw new Error('Telefone inválido para WhatsApp Cloud API')
  return digits
}

export function isWhatsAppCloudConfigured(): boolean {
  return Boolean(
    process.env.WHATSAPP_CLOUD_TOKEN?.trim() && process.env.WHATSAPP_PHONE_NUMBER_ID?.trim(),
  )
}

function isOutsideCustomerWindowError(message: string, code?: number): boolean {
  if (code === 131047 || code === 131026 || code === 470) return true
  return /24\s*hour|outside.*window|re-engag|template|not in allowed|(#131047)|(#131026)/i.test(
    message,
  )
}

export class WhatsAppCloudApiAdapter implements WhatsAppAdapter {
  private token: string
  private phoneNumberId: string
  private apiVersion: string
  private templateName: string | null
  private templateLang: string
  private sendMode: 'auto' | 'text' | 'template'

  constructor() {
    const token = process.env.WHATSAPP_CLOUD_TOKEN?.trim()
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim()
    if (!token || !phoneNumberId) {
      throw new Error(
        'WhatsApp Cloud API não configurada — defina WHATSAPP_CLOUD_TOKEN e WHATSAPP_PHONE_NUMBER_ID',
      )
    }
    this.token = token
    this.phoneNumberId = phoneNumberId
    this.apiVersion = process.env.WHATSAPP_CLOUD_API_VERSION?.trim() || 'v21.0'
    this.templateName = process.env.WHATSAPP_TEMPLATE_AFTERCARE?.trim() || null
    this.templateLang = process.env.WHATSAPP_TEMPLATE_LANG?.trim() || 'pt_BR'
    const mode = (process.env.WHATSAPP_SEND_MODE?.trim() || 'auto').toLowerCase()
    this.sendMode = mode === 'text' || mode === 'template' ? mode : 'auto'
  }

  async sendMessage(to: string, text: string): Promise<void> {
    const phone = toWhatsAppCloudPhone(to)

    if (this.sendMode === 'template') {
      await this.sendTemplate(phone, text)
      return
    }

    if (this.sendMode === 'text') {
      await this.sendText(phone, text)
      return
    }

    // auto: texto livre na janela 24h; fora dela usa template aprovado (se configurado).
    try {
      await this.sendText(phone, text)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      const code = (e as Error & { code?: number }).code
      if (!isOutsideCustomerWindowError(msg, code) || !this.templateName) throw e
      await this.sendTemplate(phone, text)
    }
  }

  private async sendText(to: string, text: string): Promise<void> {
    await this.postMessages({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { preview_url: false, body: text.slice(0, 4096) },
    })
  }

  /**
   * Template aprovado na Meta.
   * Se o template tiver 1 variável no body, envia o texto (truncado) como parâmetro.
   * Sem variáveis: dispara só o template fixo.
   */
  private async sendTemplate(to: string, text: string): Promise<void> {
    if (!this.templateName) {
      throw new Error(
        'WhatsApp Cloud: fora da janela 24h exige WHATSAPP_TEMPLATE_AFTERCARE (template aprovado)',
      )
    }

    const useBodyParam = process.env.WHATSAPP_TEMPLATE_BODY_PARAM !== '0'
    const body: Record<string, unknown> = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'template',
      template: {
        name: this.templateName,
        language: { code: this.templateLang },
        ...(useBodyParam
          ? {
              components: [
                {
                  type: 'body',
                  parameters: [{ type: 'text', text: text.slice(0, 1024) }],
                },
              ],
            }
          : {}),
      },
    }

    try {
      await this.postMessages(body)
    } catch (e) {
      // Template sem variável — tenta de novo sem components.
      const msg = e instanceof Error ? e.message : String(e)
      if (useBodyParam && /parameter|component|variable|number of params/i.test(msg)) {
        await this.postMessages({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to,
          type: 'template',
          template: {
            name: this.templateName,
            language: { code: this.templateLang },
          },
        })
        return
      }
      throw e
    }
  }

  private async postMessages(payload: Record<string, unknown>): Promise<void> {
    const url = `https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}/messages`

    await retryWithBackoff(
      async () => {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(15_000),
        })

        const raw = await res.text()
        let json: GraphErrorBody | null = null
        try {
          json = raw ? (JSON.parse(raw) as GraphErrorBody) : null
        } catch {
          json = null
        }

        if (!res.ok) {
          const detail = json?.error?.message || raw || res.statusText
          const err = new Error(`WhatsApp Cloud API ${res.status}: ${detail}`)
          ;(err as Error & { status?: number; code?: number }).status = res.status
          if (typeof json?.error?.code === 'number') {
            ;(err as Error & { code?: number }).code = json.error.code
          }
          throw err
        }
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
  return new WhatsAppCloudApiAdapter()
}

/** Verifica assinatura X-Hub-Signature-256 do webhook Meta. */
export function verifyMetaHubSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string,
): boolean {
  if (!signatureHeader?.startsWith('sha256=')) return false
  const expected = createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex')
  const got = signatureHeader.slice('sha256='.length)
  try {
    const a = Buffer.from(expected, 'utf8')
    const b = Buffer.from(got, 'utf8')
    return a.length === b.length && timingSafeEqual(a, b)
  } catch {
    return false
  }
}
