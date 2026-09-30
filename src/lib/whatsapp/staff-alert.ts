import { sendTelegramMessage } from '@/lib/telegram/bot'
import type { ContactRow } from '@/lib/contacts'
import { getStaffChatIds } from '@/lib/telegram/staff'
import { getBrand } from '@/lib/brand'
import { getWhatsAppAdapter } from './adapter'
import { getSql } from '@/lib/db'

function getStaffWhatsAppNumbers(): string[] {
  const numbers = [process.env.FINANCE_WHATSAPP_NUMBER, process.env.ADMIN_WHATSAPP_NUMBER].filter(
    (n): n is string => Boolean(n?.trim()),
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

/**
 * Alerta ops (WhatsApp staff + Telegram staff) com debounce em Postgres.
 * Usado quando sync Avec falha ou refresh de token quebra — sem isso o monitor nunca “grita”.
 */
export async function notifyOpsAvecAlert(
  text: string,
  opts?: { dedupeKey?: string; minIntervalMs?: number },
): Promise<{ sent: boolean; skipped?: string }> {
  const telegramIds = getStaffChatIds()
  const whatsappNumbers = getStaffWhatsAppNumbers()
  if (telegramIds.length === 0 && whatsappNumbers.length === 0) {
    return { sent: false, skipped: 'no_ops_channels' }
  }

  const dedupeKey = opts?.dedupeKey ?? 'avec_ops_alert'
  const minIntervalMs = opts?.minIntervalMs ?? 60 * 60 * 1000
  const secretKey = `ops_alert:${dedupeKey}`

  try {
    const sql = getSql()
    await sql`
      create table if not exists app_runtime_secrets (
        key text primary key,
        value text not null,
        expires_at timestamptz,
        updated_at timestamptz not null default now()
      )
    `
    const rows = (await sql`
      select value, updated_at from app_runtime_secrets where key = ${secretKey} limit 1
    `) as { value: string; updated_at: string }[]
    const prev = rows[0]
    if (prev?.updated_at) {
      const age = Date.now() - new Date(prev.updated_at).getTime()
      if (Number.isFinite(age) && age < minIntervalMs) {
        return { sent: false, skipped: 'deduped' }
      }
    }
    await sql`
      insert into app_runtime_secrets (key, value, expires_at, updated_at)
      values (${secretKey}, ${text.slice(0, 500)}, null, now())
      on conflict (key) do update set value = excluded.value, updated_at = now()
    `
  } catch {
    // Sem DB — ainda tenta enviar (melhor um spam raro que silêncio).
  }

  const brand = getBrand()
  const body = `🛎️ ${brand.displayName}\n${text}`

  await Promise.all([
    ...telegramIds.map((id) => sendTelegramMessage(id, body).catch(() => {})),
    sendWhatsAppAlerts(whatsappNumbers, body),
  ])
  return { sent: true }
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
        .catch((e) =>
          console.error(
            '[staff-alert] telegram falhou para',
            id,
            ':',
            e instanceof Error ? e.message : e,
          ),
        ),
    ),
    sendWhatsAppAlerts(whatsappNumbers, text),
  ])
}
