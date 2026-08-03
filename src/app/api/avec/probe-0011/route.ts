import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/api-response'
import { requireAdmin } from '@/lib/auth'
import { isCronAuthorized } from '@/lib/cron-auth'
import { extractReportTotals, extractRows, fetchAvecReport } from '@/lib/avec/client'
import { getAvecUnitId, getRomPanelId } from '@/lib/brand'

export const maxDuration = 60

async function authorize(req: NextRequest) {
  if (isCronAuthorized(req)) return { ok: true as const }
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth
  return { ok: true as const }
}

type ProbeResult = {
  reportId: string
  ok: boolean
  rows: number
  totals: number
  error: string | null
  sampleKeys: string[]
}

async function probeReport(
  reportId: string,
  params: Record<string, string | number>,
): Promise<ProbeResult> {
  try {
    const payload = await fetchAvecReport(reportId, { ...params, page: 1, limit: 5 }, {
      timeoutMs: 25_000,
    })
    const rows = extractRows(payload)
    const totals = extractReportTotals(payload)
    const first = rows[0]
    return {
      reportId,
      ok: true,
      rows: rows.length,
      totals: totals.length,
      error: null,
      sampleKeys: first && typeof first === 'object' ? Object.keys(first).slice(0, 12) : [],
    }
  } catch (e) {
    return {
      reportId,
      ok: false,
      rows: 0,
      totals: 0,
      error: e instanceof Error ? e.message.slice(0, 400) : String(e).slice(0, 400),
      sampleKeys: [],
    }
  }
}

/**
 * Diagnóstico: tenta Avec 0011 (e 0007/0002) direto no unit do painel.
 * Cron ou admin. Não inventa dados — só espelha a resposta da Avec.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await authorize(req)
    if (!auth.ok) return err(auth.message, auth.status)

    const unit = getAvecUnitId()
    const panel = getRomPanelId()
    const skipEnv = process.env.AVEC_SKIP_REPORT_0011 ?? null

    // 2º tri 2026 — janela fechada usada no Relatório gerência.
    const inicio = '01/04/2026'
    const fim = '30/06/2026'

    const probes = await Promise.all([
      probeReport('0011', { inicio, fim }),
      probeReport('0007', { inicio, fim }),
      probeReport('0002', { inicio, fim }),
      // Mesmos params sem datas longas — alguns salões respondem só com período curto.
      probeReport('0011', { inicio: '01/06/2026', fim: '30/06/2026' }),
    ])

    return ok({
      panel,
      unit_id: unit,
      skip_0011_env: skipEnv,
      window: { inicio, fim },
      probes,
      verdict: probes[0]?.ok
        ? '0011_ok — dá para usar Avec nativo neste unit'
        : `0011_fail — ${probes[0]?.error ?? 'erro desconhecido'}`,
    })
  } catch (e) {
    return handleError(e)
  }
}
