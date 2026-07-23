import { getSql } from '@/lib/db'
import { Logger } from '@/lib/logger'
import { isAvecConfigured, isAvecMock, getAvecBaseUrl } from '@/lib/avec/client'
import { isAuthEnabled, isFinanceAuthConfigured, isStockAuthConfigured } from '@/lib/auth'
import { isAiConfigured } from '@/lib/ai/client'
import { getBrand, getRomPanelId } from '@/lib/brand'
import { getLastAvecSync } from '@/lib/avec/sync'
import { getLastStockSync } from '@/lib/avec/sync-stock'
import { getDeploymentContext, validateDeploymentEnv } from '@/lib/deployment'

const logger = new Logger('Health')

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

async function probeKpiLayers() {
  try {
    const sql = getSql()
    const rows = (await sql`
      select 'p1' as layer, count(*)::int as n from salon_p1_daily
      union all select 'p2', count(*)::int from salon_p2_daily
      union all select 'p3', count(*)::int from salon_p3_daily
    `) as { layer: string; n: number }[]
    return Object.fromEntries(rows.map((r) => [r.layer, r.n]))
  } catch (e) {
    logger.warn('Failed to probe KPI layers', { error: e instanceof Error ? e.message : String(e) })
    return { p1: null, p2: null, p3: null }
  }
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
  const [lastFast, lastFull, kpiLayers, stockLastFast, stockLastFull] = await Promise.all([
    getLastAvecSync('fast'),
    getLastAvecSync('full'),
    probeKpiLayers(),
    getLastStockSync('stock_fast'),
    getLastStockSync('stock_full'),
  ])

  const awaitingToken = !isAvecConfigured() && !isAvecMock()

  return {
    ok: connected && validation.ok,
    deployment,
    validation,
    readiness: {
      awaiting_avec_token: awaitingToken,
      cron_ready: envOk('CRON_SECRET'),
      webhook_ready: envOk('AVEC_WEBHOOK_SECRET'),
      unit_id_set: envOk('AVEC_UNIT_ID'),
    },
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
      last_fast: lastFast,
      last_full: lastFull,
      kpi_layers: kpiLayers,
    },
    whatsapp: {
      configured: envOk('MANYCHAT_API_KEY'),
      webhook_secret: envOk('WHATSAPP_WEBHOOK_SECRET'),
      provider: 'manychat',
    },
    telegram: {
      configured: envOk('TELEGRAM_BOT_TOKEN'),
      webhook_secret: envOk('TELEGRAM_WEBHOOK_SECRET'),
      staff_whitelist: envOk('TELEGRAM_STAFF_CHAT_IDS'),
      finance_bot_configured: envOk('TELEGRAM_FINANCE_BOT_TOKEN'),
      finance_bot_webhook_secret: envOk('TELEGRAM_FINANCE_WEBHOOK_SECRET'),
      finance_bot_whitelist: envOk('TELEGRAM_FINANCE_CHAT_IDS'),
    },
    cron: { configured: envOk('CRON_SECRET') },
    auth: {
      enabled: isAuthEnabled(),
      password: envOk('ROM_ADMIN_PASSWORD') || envOk('ROM_ACCESS_TOKEN'),
      user: envOk('ROM_ADMIN_USER'),
      staff_user: envOk('ROM_STAFF_USER'),
      staff_password: envOk('ROM_STAFF_PASSWORD'),
      finance_configured: isFinanceAuthConfigured(),
      stock_configured: isStockAuthConfigured(),
    },
    webhooks: {
      avec_secret: envOk('AVEC_WEBHOOK_SECRET'),
    },
    stock: {
      last_fast: stockLastFast,
      last_full: stockLastFull,
    },
  }
}
