import { isAvecConfigured } from '@/lib/avec/client'
import { recomputeSalonMetricsFromRom } from '@/lib/salon/metrics'

/** Eventos que disparam pull Avec fast (agenda/caixa do dia). */
const FAST_EVENTS = new Set([
  'appointment.created',
  'appointment.updated',
  'appointment.cancelled',
  'service.completed',
])

/** Eventos que disparam pull Avec full (P1/P2/P3 + catálogo). */
const FULL_EVENTS = new Set(['service.completed', 'appointment.cancelled'])

function internalBaseUrl(): string | null {
  const fromEnv = process.env.ROM_PUBLIC_URL?.trim() || process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim()
  if (fromEnv) {
    return fromEnv.startsWith('http') ? fromEnv.replace(/\/$/, '') : `https://${fromEnv}`
  }
  const vercel = process.env.VERCEL_URL?.trim()
  if (vercel) return `https://${vercel}`
  return null
}

async function postSync(mode: 'fast' | 'full', baseUrl: string) {
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret) return

  await fetch(`${baseUrl}/api/avec/sync?mode=${mode}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  }).catch(() => {})
}

/**
 * Efeitos pós-webhook Avec — tempo real nas duas unidades (cada deploy Vercel
 * dispara sync só do seu Neon/token).
 *
 * 1. Recompute local imediato (salon_daily_metrics a partir do ROM)
 * 2. Fast sync em background (agenda/atendidos/receita do dia)
 * 3. Full sync em background após atendimento/cancelamento (P1/P2/P3)
 */
export async function runAvecWebhookSideEffects(event: string) {
  await recomputeSalonMetricsFromRom().catch(() => {})

  if (!isAvecConfigured()) return

  if (!process.env.CRON_SECRET?.trim()) {
    console.warn('[avec webhook] CRON_SECRET ausente — sync em background desligado')
    return
  }

  const baseUrl = internalBaseUrl()
  if (!baseUrl) return

  const tasks: Promise<void>[] = []

  if (FAST_EVENTS.has(event)) {
    tasks.push(postSync('fast', baseUrl))
  }
  if (FULL_EVENTS.has(event)) {
    tasks.push(postSync('full', baseUrl))
  }

  await Promise.allSettled(tasks)
}

/** Não bloqueia a resposta do webhook — dispara sync em background. */
export function scheduleAvecWebhookSideEffects(event: string) {
  void runAvecWebhookSideEffects(event).catch((e) => {
    console.error('[avec webhook side effects]', e)
  })
}
