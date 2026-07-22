import type { FiscalSplitRawPayload } from './types'

export interface FiscalSplitClientConfig {
  baseUrl: string
  apiKey?: string
  timeoutMs: number
  environment: 'sandbox' | 'production' | 'mock'
}

export function getFiscalSplitClientConfig(): FiscalSplitClientConfig {
  const mock = process.env.FISCAL_SPLIT_MOCK?.trim() === '1'
  const baseUrl = (process.env.FISCAL_SPLIT_API_URL ?? '').trim().replace(/\/$/, '')
  const timeoutRaw = Number(process.env.FISCAL_SPLIT_TIMEOUT_MS ?? '15000')
  const env = (process.env.FISCAL_SPLIT_ENV ?? (mock ? 'mock' : 'sandbox')).trim().toLowerCase()

  return {
    baseUrl,
    apiKey: process.env.FISCAL_SPLIT_API_KEY?.trim() || undefined,
    timeoutMs: Number.isFinite(timeoutRaw) && timeoutRaw > 0 ? timeoutRaw : 15000,
    environment: env === 'production' ? 'production' : env === 'mock' || mock ? 'mock' : 'sandbox',
  }
}

export function isFiscalSplitConfigured(): boolean {
  const cfg = getFiscalSplitClientConfig()
  return cfg.environment === 'mock' || Boolean(cfg.baseUrl)
}

/**
 * Consulta settlements no feed configurado (export PSP / sandbox merchant).
 * A Plataforma Pública oficial é voltada a PSPs; o ROM consome o resultado já segregado.
 */
export async function fetchSplitSettlements(opts?: {
  from?: string
  to?: string
  signal?: AbortSignal
}): Promise<FiscalSplitRawPayload[]> {
  const cfg = getFiscalSplitClientConfig()

  if (cfg.environment === 'mock' || !cfg.baseUrl) {
    return []
  }

  const url = new URL(`${cfg.baseUrl}/api/v1/settlements`)
  if (opts?.from) url.searchParams.set('from', opts.from)
  if (opts?.to) url.searchParams.set('to', opts.to)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs)
  const onAbort = () => controller.abort()
  opts?.signal?.addEventListener('abort', onAbort)

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}),
      },
      signal: controller.signal,
      cache: 'no-store',
    })

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`API fiscal HTTP ${res.status}${body ? `: ${body.slice(0, 200)}` : ''}`)
    }

    const json = (await res.json()) as
      | FiscalSplitRawPayload[]
      | { data?: FiscalSplitRawPayload[]; transacoes?: FiscalSplitRawPayload[] }

    if (Array.isArray(json)) return json
    if (Array.isArray(json.data)) return json.data
    if (Array.isArray(json.transacoes)) return json.transacoes
    return []
  } finally {
    clearTimeout(timer)
    opts?.signal?.removeEventListener('abort', onAbort)
  }
}

export async function getSplitStatus(): Promise<{
  configured: boolean
  environment: FiscalSplitClientConfig['environment']
  baseUrl: string | null
}> {
  const cfg = getFiscalSplitClientConfig()
  return {
    configured: isFiscalSplitConfigured(),
    environment: cfg.environment,
    baseUrl: cfg.baseUrl || null,
  }
}
