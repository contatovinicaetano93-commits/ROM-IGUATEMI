import { isProduction } from '@/lib/env'

export function getStaffChatIds(): string[] {
  const raw = process.env.TELEGRAM_STAFF_CHAT_IDS?.trim()
  if (!raw) return []
  return raw.split(/[,\s]+/).filter(Boolean)
}

/**
 * Em produção, sem TELEGRAM_STAFF_CHAT_IDS o bot rejeita todos os chats (fail-closed).
 * Em desenvolvimento, sem whitelist aceita qualquer chat (modo aberto).
 */
export function isStaffChat(chatId: number | string): boolean {
  const ids = getStaffChatIds()
  if (ids.length === 0) return !isProduction()
  return ids.includes(String(chatId))
}

export function isStaffWhitelistEnabled() {
  return getStaffChatIds().length > 0
}
