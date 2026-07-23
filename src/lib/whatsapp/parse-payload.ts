import { normalizePhone } from '@/lib/avec/normalize'

function pickText(msg: Record<string, unknown> | undefined): string | null {
  if (!msg) return null
  if (typeof msg.conversation === 'string' && msg.conversation.trim()) return msg.conversation.trim()
  const ext = msg.extendedTextMessage as Record<string, unknown> | undefined
  if (typeof ext?.text === 'string' && ext.text.trim()) return ext.text.trim()
  const img = msg.imageMessage as Record<string, unknown> | undefined
  if (typeof img?.caption === 'string' && img.caption.trim()) return img.caption.trim()
  const btn = msg.buttonsResponseMessage as Record<string, unknown> | undefined
  const selected = btn?.selectedButtonId ?? btn?.selectedDisplayText
  if (typeof selected === 'string' && selected.trim()) return selected.trim()
  return null
}

function jidToPhone(jid: string): string | null {
  const digits = jid.split('@')[0]?.replace(/\D/g, '') ?? ''
  return normalizePhone(digits)
}

function isFromMe(data: Record<string, unknown>): boolean {
  const key = data.key as Record<string, unknown> | undefined
  return key?.fromMe === true || data.fromMe === true
}

function parseCloudApiMessage(body: Record<string, unknown>): { from: string; text: string } | null {
  if (body.object !== 'whatsapp_business_account') return null
  const entry = body.entry as unknown[] | undefined
  if (!Array.isArray(entry)) return null

  for (const ent of entry) {
    if (!ent || typeof ent !== 'object') continue
    const changes = (ent as { changes?: unknown[] }).changes
    if (!Array.isArray(changes)) continue
    for (const change of changes) {
      if (!change || typeof change !== 'object') continue
      const value = (change as { value?: Record<string, unknown> }).value
      if (!value) continue
      const messages = value.messages as unknown[] | undefined
      if (!Array.isArray(messages) || messages.length === 0) continue
      const msg = messages[0] as Record<string, unknown>
      if (msg.type && msg.type !== 'text' && msg.type !== 'button' && msg.type !== 'interactive') {
        // Ainda tenta extrair texto de botão/interativo abaixo.
      }
      const fromRaw = typeof msg.from === 'string' ? msg.from : null
      if (!fromRaw) continue

      let text: string | null = null
      const textObj = msg.text as { body?: string } | undefined
      if (typeof textObj?.body === 'string' && textObj.body.trim()) text = textObj.body.trim()

      const button = msg.button as { text?: string; payload?: string } | undefined
      if (!text && typeof button?.text === 'string' && button.text.trim()) text = button.text.trim()
      if (!text && typeof button?.payload === 'string' && button.payload.trim()) {
        text = button.payload.trim()
      }

      const interactive = msg.interactive as Record<string, unknown> | undefined
      const buttonReply = interactive?.button_reply as { title?: string; id?: string } | undefined
      const listReply = interactive?.list_reply as { title?: string; id?: string } | undefined
      if (!text && typeof buttonReply?.title === 'string') text = buttonReply.title.trim()
      if (!text && typeof listReply?.title === 'string') text = listReply.title.trim()

      if (!text) continue
      const phone = normalizePhone(fromRaw) ?? (fromRaw.startsWith('+') ? fromRaw : `+${fromRaw}`)
      return { from: phone, text }
    }
  }
  return null
}

/**
 * Aceita:
 * - WhatsApp Cloud API (Meta) — object=whatsapp_business_account
 * - payload simples `{ from, text }`
 * - legado ManyChat / Evolution (compat)
 */
export function parseWhatsAppPayload(body: unknown): { from: string; text: string } | null {
  if (!body || typeof body !== 'object') return null
  const b = body as Record<string, unknown>

  if (b.fromMe === true) return null

  const cloud = parseCloudApiMessage(b)
  if (cloud) return cloud

  // Status-only webhook Meta (entregue/lido) — não é mensagem de usuário.
  if (b.object === 'whatsapp_business_account') return null

  if (typeof b.from === 'string' && typeof b.text === 'string') {
    const phone = normalizePhone(b.from) ?? b.from
    return { from: phone, text: b.text.trim() }
  }

  // ManyChat External Request (legado)
  const mcPhone =
    (typeof b.whatsapp_phone === 'string' && b.whatsapp_phone) ||
    (typeof b.phone === 'string' && b.phone) ||
    null
  const mcText =
    (typeof b.last_input_text === 'string' && b.last_input_text) ||
    (typeof b.text === 'string' && b.text) ||
    null
  if (mcPhone && mcText) {
    const phone = normalizePhone(mcPhone) ?? mcPhone
    return { from: phone, text: mcText.trim() }
  }

  const data = (b.data ?? b.message ?? b) as Record<string, unknown>
  if (data && typeof data === 'object') {
    if (isFromMe(data)) return null

    const key = data.key as Record<string, unknown> | undefined
    const jid = (key?.remoteJid ?? data.remoteJid ?? data.from) as string | undefined
    const msg = (data.message ?? data) as Record<string, unknown>
    const text = pickText(msg)
    if (jid && text) {
      const phone = jidToPhone(jid)
      if (phone) return { from: phone, text }
    }
  }

  const messages = b.messages as unknown[] | undefined
  if (Array.isArray(messages) && messages[0] && typeof messages[0] === 'object') {
    return parseWhatsAppPayload(messages[0])
  }

  return null
}
