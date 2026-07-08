import { sendTelegramMessage } from '@/lib/telegram/bot'
import type { ContactRow } from '@/lib/contacts'
import { getStaffChatIds } from '@/lib/telegram/staff'

export async function notifyStaffHandoff(contact: ContactRow, reason: string, lastMessage: string) {
  const ids = getStaffChatIds()
  if (ids.length === 0) return

  const nome = contact.name ?? 'Sem nome'
  const tel = contact.phone ?? '—'
  const text = [
    '📲 Handoff WhatsApp — ROM Iguatemi',
    '',
    `Cliente: ${nome}`,
    `Tel: ${tel}`,
    `Motivo: ${reason}`,
    '',
    `Última msg: "${lastMessage.slice(0, 200)}"`,
    '',
    'Assuma a conversa no WhatsApp do salão.',
  ].join('\n')

  await Promise.all(ids.map((id) => sendTelegramMessage(id, text).catch(() => {})))
}
