/**
 * Cliente HTTP da API Omie (JSON-RPC).
 * Docs: https://developer.omie.com.br/
 * Auth: app_key + app_secret no body (não OAuth).
 */

import { retryWithBackoff } from '@/lib/retry'
import type {
  OmieCategoriasResponse,
  OmieClienteResponse,
  OmiePesquisarResponse,
} from '@/lib/omie/types'

export const OMIE_DEFAULT_API_URL = 'https://app.omie.com.br/api/v1'

export function getOmieBaseUrl() {
  return (process.env.OMIE_API_URL ?? OMIE_DEFAULT_API_URL).replace(/\/$/, '')
}

export function getOmieCredentials(): { appKey: string; appSecret: string } | null {
  const appKey = process.env.OMIE_APP_KEY?.trim()
  const appSecret = process.env.OMIE_APP_SECRET?.trim()
  if (!appKey || !appSecret) return null
  return { appKey, appSecret }
}

export function isOmieConfigured() {
  return getOmieCredentials() != null
}

export function isOmieMock() {
  const v = process.env.OMIE_MOCK
  return v === '1' || v === 'true'
}

export class OmieApiError extends Error {
  status?: number
  code?: number | string

  constructor(message: string, opts?: { status?: number; code?: number | string }) {
    super(message)
    this.name = 'OmieApiError'
    this.status = opts?.status
    this.code = opts?.code
  }
}

function isRetryableOmieError(error: Error): boolean {
  if (!(error instanceof OmieApiError)) return true
  const status = error.status
  if (status === 429 || status === 425 || status === 503 || status === 502) return true
  // Omie costuma devolver 500 com faultstring de rate limit / temporário
  const msg = error.message.toLowerCase()
  if (msg.includes('consumo') || msg.includes('rate') || msg.includes('temporar')) return true
  if (status != null && status >= 500) return true
  return false
}

export async function omieCall<T extends Record<string, unknown>>(
  path: string,
  call: string,
  param: Record<string, unknown>,
): Promise<T> {
  if (isOmieMock()) {
    throw new OmieApiError('OMIE_MOCK ativo — use fixtures no sync, não omieCall direto')
  }

  const creds = getOmieCredentials()
  if (!creds) {
    throw new OmieApiError('OMIE_APP_KEY / OMIE_APP_SECRET não configurados')
  }

  const url = `${getOmieBaseUrl()}${path.startsWith('/') ? path : `/${path}`}`

  return retryWithBackoff(
    async () => {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          call,
          app_key: creds.appKey,
          app_secret: creds.appSecret,
          param: [param],
        }),
        cache: 'no-store',
      })

      const text = await res.text()
      let json: T & { faultstring?: string; code?: number | string }
      try {
        json = JSON.parse(text) as T & { faultstring?: string; code?: number | string }
      } catch {
        throw new OmieApiError(
          `Omie HTTP ${res.status}: resposta não-JSON (${text.slice(0, 180)})`,
          { status: res.status },
        )
      }

      if (!res.ok || json.faultstring) {
        throw new OmieApiError(
          json.faultstring || `Omie HTTP ${res.status}: ${text.slice(0, 180)}`,
          { status: res.status, code: json.code },
        )
      }

      return json
    },
    {
      maxAttempts: 4,
      initialDelayMs: 800,
      maxDelayMs: 8000,
      shouldRetry: isRetryableOmieError,
    },
  )
}

/** Contas a pagar / receber por vencimento (natureza P = pagar). */
export async function pesquisarContasPagar(opts: {
  page: number
  perPage?: number
  fromBr: string
  toBr: string
}): Promise<OmiePesquisarResponse> {
  return omieCall<OmiePesquisarResponse>('/financas/pesquisartitulos/', 'PesquisarLancamentos', {
    nPagina: opts.page,
    nRegPorPagina: opts.perPage ?? 100,
    cNatureza: 'P',
    dDtVencDe: opts.fromBr,
    dDtVencAte: opts.toBr,
  })
}

export async function listarCategoriasOmie(page: number, perPage = 100): Promise<OmieCategoriasResponse> {
  return omieCall<OmieCategoriasResponse>('/geral/categorias/', 'ListarCategorias', {
    pagina: page,
    registros_por_pagina: perPage,
  })
}

export async function consultarClienteOmie(codigo: number): Promise<OmieClienteResponse> {
  return omieCall<OmieClienteResponse>('/geral/clientes/', 'ConsultarCliente', {
    codigo_cliente_omie: codigo,
  })
}

export async function testOmieConnection() {
  if (isOmieMock()) {
    return { ok: true as const, baseUrl: getOmieBaseUrl(), mock: true as const }
  }
  if (!isOmieConfigured()) {
    return {
      ok: false as const,
      baseUrl: getOmieBaseUrl(),
      error: 'OMIE_APP_KEY / OMIE_APP_SECRET não configurados',
    }
  }
  try {
    const page = await listarCategoriasOmie(1, 1)
    return {
      ok: true as const,
      baseUrl: getOmieBaseUrl(),
      sample_categories: page.registros ?? 0,
      total_categories: page.total_de_registros ?? 0,
    }
  } catch (e) {
    return {
      ok: false as const,
      baseUrl: getOmieBaseUrl(),
      error: e instanceof Error ? e.message : String(e),
    }
  }
}
