import type { NextRequest } from 'next/server'
import { isProduction } from '@/lib/env'

function headerSecret(req: NextRequest, name: string) {
  return req.headers.get(name)?.trim() ?? ''
}

export function verifyWhatsAppWebhook(req: NextRequest): { ok: true } | { ok: false; reason: string } {
  const expected = process.env.WHATSAPP_WEBHOOK_SECRET?.trim()
  if (!expected) {
    if (isProduction()) return { ok: false, reason: 'WHATSAPP_WEBHOOK_SECRET não configurado' }
    return { ok: true }
  }

  const got =
    headerSecret(req, 'x-whatsapp-secret') ||
    headerSecret(req, 'x-webhook-secret') ||
    headerSecret(req, 'x-evolution-secret') ||
    headerSecret(req, 'authorization').replace(/^Bearer\s+/i, '')

  if (got !== expected) return { ok: false, reason: 'Secret inválido' }
  return { ok: true }
}

export function verifyAvecWebhook(req: NextRequest): { ok: true } | { ok: false; reason: string } {
  const expected = process.env.AVEC_WEBHOOK_SECRET?.trim()
  if (!expected) {
    if (isProduction()) return { ok: false, reason: 'AVEC_WEBHOOK_SECRET não configurado' }
    return { ok: true }
  }

  const got =
    headerSecret(req, 'x-avec-secret') ||
    headerSecret(req, 'x-webhook-secret') ||
    headerSecret(req, 'authorization').replace(/^Bearer\s+/i, '')

  if (got !== expected) return { ok: false, reason: 'Secret inválido' }
  return { ok: true }
}

export function verifyTelegramWebhook(req: NextRequest): { ok: true } | { ok: false; reason: string } {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET?.trim()
  if (!expected) {
    if (isProduction()) return { ok: false, reason: 'TELEGRAM_WEBHOOK_SECRET não configurado' }
    return { ok: true }
  }

  if (headerSecret(req, 'x-telegram-bot-api-secret-token') !== expected) {
    return { ok: false, reason: 'Secret inválido' }
  }
  return { ok: true }
}

export function isTelegramChatAllowed(chatId: number): { ok: true } | { ok: false; reason: string } {
  const raw = process.env.TELEGRAM_STAFF_CHAT_IDS?.trim()
  if (!raw) {
    if (isProduction()) {
      return { ok: false, reason: 'TELEGRAM_STAFF_CHAT_IDS não configurado' }
    }
    return { ok: true }
  }

  const allowed = raw.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean)
  if (!allowed.includes(String(chatId))) {
    return { ok: false, reason: 'Chat não autorizado' }
  }
  return { ok: true }
}
