/**
 * Cliente HTTP da API Omie (JSON-RPC).
 * Cada unidade tem 2 CNPJs/apps: serviços (salão) e comércio (produtos).
 * Docs: https://developer.omie.com.br/
 */

import { retryWithBackoff } from '@/lib/retry'
import type {
  OmieCategoriasResponse,
  OmieClienteResponse,
  OmiePesquisarResponse,
} from '@/lib/omie/types'

export const OMIE_DEFAULT_API_URL = 'https://app.omie.com.br/api/v1'

export type OmieCnpjKind = 'servicos' | 'comercio'

export const OMIE_CNPJ_KINDS: OmieCnpjKind[] = ['servicos', 'comercio']

export const OMIE_CNPJ_LABEL: Record<OmieCnpjKind, string> = {
  servicos: 'Serviços (salão)',
  comercio: 'Comércio (produtos)',
}

export const OMIE_CNPJ_HINT: Record<OmieCnpjKind, string> = {
  servicos: 'Unha, corte, coloração e demais serviços',
  comercio: 'Shampoo, creme, pomada e produtos do salão',
}

export interface OmieCredentials {
  kind: OmieCnpjKind
  appKey: string
  appSecret: string
}

export function getOmieBaseUrl() {
  return (process.env.OMIE_API_URL ?? OMIE_DEFAULT_API_URL).replace(/\/$/, '')
}

/**
 * Credenciais por CNPJ.
 * Preferência: OMIE_SERVICOS_* / OMIE_COMERCIO_*.
 * Fallback legado: OMIE_APP_KEY/SECRET → serviços.
 */
export function getOmieCredentialsForKind(kind: OmieCnpjKind): OmieCredentials | null {
  if (kind === 'servicos') {
    const appKey =
      process.env.OMIE_SERVICOS_APP_KEY?.trim() || process.env.OMIE_APP_KEY?.trim()
    const appSecret =
      process.env.OMIE_SERVICOS_APP_SECRET?.trim() || process.env.OMIE_APP_SECRET?.trim()
    if (!appKey || !appSecret) return null
    return { kind, appKey, appSecret }
  }

  const appKey = process.env.OMIE_COMERCIO_APP_KEY?.trim()
  const appSecret = process.env.OMIE_COMERCIO_APP_SECRET?.trim()
  if (!appKey || !appSecret) return null
  return { kind, appKey, appSecret }
}

export function listConfiguredOmieCredentials(): OmieCredentials[] {
  return OMIE_CNPJ_KINDS.map(getOmieCredentialsForKind).filter(
    (c): c is OmieCredentials => c != null,
  )
}

export function isOmieConfigured() {
  return listConfiguredOmieCredentials().length > 0
}

export function isOmieMock() {
  const v = process.env.OMIE_MOCK
  return v === '1' || v === 'true'
}

/** @deprecated use getOmieCredentialsForKind('servicos') */
export function getOmieCredentials(): { appKey: string; appSecret: string } | null {
  const c = getOmieCredentialsForKind('servicos')
  return c ? { appKey: c.appKey, appSecret: c.appSecret } : null
}

export class OmieApiError extends Error {
  status?: number
  code?: number | string
  kind?: OmieCnpjKind

  constructor(
    message: string,
    opts?: { status?: number; code?: number | string; kind?: OmieCnpjKind },
  ) {
    super(message)
    this.name = 'OmieApiError'
    this.status = opts?.status
    this.code = opts?.code
    this.kind = opts?.kind
  }
}

function isRetryableOmieError(error: Error): boolean {
  if (!(error instanceof OmieApiError)) return true
  const status = error.status
  if (status === 429 || status === 425 || status === 503 || status === 502) return true
  const msg = error.message.toLowerCase()
  if (msg.includes('consumo') || msg.includes('rate') || msg.includes('temporar')) return true
  if (status != null && status >= 500) return true
  return false
}

export async function omieCall<T>(
  path: string,
  call: string,
  param: Record<string, unknown>,
  creds: OmieCredentials,
): Promise<T> {
  if (isOmieMock()) {
    throw new OmieApiError('OMIE_MOCK ativo — use fixtures no sync, não omieCall direto', {
      kind: creds.kind,
    })
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
          `Omie ${creds.kind} HTTP ${res.status}: resposta não-JSON (${text.slice(0, 180)})`,
          { status: res.status, kind: creds.kind },
        )
      }

      if (!res.ok || json.faultstring) {
        throw new OmieApiError(
          json.faultstring ||
            `Omie ${creds.kind} HTTP ${res.status}: ${text.slice(0, 180)}`,
          { status: res.status, code: json.code, kind: creds.kind },
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

export async function pesquisarContasPagar(
  creds: OmieCredentials,
  opts: { page: number; perPage?: number; fromBr: string; toBr: string },
): Promise<OmiePesquisarResponse> {
  return omieCall<OmiePesquisarResponse>(
    '/financas/pesquisartitulos/',
    'PesquisarLancamentos',
    {
      nPagina: opts.page,
      nRegPorPagina: opts.perPage ?? 100,
      cNatureza: 'P',
      dDtVencDe: opts.fromBr,
      dDtVencAte: opts.toBr,
    },
    creds,
  )
}

export async function listarCategoriasOmie(
  creds: OmieCredentials,
  page: number,
  perPage = 100,
): Promise<OmieCategoriasResponse> {
  return omieCall<OmieCategoriasResponse>(
    '/geral/categorias/',
    'ListarCategorias',
    { pagina: page, registros_por_pagina: perPage },
    creds,
  )
}

export async function consultarClienteOmie(
  creds: OmieCredentials,
  codigo: number,
): Promise<OmieClienteResponse> {
  return omieCall<OmieClienteResponse>(
    '/geral/clientes/',
    'ConsultarCliente',
    { codigo_cliente_omie: codigo },
    creds,
  )
}

export async function testOmieConnection() {
  if (isOmieMock()) {
    return {
      ok: true as const,
      baseUrl: getOmieBaseUrl(),
      mock: true as const,
      kinds: OMIE_CNPJ_KINDS,
    }
  }

  const configured = listConfiguredOmieCredentials()
  if (configured.length === 0) {
    return {
      ok: false as const,
      baseUrl: getOmieBaseUrl(),
      error:
        'Configure OMIE_SERVICOS_APP_KEY/SECRET e OMIE_COMERCIO_APP_KEY/SECRET',
      kinds: [] as OmieCnpjKind[],
    }
  }

  const results: {
    kind: OmieCnpjKind
    ok: boolean
    sample_categories?: number
    error?: string
  }[] = []

  for (const creds of configured) {
    try {
      const page = await listarCategoriasOmie(creds, 1, 1)
      results.push({
        kind: creds.kind,
        ok: true,
        sample_categories: page.registros ?? 0,
      })
    } catch (e) {
      results.push({
        kind: creds.kind,
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }

  const allOk = results.every((r) => r.ok)
  return {
    ok: allOk,
    baseUrl: getOmieBaseUrl(),
    kinds: configured.map((c) => c.kind),
    results,
    error: allOk ? undefined : results.find((r) => !r.ok)?.error,
  }
}
