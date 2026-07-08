import { getSql } from '@/lib/db'
import { isAvecConfigured, isAvecMock, getAvecBaseUrl } from '@/lib/avec/client'
import { isAuthEnabled } from '@/lib/auth'
import { isAiConfigured } from '@/lib/ai/client'

function envOk(name: string) {
  return Boolean(process.env[name]?.trim())
}

export async function getHealthStatus() {
  let database = false
  let databaseError: string | null = null

  try {
    const sql = getSql()
    await sql`select 1 as ok`
    database = true
  } catch (e) {
    databaseError = e instanceof Error ? e.message : String(e)
  }

  return {
    ok: database,
    database: { configured: envOk('DATABASE_URL'), connected: database, error: databaseError },
    claude: {
      configured: isAiConfigured(),
      model: process.env.ANTHROPIC_MODEL?.trim() || 'claude-sonnet-4-20250514',
    },
    avec: {
      configured: isAvecConfigured(),
      mock: isAvecMock(),
      base_url: getAvecBaseUrl(),
      token: envOk('AVEC_API_TOKEN'),
    },
    whatsapp: {
      configured: envOk('EVOLUTION_API_URL') && envOk('EVOLUTION_API_KEY') && envOk('EVOLUTION_API_INSTANCE'),
    },
    telegram: {
      configured: envOk('TELEGRAM_BOT_TOKEN'),
      webhook_secret: envOk('TELEGRAM_WEBHOOK_SECRET'),
    },
    cron: { configured: envOk('CRON_SECRET') },
    auth: {
      enabled: isAuthEnabled(),
      password: envOk('ROM_ADMIN_PASSWORD') || envOk('ROM_ACCESS_TOKEN'),
      user: envOk('ROM_ADMIN_USER'),
    },
    webhooks: {
      avec_secret: envOk('AVEC_WEBHOOK_SECRET'),
    },
  }
}
