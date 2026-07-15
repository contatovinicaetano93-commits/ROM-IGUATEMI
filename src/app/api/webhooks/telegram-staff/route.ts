import { NextRequest } from 'next/server'
import { ok, err } from '@/lib/api-response'
import { sendTelegramMessage } from '@/lib/telegram/bot'
import { verifyTelegramStaffWebhook } from '@/lib/webhooks'
import { getLinkedProfessional, formatTodayAgenda } from '@/lib/telegram/staff-schedule'

interface TelegramUpdate {
  message?: {
    chat: { id: number }
    text?: string
  }
}

function notLinkedMessage(chatId: number) {
  return `Seu chat ainda não está vinculado a um profissional. Peça pro admin te vincular.\n\nSeu chat_id: ${chatId}`
}

export async function POST(req: NextRequest) {
  const webhook = verifyTelegramStaffWebhook(req)
  if (!webhook.ok) return err(webhook.reason, 401)

  const token = process.env.TELEGRAM_STAFF_BOT_TOKEN
  const update = (await req.json().catch(() => null)) as TelegramUpdate | null
  const chatId = update?.message?.chat.id
  const text = update?.message?.text?.trim()

  if (!chatId || !text) return ok({ ignored: true })

  try {
    const professionalName = await getLinkedProfessional(String(chatId))
    if (!professionalName) {
      await sendTelegramMessage(chatId, notLinkedMessage(chatId), token).catch(() => {})
      return ok({ replied: true, mode: 'not_linked' })
    }

    const agenda = await formatTodayAgenda(professionalName)
    await sendTelegramMessage(chatId, agenda, token)
    return ok({ replied: true, mode: 'agenda' })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'erro desconhecido'
    await sendTelegramMessage(chatId, 'Tive um problema pra consultar sua agenda agora.', token).catch(() => {})
    return ok({ replied: false, error: message })
  }
}
