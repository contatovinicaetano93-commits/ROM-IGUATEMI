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

function phoneFromManyChat(b: Record<string, unknown>): string | null {
  const candidates = [
    b.whatsapp_phone,
    b.phone,
    b.wa_id,
    b.from,
    (b.contact as Record<string, unknown> | undefined)?.whatsapp_phone,
    (b.contact as Record<string, unknown> | undefined)?.phone,
    (b.subscriber as Record<string, unknown> | undefined)?.whatsapp_phone,
    (b.subscriber as Record<string, unknown> | undefined)?.phone,
  ]
  for (const c of candidates) {
    if (typeof c !== 'string' || !c.trim()) continue
    const phone = normalizePhone(c) ?? c.replace(/\D/g, '')
    if (phone) return phone.startsWith('+') ? phone : normalizePhone(phone) ?? `+${phone.replace(/\D/g, '')}`
  }
  return null
}

function textFromManyChat(b: Record<string, unknown>): string | null {
  const candidates = [
    b.last_input_text,
    b.text,
    b.message,
    (b.data as Record<string, unknown> | undefined)?.text,
    (b.payload as Record<string, unknown> | undefined)?.last_input_text,
  ]
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim()
  }
  return null
}

/**
 * Aceita:
 * - payload simples `{ from, text }`
 * - External Request / callback ManyChat
 * - legado Evolution (remoteJid) — mantido só para compat
 */
export function parseWhatsAppPayload(body: unknown): { from: string; text: string } | null {
  if (!body || typeof body !== 'object') return null
  const b = body as Record<string, unknown>

  if (b.fromMe === true) return null

  if (typeof b.from === 'string' && typeof b.text === 'string') {
    const phone = normalizePhone(b.from) ?? b.from
    return { from: phone, text: b.text.trim() }
  }

  // ManyChat External Request / webhook
  const mcPhone = phoneFromManyChat(b)
  const mcText = textFromManyChat(b)
  if (mcPhone && mcText) {
    return { from: mcPhone, text: mcText }
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
