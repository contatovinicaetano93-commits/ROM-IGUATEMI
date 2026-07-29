import { getSql, peekResolvedDatabaseUrl, peekDatabaseUrlSource, peekDatabaseHost } from '@/lib/db'
import { Logger } from '@/lib/logger'
import { isAvecConfigured, isAvecMock, getAvecBaseUrl } from '@/lib/avec/client'
import { isAuthEnabled, isFinanceAuthConfigured, isStockAuthConfigured } from '@/lib/auth'
import { isAiConfigured } from '@/lib/ai/client'
import { getBrand, getRomPanelId } from '@/lib/brand'
import { getLastAvecSync } from '@/lib/avec/sync'
import { getLastStockSync } from '@/lib/avec/sync-stock'
import { getDeploymentContext, validateDeploymentEnv } from '@/lib/deployment'
import { isNeonQuotaError, neonQuotaUserMessage } from '@/lib/avec/neon-errors'
import { loadRuntimeAvecApiToken } from '@/lib/avec/token-store'

const logger = new Logger('Health')

function envOk(name: string) {
  return Boolean(process.env[name]?.trim())
}

async function probeDatabase() {
  let connected = false
  let error: string | null = null
  let neon_quota = false
  try {
    const sql = getSql()
    await sql`select 1 as ok`
    connected = true
  } catch (e) {
    error = e instanceof Error ? e.message : String(e)
    neon_quota = isNeonQuotaError(e)
    if (neon_quota) error = neonQuotaUserMessage(e)
  }
  return { connected, error, neon_quota }
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

/** Contagem YTD de métricas diárias — prova que o acumulado/comparativo tem base. */
async function probeDailyMetricsYtd() {
  try {
    const sql = getSql()
    const year = new Date().getUTCFullYear()
    const from = `${year}-01-01`
    const rows = (await sql`
      select
        count(*)::int as days,
        min(day)::text as from_day,
        max(day)::text as to_day,
        coalesce(sum(revenue), 0)::float as revenue,
        coalesce(sum(attended), 0)::int as attended
      from salon_daily_metrics
      where day >= ${from}::date
    `) as {
      days: number
      from_day: string | null
      to_day: string | null
      revenue: number
      attended: number
    }[]
    const r = rows[0]
    return {
      year,
      days: Number(r?.days ?? 0) || 0,
      from: r?.from_day ?? null,
      to: r?.to_day ?? null,
      revenue: Math.round(Number(r?.revenue ?? 0) * 100) / 100,
      attended: Number(r?.attended ?? 0) || 0,
    }
  } catch (e) {
    logger.warn('Failed to probe daily metrics YTD', {
      error: e instanceof Error ? e.message : String(e),
    })
    return { year: new Date().getUTCFullYear(), days: 0, from: null, to: null, revenue: 0, attended: 0 }
  }
}

/** Cobertura operacional (payment mix + snapshots mensais P1/P2/P3). */
async function probeOpsCoverageYtd() {
  try {
    const sql = getSql()
    const year = new Date().getUTCFullYear()
    const from = `${year}-01-01`
    const [pay, p1, p2snap, p3, stock] = await Promise.all([
      sql`
        select count(*)::int as days
        from salon_p2_daily
        where day >= ${from}::date
          and jsonb_typeof(payment_mix) = 'array'
          and jsonb_array_length(payment_mix) > 0
      `,
      sql`
        select count(*)::int as n, min(day)::text as from_day, max(day)::text as to_day
        from salon_p1_daily
        where day >= ${from}::date
          and jsonb_typeof(professionals) = 'array'
          and jsonb_array_length(professionals) > 0
      `,
      sql`
        select count(*)::int as n
        from salon_p2_daily
        where day >= ${from}::date
          and (
            (jsonb_typeof(packages) = 'array' and jsonb_array_length(packages) > 0)
            or (jsonb_typeof(booking_channels) = 'array' and jsonb_array_length(booking_channels) > 0)
          )
      `,
      sql`
        select count(*)::int as n
        from salon_p3_daily
        where day >= ${from}::date
      `,
      sql`
        select
          count(*)::int as movements,
          count(*) filter (where type = 'saida')::int as saidas,
          min((occurred_at at time zone 'America/Sao_Paulo')::date)::text as from_day,
          max((occurred_at at time zone 'America/Sao_Paulo')::date)::text as to_day
        from stock_movements
        where occurred_at >= ${from}::timestamptz
      `,
    ])
    return {
      payment_mix_days: Number(pay[0]?.days ?? 0) || 0,
      p1_snapshots: Number(p1[0]?.n ?? 0) || 0,
      p1_from: p1[0]?.from_day ?? null,
      p1_to: p1[0]?.to_day ?? null,
      p2_commerce_snapshots: Number(p2snap[0]?.n ?? 0) || 0,
      p3_snapshots: Number(p3[0]?.n ?? 0) || 0,
      stock_movements: Number(stock[0]?.movements ?? 0) || 0,
      stock_saidas: Number(stock[0]?.saidas ?? 0) || 0,
      stock_from: stock[0]?.from_day ?? null,
      stock_to: stock[0]?.to_day ?? null,
    }
  } catch (e) {
    logger.warn('Failed to probe ops coverage', {
      error: e instanceof Error ? e.message : String(e),
    })
    return {
      payment_mix_days: 0,
      p1_snapshots: 0,
      p1_from: null,
      p1_to: null,
      p2_commerce_snapshots: 0,
      p3_snapshots: 0,
      stock_movements: 0,
      stock_saidas: 0,
      stock_from: null,
      stock_to: null,
    }
  }
}

/** Resposta mínima — segura para monitoramento externo sem login. */
export async function getPublicHealthStatus() {
  const { connected, neon_quota } = await probeDatabase()
  const [metrics_ytd, ops_ytd] = connected
    ? await Promise.all([probeDailyMetricsYtd(), probeOpsCoverageYtd()])
    : [null, null]
  return {
    ok: connected,
    neon_quota,
    database: {
      host: peekDatabaseHost(),
      source: peekDatabaseUrlSource(),
    },
    metrics_ytd,
    ops_ytd,
  }
}

export async function getHealthStatus() {
  const { connected, error, neon_quota } = await probeDatabase()

  const brand = getBrand()
  const deployment = getDeploymentContext()
  const validation = validateDeploymentEnv(peekResolvedDatabaseUrl())

  let lastFast: Awaited<ReturnType<typeof getLastAvecSync>> = null
  let lastFull: Awaited<ReturnType<typeof getLastAvecSync>> = null
  let kpiLayers: Record<string, number | null> = { p1: null, p2: null, p3: null }
  let stockLastFast: Awaited<ReturnType<typeof getLastStockSync>> = null
  let stockLastFull: Awaited<ReturnType<typeof getLastStockSync>> = null

  if (connected) {
    ;[lastFast, lastFull, kpiLayers, stockLastFast, stockLastFull] = await Promise.all([
      getLastAvecSync('fast'),
      getLastAvecSync('full'),
      probeKpiLayers(),
      getLastStockSync('stock_fast'),
      getLastStockSync('stock_full'),
    ])
  }

  const awaitingToken = !isAvecConfigured() && !isAvecMock()

  // Token pode vir do env ou do runtime (app_runtime_secrets via refresh-token cron).
  let runtimeToken: string | null = null
  try {
    runtimeToken = await loadRuntimeAvecApiToken()
  } catch {
    // Falha silenciosa — apenas reduz fidelidade do diagnóstico.
  }
  const tokenOk = envOk('AVEC_API_TOKEN') || Boolean(runtimeToken)

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
    database: {
      configured: Boolean(peekResolvedDatabaseUrl()),
      connected,
      error,
      neon_quota,
      host: peekDatabaseHost(),
      source: peekDatabaseUrlSource(),
    },
    claude: {
      configured: isAiConfigured(),
      model: process.env.ANTHROPIC_MODEL?.trim() || 'claude-sonnet-4-6',
    },
    avec: {
      configured: isAvecConfigured(),
      mock: isAvecMock(),
      base_url: getAvecBaseUrl(),
      token: tokenOk,
      webhook_secret: envOk('AVEC_WEBHOOK_SECRET'),
      webhook_url: '/api/webhooks/avec',
      last_fast: lastFast,
      last_full: lastFull,
      kpi_layers: kpiLayers,
    },
    whatsapp: {
      configured:
        envOk('WHATSAPP_CLOUD_TOKEN') && envOk('WHATSAPP_PHONE_NUMBER_ID'),
      webhook_secret: envOk('WHATSAPP_APP_SECRET') || envOk('WHATSAPP_WEBHOOK_SECRET'),
      provider: 'whatsapp_cloud',
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
      session_secret: envOk('ROM_SESSION_SECRET'),
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
