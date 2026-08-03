import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/api-response'
import { requireAdmin } from '@/lib/auth'
import { isCronAuthorized } from '@/lib/cron-auth'
import {
  avecReportHeaders,
  extractReportTotals,
  extractRows,
  getAvecBaseUrl,
  normalizeAvecApiToken,
} from '@/lib/avec/client'
import { getAvecUnitId, getRomPanelId } from '@/lib/brand'
import { ensureFreshAvecApiToken } from '@/lib/avec/token-store'

export const maxDuration = 60

async function authorize(req: NextRequest) {
  if (isCronAuthorized(req)) return { ok: true as const }
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth
  return { ok: true as const }
}

type ProbeResult = {
  reportId: string
  label: string
  httpStatus: number | null
  ok: boolean
  rows: number
  totals: number
  error: string | null
  bodySnippet: string | null
  sampleKeys: string[]
  urlPath: string
}

async function rawProbe(
  reportId: string,
  label: string,
  params: Record<string, string>,
): Promise<ProbeResult> {
  const unit = getAvecUnitId()
  const qs = new URLSearchParams({ page: '1', limit: '5', ...params })
  if (reportId === '0011' && unit && !qs.has('salao_id')) {
    qs.set('salao_id', unit)
  }
  const baseUrl = getAvecBaseUrl()
  let token = normalizeAvecApiToken(await ensureFreshAvecApiToken({ minHoursLeft: 1 }))
  const urlPath = `/reports/${reportId}?${qs}`
  const url = `${baseUrl}${urlPath}`

  try {
    let res = await fetch(url, {
      headers: avecReportHeaders(token),
      cache: 'no-store',
      signal: AbortSignal.timeout(12_000),
    })
    if (res.status === 401) {
      token = normalizeAvecApiToken(await ensureFreshAvecApiToken({ force: true, minHoursLeft: 0 }))
      res = await fetch(url, {
        headers: avecReportHeaders(token),
        cache: 'no-store',
        signal: AbortSignal.timeout(12_000),
      })
    }
    const text = await res.text().catch(() => '')
    let payload: unknown = null
    try {
      payload = text ? JSON.parse(text) : null
    } catch {
      payload = null
    }
    const rows = extractRows(payload)
    const totals = extractReportTotals(payload)
    const first = rows[0]
    return {
      reportId,
      label,
      httpStatus: res.status,
      ok: res.ok,
      rows: rows.length,
      totals: totals.length,
      error: res.ok ? null : text.slice(0, 300) || `HTTP ${res.status}`,
      bodySnippet: res.ok ? null : text.slice(0, 300),
      sampleKeys: first && typeof first === 'object' ? Object.keys(first).slice(0, 12) : [],
      urlPath,
    }
  } catch (e) {
    return {
      reportId,
      label,
      httpStatus: null,
      ok: false,
      rows: 0,
      totals: 0,
      error: e instanceof Error ? e.message.slice(0, 300) : String(e).slice(0, 300),
      bodySnippet: null,
      sampleKeys: [],
      urlPath,
    }
  }
}

/**
 * Diagnóstico: tenta Avec 0011 (e 0007/0002) direto no unit do painel.
 * 1 request sem retry longo — para ver o HTTP real da Avec.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await authorize(req)
    if (!auth.ok) return err(auth.message, auth.status)

    const unit = getAvecUnitId()
    const panel = getRomPanelId()
    const skipEnv = process.env.AVEC_SKIP_REPORT_0011 ?? null
    const only = req.nextUrl.searchParams.get('only') // 0011 | 0007 | 0002 | all

    const probes: ProbeResult[] = []
    const want = (id: string) => !only || only === 'all' || only === id

    if (want('0011')) {
      probes.push(
        await rawProbe('0011', '0011 trimestre', {
          inicio: '01/04/2026',
          fim: '30/06/2026',
        }),
      )
      probes.push(
        await rawProbe('0011', '0011 só junho', {
          inicio: '01/06/2026',
          fim: '30/06/2026',
        }),
      )
    }
    if (want('0007')) {
      probes.push(
        await rawProbe('0007', '0007 taxa/não-retorno', {
          inicio: '01/04/2026',
          fim: '30/06/2026',
        }),
      )
    }
    if (want('0002')) {
      probes.push(
        await rawProbe('0002', '0002 clientes', {
          inicio: '01/04/2026',
          fim: '30/06/2026',
        }),
      )
    }

    const first0011 = probes.find((p) => p.reportId === '0011')
    return ok({
      panel,
      unit_id: unit,
      skip_0011_env: skipEnv,
      probes,
      verdict: first0011?.ok
        ? '0011_ok — dá para usar Avec nativo neste unit'
        : `0011_fail — HTTP ${first0011?.httpStatus ?? 'n/a'}: ${first0011?.error ?? 'sem probe'}`,
    })
  } catch (e) {
    return handleError(e)
  }
}
