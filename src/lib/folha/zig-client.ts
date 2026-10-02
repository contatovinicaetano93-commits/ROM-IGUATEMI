/**
 * Cliente Zig Pay (enterprise-postgres) para Folha — detailed transactions.
 *
 * Auth: `ZIG_API_TOKEN` (Bearer). Place: `zigPlaceIdForPanel`.
 * RPC: `ZIG_TRANSACTIONS_RPC` (default `getDetailedTransactionsAtPlace`).
 *
 * Se o nome do método diferir no tenant, setar a env — o body segue o
 * formato dos samples RH (args + deviceInfo + extra + name + version).
 */

import type { RomPanelId } from '@/lib/brand'
import {
  type ZigTransaction,
  zigPlaceIdForPanel,
} from '@/lib/folha/zig-consumo'

const ZIG_API_BASE =
  process.env.ZIG_API_BASE?.trim() || 'https://api.zigcore.com.br'

export type ZigFetchTransactionsResult = {
  placeId: string
  transactions: ZigTransaction[]
  pages: number
  skipped?: 'not_configured'
}

function zigToken(): string | null {
  return process.env.ZIG_API_TOKEN?.trim() || null
}

function transactionsRpc(): string {
  return (
    process.env.ZIG_TRANSACTIONS_RPC?.trim() ||
    'getDetailedTransactionsAtPlace'
  )
}

function buildBody(args: Record<string, unknown>, rpcName: string) {
  return {
    args,
    deviceInfo: {
      id: 'rom-folha',
      language: 'pt-BR',
      platform: 'web',
      timezone: 'America/Sao_Paulo',
      type: 'server',
      version: '1.0.0',
    },
    extra: { tz: 'America/Sao_Paulo', lng: 'pt-BR' },
    name: rpcName,
    requestId: `folha-${Date.now()}`,
    version: { 'zig-version': '1' },
  }
}

function parseTxPage(payload: unknown): {
  data: ZigTransaction[]
  lastPage: number
  currentPage: number
} {
  const root =
    payload && typeof payload === 'object' && 'result' in payload
      ? (payload as { result: unknown }).result
      : payload

  if (Array.isArray(root)) {
    return { data: root as ZigTransaction[], lastPage: 1, currentPage: 1 }
  }
  if (root && typeof root === 'object') {
    const obj = root as {
      data?: ZigTransaction[]
      pagination?: { lastPage?: number; currentPage?: number }
    }
    return {
      data: Array.isArray(obj.data) ? obj.data : [],
      lastPage: obj.pagination?.lastPage ?? 1,
      currentPage: obj.pagination?.currentPage ?? 1,
    }
  }
  return { data: [], lastPage: 1, currentPage: 1 }
}

/**
 * Busca todas as páginas de transações do place na janela [since, until]
 * (ISO com timezone, ex. 2026-09-16T03:00:00.000).
 */
export async function fetchZigDetailedTransactions(args: {
  panel: RomPanelId
  sinceIso: string
  untilIso: string
  signal?: AbortSignal
}): Promise<ZigFetchTransactionsResult> {
  const token = zigToken()
  const placeId = zigPlaceIdForPanel(args.panel)
  if (!token) {
    return { placeId, transactions: [], pages: 0, skipped: 'not_configured' }
  }

  const rpc = transactionsRpc()
  const url = `${ZIG_API_BASE}/enterprise-postgres/${rpc}`
  const all: ZigTransaction[] = []
  let page = 1
  let lastPage = 1
  const maxPages = Number(process.env.ZIG_TRANSACTIONS_MAX_PAGES ?? 40)

  while (page <= lastPage && page <= maxPages) {
    const body = buildBody(
      {
        placeId,
        since: args.sinceIso,
        until: args.untilIso,
        page,
        perPage: 100,
      },
      rpc,
    )
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
      signal: args.signal,
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(
        `Zig ${rpc} HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ''}`,
      )
    }
    const json: unknown = await res.json()
    if (
      json &&
      typeof json === 'object' &&
      'error' in json &&
      (json as { error: unknown }).error
    ) {
      throw new Error(`Zig RPC error: ${JSON.stringify((json as { error: unknown }).error)}`)
    }
    const parsed = parseTxPage(json)
    all.push(...parsed.data)
    lastPage = parsed.lastPage
    page += 1
    if (parsed.data.length === 0) break
  }

  return { placeId, transactions: all, pages: page - 1 }
}

/**
 * Janela Zig no fuso dos samples RH: since = from 03:00 UTC,
 * until = dia seguinte ao `to` às 02:59:59.999 (fecha o dia BRT).
 */
export function zigWindowForQuinzenaDays(fromDay: string, toDay: string): {
  sinceIso: string
  untilIso: string
} {
  const end = new Date(`${toDay}T03:00:00.000Z`)
  end.setUTCDate(end.getUTCDate() + 1)
  const y = end.getUTCFullYear()
  const m = String(end.getUTCMonth() + 1).padStart(2, '0')
  const d = String(end.getUTCDate()).padStart(2, '0')
  return {
    sinceIso: `${fromDay}T03:00:00.000`,
    untilIso: `${y}-${m}-${d}T02:59:59.999`,
  }
}
