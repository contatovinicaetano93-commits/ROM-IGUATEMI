import { NextRequest } from 'next/server'
import { ok, err } from '@/lib/api-response'
import { Logger } from '@/lib/logger'
import { logEvent } from '@/lib/contacts'
import { getWhatsAppAdapter } from '@/lib/whatsapp/adapter'
import { handleWhatsAppMessage } from '@/lib/whatsapp/conversation'
import { parseWhatsAppPayload } from '@/lib/whatsapp/parse-payload'
import { verifyWhatsAppWebhook } from '@/lib/webhooks'

const logger = new Logger('WhatsAppWebhook')

export async function POST(req: NextRequest) {
  const auth = verifyWhatsAppWebhook(req)
  if (!auth.ok) return err(auth.reason, 401)

  const body = await req.json().catch(() => null)
  const parsed = parseWhatsAppPayload(body)
  if (!parsed) {
    logger.error('Unrecognized WhatsApp webhook payload', { payload: body })
    return err('Payload inválido', 422)
  }

  const { from, text } = parsed
  logger.debug('WhatsApp message received', { from, hasText: !!text })

  try {
    const { contactId, reply, intent, handoff } = await handleWhatsAppMessage(from, text)
    logger.debug('WhatsApp response generated', { from, intent, handoff, hasReply: !!reply })

    await getWhatsAppAdapter().sendMessage(from, reply)
    logger.debug('Message sent via ManyChat', { to: from })

    await logEvent({
      contactId,
      channel: 'whatsapp',
      direction: 'out',
      handledBy: handoff ? 'system' : 'ai',
      payload: { text: reply, intent, handoff },
    })

    return ok({ replied: true, intent, handoff })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'erro desconhecido'
    logger.error('WhatsApp webhook processing failed', { message })
    await logEvent({
      contactId: null,
      channel: 'whatsapp',
      direction: 'in',
      handledBy: 'system',
      payload: { text, from },
      error: message,
    }).catch(() => {})

    return ok({ replied: false, error: message })
  }
}
