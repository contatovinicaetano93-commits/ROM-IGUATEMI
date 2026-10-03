/**
 * One-shot: fetch Avec 8123 for a quinzena range → salon_commissions_daily + folha_periods.
 *
 * Usage:
 *   NODE_OPTIONS='-r ./scripts/mock-server-only.cjs' \
 *   AVEC_LOGIN_EMAIL=... AVEC_LOGIN_PASSWORD=... AVEC_UNIT_ID=... \
 *   DATABASE_URL=... ROM_PANEL=brasil \
 *   npx tsx scripts/import-folha-8123-q1-sep.ts
 *
 * Optional:
 *   ANCHOR_DAY=2026-09-15 INICIO=01/09/2026 FIM=15/09/2026 PERIOD_ID=2026-09-q1
 */
import { mintAvecApiToken } from '../src/lib/avec/refresh-token'
import { normalizeCommission8123Row } from '../src/lib/avec/normalize'
import { avecReportHeaders, getAvecBaseUrl } from '../src/lib/avec/client'
import { upsertSalonCommissionsDaily } from '../src/lib/salon/commission-metrics'
import { buildFolhaDraftFrom8123 } from '../src/lib/folha/draft-from-8123'
import { quinzenaForDay, parseFolhaPeriodId } from '../src/lib/folha/period'
import { upsertFolhaPeriodFromDraft, getFolhaPeriod } from '../src/lib/folha/store'
import type { RomPanelId } from '../src/lib/brand'

function asRows(payload: unknown): Record<string, unknown>[] {
  if (!payload) return []
  if (Array.isArray(payload)) return payload as Record<string, unknown>[]
  if (typeof payload !== 'object') return []
  const obj = payload as Record<string, unknown>
  const data = obj.data
  if (data && typeof data === 'object') {
    const report = (data as Record<string, unknown>).report
    if (report && typeof report === 'object') {
      const result = (report as Record<string, unknown>).result
      if (Array.isArray(result)) return result as Record<string, unknown>[]
    }
    const rows = (data as Record<string, unknown>).rows
    if (Array.isArray(rows)) return rows as Record<string, unknown>[]
  }
  if (Array.isArray(obj.rows)) return obj.rows as Record<string, unknown>[]
  if (Array.isArray(obj.result)) return obj.result as Record<string, unknown>[]
  return []
}

async function fetchAll8123(token: string, inicio: string, fim: string) {
  const base = getAvecBaseUrl()
  const all: Record<string, unknown>[] = []
  let page = 1
  const limit = 250
  for (;;) {
    const qs = new URLSearchParams({
      inicio,
      fim,
      limit: String(limit),
      page: String(page),
    })
    const url = `${base}/reports/8123?${qs}`
    const res = await fetch(url, {
      headers: avecReportHeaders(token),
      signal: AbortSignal.timeout(60_000),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`8123 HTTP ${res.status}: ${body.slice(0, 200)}`)
    }
    const payload = await res.json()
    const rows = asRows(payload)
    all.push(...rows)
    if (rows.length < limit) break
    page += 1
    if (page > 40) throw new Error('8123: too many pages')
  }
  return all
}

function firstName(full: string): string {
  return full.trim().split(/\s+/)[0] || full
}

async function main() {
  const panel = ((process.env.ROM_PANEL || 'brasil').trim().toLowerCase() === 'iguatemi'
    ? 'iguatemi'
    : 'brasil') as RomPanelId
  const anchorDay = (process.env.ANCHOR_DAY || '2026-09-15').trim()
  const inicio = (process.env.INICIO || '01/09/2026').trim()
  const fim = (process.env.FIM || '15/09/2026').trim()
  const periodId = (process.env.PERIOD_ID || '2026-09-q1').trim()

  if (!process.env.DATABASE_URL?.trim()) throw new Error('DATABASE_URL required')
  if (!process.env.AVEC_LOGIN_EMAIL?.trim() || !process.env.AVEC_LOGIN_PASSWORD?.trim()) {
    throw new Error('AVEC_LOGIN_EMAIL/PASSWORD required')
  }
  if (!process.env.AVEC_UNIT_ID?.trim()) throw new Error('AVEC_UNIT_ID required')

  const minted = await mintAvecApiToken({ force: true })
  process.env.AVEC_API_TOKEN = minted.token

  const rawRows = await fetchAll8123(minted.token, inicio, fim)
  const professionals = []
  for (const row of rawRows) {
    const parsed = normalizeCommission8123Row(row)
    if (parsed) professionals.push(parsed)
  }

  await upsertSalonCommissionsDaily(anchorDay, professionals)

  const quinzena =
    parseFolhaPeriodId(periodId) ?? quinzenaForDay(anchorDay)
  const draft = buildFolhaDraftFrom8123({
    panel,
    referenceDay: anchorDay,
    professionals,
    quinzenaDay: quinzena.to,
  })
  draft.quinzena = quinzena

  const period = await upsertFolhaPeriodFromDraft({
    draft,
    status: 'draft',
    sourceProfessionals: professionals,
    updatedBy: 'import-folha-8123-q1-sep',
    forceStatus: true,
  })

  const verified = await getFolhaPeriod(period.id)
  const sumPayable = professionals.reduce((acc, p) => {
    if (p.net_payable == null) return acc
    return (acc ?? 0) + p.net_payable
  }, null as number | null)

  const sample = professionals.slice(0, 3).map((p) => firstName(p.name))

  console.log(
    JSON.stringify(
      {
        panel,
        unit_id: process.env.AVEC_UNIT_ID,
        inicio,
        fim,
        anchor_day: anchorDay,
        raw_rows: rawRows.length,
        professionals: professionals.length,
        sum_a_pagar: sumPayable == null ? null : Math.round(sumPayable * 100) / 100,
        commissions_day: anchorDay,
        folha_period_id: verified?.id ?? period.id,
        folha_status: verified?.status ?? period.status,
        folha_line_count: verified?.lines.length ?? period.lines.length,
        folha_total_proposed_pay: verified?.total_proposed_pay ?? period.total_proposed_pay,
        sample_first_names: sample,
      },
      null,
      2,
    ),
  )
}

main().catch((e) => {
  console.error('FATAL', e instanceof Error ? e.message : String(e))
  process.exit(1)
})
