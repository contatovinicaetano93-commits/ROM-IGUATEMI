import { isAvecConfigured } from '@/lib/avec/client'

/** Eventos que disparam pull Avec fast (agenda/caixa do dia). Full fica só no cron 2×/dia. */
const FAST_EVENTS = new Set([
  'appointment.created',
  'appointment.updated',
  'appointment.cancelled',
  'service.completed',
])

function internalBaseUrl(): string | null {
  const fromEnv = process.env.ROM_PUBLIC_URL?.trim() || process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim()
  if (fromEnv) {
    return fromEnv.startsWith('http') ? fromEnv.replace(/\/$/, '') : `https://${fromEnv}`
  }
  const vercel = process.env.VERCEL_URL?.trim()
  if (vercel) return `https://${vercel}`
  return null
}

async function postSyncFast(baseUrl: string) {
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret) return

  await fetch(`${baseUrl}/api/avec/sync?mode=fast`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
      // Distingue webhook do cron Vercel — gap curto, nunca full.
      'x-rom-sync-reason': 'webhook',
    },
    cache: 'no-store',
  }).catch(() => {})
}

/**
 * Efeitos pós-webhook Avec — tempo real nas duas unidades (cada deploy Vercel
 * dispara sync só do seu banco/token).
 *
 * Só dispara fast sync em background (agenda/atendidos/receita do dia).
 * NÃO recomputa Agendados a partir do ROM aqui: se o fast for pulado (gap),
 * o recompute local sobrescrevia o KPI 0051 com um snapshot incompleto.
 * Full (P1/P2/P3/catálogo) NÃO dispara aqui — só cron 2×/dia (evita 403/DB).
 */
export async function runAvecWebhookSideEffects(event: string) {
  if (!isAvecConfigured()) return

  if (!process.env.CRON_SECRET?.trim()) {
    console.warn('[avec webhook] CRON_SECRET ausente — sync em background desligado')
    return
  }

  const baseUrl = internalBaseUrl()
  if (!baseUrl) return

  if (FAST_EVENTS.has(event)) {
    await postSyncFast(baseUrl)
  }
}

/** Não bloqueia a resposta do webhook — dispara sync em background. */
export function scheduleAvecWebhookSideEffects(event: string) {
  void runAvecWebhookSideEffects(event).catch((e) => {
    console.error('[avec webhook side effects]', e)
  })
}
