import { NextRequest } from 'next/server'
import { ok, err } from '@/lib/api-response'
import { logEvent } from '@/lib/contacts'
import { getWhatsAppAdapter } from '@/lib/whatsapp/adapter'
import { handleWhatsAppMessage } from '@/lib/whatsapp/conversation'
import { parseWhatsAppPayload } from '@/lib/whatsapp/parse-payload'
import { verifyWhatsAppWebhook } from '@/lib/webhooks'

export async function POST(req: NextRequest) {
  const auth = verifyWhatsAppWebhook(req)
  if (!auth.ok) return err(auth.reason, 401)

  const body = await req.json().catch(() => null)
  const parsed = parseWhatsAppPayload(body)
  if (!parsed) {
    console.error('[whatsapp webhook] payload não reconhecido:', JSON.stringify(body))
    return err('Payload inválido', 422)
  }

  const { from, text } = parsed
  console.log('[whatsapp webhook] inbound:', JSON.stringify({ from, text }))

  try {
    const { contactId, reply, intent, handoff } = await handleWhatsAppMessage(from, text)
    console.log('[whatsapp webhook] resposta gerada:', JSON.stringify({ from, intent, handoff, reply }))

    await getWhatsAppAdapter().sendMessage(from, reply)
    console.log('[whatsapp webhook] enviado via Evolution API para', from)

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
    console.error('[whatsapp webhook] falhou:', message)
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
