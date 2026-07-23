import { sendTelegramMessage } from '@/lib/telegram/bot'
import type { ContactRow } from '@/lib/contacts'
import { getStaffChatIds } from '@/lib/telegram/staff'
import { getBrand } from '@/lib/brand'
import { getWhatsAppAdapter } from './adapter'

function getStaffWhatsAppNumbers(): string[] {
  const numbers = [process.env.FINANCE_WHATSAPP_NUMBER, process.env.ADMIN_WHATSAPP_NUMBER].filter(
    (n): n is string => Boolean(n?.trim())
  )
  return Array.from(new Set(numbers))
}

async function sendWhatsAppAlerts(numbers: string[], text: string) {
  if (numbers.length === 0) return
  try {
    const adapter = getWhatsAppAdapter()
    await Promise.all(numbers.map((n) => adapter.sendMessage(n, text).catch(() => {})))
  } catch {
    // WhatsApp Cloud API não configurada — segue só com Telegram.
  }
}

export async function notifyStaffHandoff(contact: ContactRow, reason: string, lastMessage: string) {
  const telegramIds = getStaffChatIds()
  const whatsappNumbers = getStaffWhatsAppNumbers()
  if (telegramIds.length === 0 && whatsappNumbers.length === 0) return

  const brand = getBrand()
  const nome = contact.name ?? 'Sem nome'
  const tel = contact.phone ?? '—'
  const text = [
    `📲 Handoff WhatsApp — ${brand.displayName}`,
    '',
    `Cliente: ${nome}`,
    `Tel: ${tel}`,
    `Motivo: ${reason}`,
    '',
    `Última msg: "${lastMessage.slice(0, 200)}"`,
    '',
    'Assuma a conversa no WhatsApp do salão.',
  ].join('\n')

  console.log('[staff-alert] telegramIds:', telegramIds, 'whatsappNumbers:', whatsappNumbers)

  await Promise.all([
    ...telegramIds.map((id) =>
      sendTelegramMessage(id, text)
        .then(() => console.log('[staff-alert] telegram OK para', id))
        .catch((e) => console.error('[staff-alert] telegram falhou para', id, ':', e instanceof Error ? e.message : e))
    ),
    sendWhatsAppAlerts(whatsappNumbers, text),
  ])
}
