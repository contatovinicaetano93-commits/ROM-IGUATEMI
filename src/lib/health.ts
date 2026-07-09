import { getSql } from '@/lib/db'
import { isAvecConfigured, isAvecMock, getAvecBaseUrl } from '@/lib/avec/client'
import { isAuthEnabled } from '@/lib/auth'
import { isAiConfigured } from '@/lib/ai/client'
import { getBrand, getRomPanelId } from '@/lib/brand'
import { getDeploymentContext, validateDeploymentEnv } from '@/lib/deployment'

function envOk(name: string) {
  return Boolean(process.env[name]?.trim())
}

async function probeDatabase() {
  let connected = false
  let error: string | null = null
  try {
    const sql = getSql()
    await sql`select 1 as ok`
    connected = true
  } catch (e) {
    error = e instanceof Error ? e.message : String(e)
  }
  return { connected, error }
}

/** Resposta mínima — segura para monitoramento externo sem login. */
export async function getPublicHealthStatus() {
  const { connected } = await probeDatabase()
  return { ok: connected }
}

export async function getHealthStatus() {
  const { connected, error } = await probeDatabase()

  const brand = getBrand()
  const deployment = getDeploymentContext()
  const validation = validateDeploymentEnv()

  return {
    ok: connected && validation.ok,
    deployment,
    validation,
    panel: {
      id: getRomPanelId(),
      display_name: brand.displayName,
      seed_preset: process.env.ROM_SEED_PRESET?.trim() || getRomPanelId(),
    },
    database: { configured: envOk('DATABASE_URL'), connected, error },
    claude: {
      configured: isAiConfigured(),
      model: process.env.ANTHROPIC_MODEL?.trim() || 'claude-sonnet-4-6',
    },
    avec: {
      configured: isAvecConfigured(),
      mock: isAvecMock(),
      base_url: getAvecBaseUrl(),
      token: envOk('AVEC_API_TOKEN'),
      webhook_secret: envOk('AVEC_WEBHOOK_SECRET'),
      webhook_url: '/api/webhooks/avec',
    },
    whatsapp: {
      configured: envOk('EVOLUTION_API_URL') && envOk('EVOLUTION_API_KEY') && envOk('EVOLUTION_API_INSTANCE'),
      webhook_secret: envOk('WHATSAPP_WEBHOOK_SECRET'),
    },
    telegram: {
      configured: envOk('TELEGRAM_BOT_TOKEN'),
      webhook_secret: envOk('TELEGRAM_WEBHOOK_SECRET'),
      staff_whitelist: envOk('TELEGRAM_STAFF_CHAT_IDS'),
    },
    cron: { configured: envOk('CRON_SECRET') },
    auth: {
      enabled: isAuthEnabled(),
      password: envOk('ROM_ADMIN_PASSWORD') || envOk('ROM_ACCESS_TOKEN'),
      user: envOk('ROM_ADMIN_USER'),
      staff_user: envOk('ROM_STAFF_USER'),
      staff_password: envOk('ROM_STAFF_PASSWORD'),
    },
    webhooks: {
      avec_secret: envOk('AVEC_WEBHOOK_SECRET'),
    },
  }
}
