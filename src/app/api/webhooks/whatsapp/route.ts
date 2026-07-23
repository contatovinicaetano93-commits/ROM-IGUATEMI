import { NextRequest, NextResponse } from 'next/server'
import { ok, err } from '@/lib/api-response'
import { Logger } from '@/lib/logger'
import { logEvent } from '@/lib/contacts'
import { getWhatsAppAdapter, verifyMetaHubSignature } from '@/lib/whatsapp/adapter'
import { handleWhatsAppMessage } from '@/lib/whatsapp/conversation'
import { parseWhatsAppPayload } from '@/lib/whatsapp/parse-payload'
import { verifyWhatsAppWebhook } from '@/lib/webhooks'
import { isProduction } from '@/lib/env'

const logger = new Logger('WhatsAppWebhook')

/** Verificação do webhook Meta (GET hub.challenge). */
export async function GET(req: NextRequest) {
  const mode = req.nextUrl.searchParams.get('hub.mode')
  const token = req.nextUrl.searchParams.get('hub.verify_token')
  const challenge = req.nextUrl.searchParams.get('hub.challenge')
  const expected = process.env.WHATSAPP_VERIFY_TOKEN?.trim()

  if (mode === 'subscribe' && expected && token === expected && challenge) {
    return new NextResponse(challenge, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    })
  }

  return err('Verificação do webhook falhou', 403)
}

async function authorizePost(req: NextRequest, rawBody: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  const appSecret = process.env.WHATSAPP_APP_SECRET?.trim()
  const signature = req.headers.get('x-hub-signature-256')

  if (appSecret) {
    if (!verifyMetaHubSignature(rawBody, signature, appSecret)) {
      return { ok: false, reason: 'Assinatura Meta inválida' }
    }
    return { ok: true }
  }

  // Fallback: secret próprio (testes / proxies). Em produção prefira WHATSAPP_APP_SECRET.
  const shared = verifyWhatsAppWebhook(req)
  if (shared.ok) return { ok: true }

  if (isProduction()) {
    return {
      ok: false,
      reason: shared.ok === false ? shared.reason : 'Configure WHATSAPP_APP_SECRET ou WHATSAPP_WEBHOOK_SECRET',
    }
  }

  return { ok: true }
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const auth = await authorizePost(req, rawBody)
  if (!auth.ok) return err(auth.reason, 401)

  let body: unknown = null
  try {
    body = rawBody ? JSON.parse(rawBody) : null
  } catch {
    return err('JSON inválido', 400)
  }

  const parsed = parseWhatsAppPayload(body)
  if (!parsed) {
    // Status delivery/read da Meta — ACK sem processar.
    if (body && typeof body === 'object' && (body as { object?: string }).object === 'whatsapp_business_account') {
      return ok({ ignored: true, reason: 'status_or_non_text' })
    }
    logger.error('Unrecognized WhatsApp webhook payload', { payload: body })
    return err('Payload inválido', 422)
  }

  const { from, text } = parsed
  logger.debug('WhatsApp message received', { from, hasText: !!text })

  try {
    const { contactId, reply, intent, handoff } = await handleWhatsAppMessage(from, text)
    logger.debug('WhatsApp response generated', { from, intent, handoff, hasReply: !!reply })

    await getWhatsAppAdapter().sendMessage(from, reply)
    logger.debug('Message sent via WhatsApp Cloud API', { to: from })

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
