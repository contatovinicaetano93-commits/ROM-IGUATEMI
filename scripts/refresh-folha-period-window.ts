/**
 * Refresh Folha period from Avec 8123 with quinzena inicio/fim (liquid a_pagar).
 *
 * Usage:
 *   NODE_OPTIONS='-r ./scripts/mock-server-only.cjs' \
 *   AVEC_LOGIN_EMAIL=... AVEC_LOGIN_PASSWORD=... AVEC_UNIT_ID=... \
 *   DATABASE_URL=... ROM_PANEL=brasil \
 *   PERIOD_ID=2026-09-q2 TODAY=2026-10-01 \
 *   npx tsx scripts/refresh-folha-period-window.ts
 */
import { mintAvecApiToken } from '../src/lib/avec/refresh-token'
import { refreshFolhaDraft } from '../src/lib/folha/service'
import type { RomPanelId } from '../src/lib/brand'

function fmt(n: number | null | undefined): number | null {
  if (n == null || !Number.isFinite(n)) return null
  return Math.round(n * 100) / 100
}

async function main() {
  delete process.env.AVEC_MOCK
  const panel = ((process.env.ROM_PANEL || 'brasil').trim().toLowerCase() ===
  'iguatemi'
    ? 'iguatemi'
    : 'brasil') as RomPanelId
  const periodId = (process.env.PERIOD_ID || '2026-09-q2').trim()
  const today = (process.env.TODAY || '').trim() || undefined

  if (!process.env.DATABASE_URL?.trim()) throw new Error('DATABASE_URL required')
  if (!process.env.AVEC_LOGIN_EMAIL?.trim() || !process.env.AVEC_LOGIN_PASSWORD?.trim()) {
    throw new Error('AVEC_LOGIN_EMAIL/PASSWORD required')
  }
  if (!process.env.AVEC_UNIT_ID?.trim()) throw new Error('AVEC_UNIT_ID required')

  const minted = await mintAvecApiToken({ force: true })
  process.env.AVEC_API_TOKEN = minted.token

  const result = await refreshFolhaDraft(panel, {
    periodId,
    actor: 'refresh-folha-period-window',
    today,
  })

  const byCargo = new Map<string, { n: number; sum: number }>()
  let withPay = 0
  for (const line of result.draft.lines) {
    const cargo = line.cargo_raw?.trim() || line.cargo || '—'
    const cur = byCargo.get(cargo) ?? { n: 0, sum: 0 }
    cur.n += 1
    if (line.proposed_pay != null) {
      withPay += 1
      cur.sum += line.proposed_pay
    }
    byCargo.set(cargo, cur)
  }

  const cargoSummary = [...byCargo.entries()]
    .map(([cargo, v]) => ({
      cargo,
      profissionais: v.n,
      liquido: fmt(v.sum),
    }))
    .sort((a, b) => (b.liquido ?? 0) - (a.liquido ?? 0))

  const top = [...result.draft.lines]
    .filter((l) => l.proposed_pay != null)
    .sort((a, b) => (b.proposed_pay ?? 0) - (a.proposed_pay ?? 0))
    .slice(0, 10)
    .map((l) => ({
      name: l.name,
      cargo: l.cargo_raw,
      faturado: fmt(l.avec.charged),
      taxa_cartao: fmt(l.avec.card_fee),
      produto: fmt(l.avec.product_spend),
      taxa_adm: fmt(l.avec.admin_fee),
      assistente: fmt(l.avec.assistant_discount),
      meio_a_meio: fmt(l.meio_a_meio),
      liquido: fmt(l.proposed_pay),
    }))

  console.log(
    JSON.stringify(
      {
        panel,
        unit_id: process.env.AVEC_UNIT_ID,
        period_id: result.period.id,
        from: result.quinzena.from,
        to: result.quinzena.to,
        pay_date: result.quinzena.payDate,
        source: result.source,
        avec_range: result.avec_range,
        profissionais: result.draft.line_count,
        com_a_pagar: withPay,
        total_liquido: fmt(result.draft.total_proposed_pay),
        por_cargo: cargoSummary,
        top10: top,
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
