/**
 * Fecha / atualiza uma quinzena Folha só com motor + Avec + Zig (sem Fopag).
 *
 * Usage:
 *   NODE_OPTIONS='-r ./scripts/mock-server-only.cjs' \
 *   AVEC_LOGIN_EMAIL=... AVEC_LOGIN_PASSWORD=... AVEC_UNIT_ID=... \
 *   DATABASE_URL=... ROM_PANEL=brasil \
 *   PERIOD_ID=2026-10-q1 TODAY=2026-10-04 \
 *   npx tsx scripts/folha-native-period.ts
 *
 * Zig é opcional: sem ZIG_API_TOKEN o 8123 ainda grava; zig_skipped=zig_not_configured.
 */
import { mintAvecApiToken } from '../src/lib/avec/refresh-token'
import type { RomPanelId } from '../src/lib/brand'
import {
  applyZigConsumoBaruToPeriod,
  refreshFolhaDraft,
} from '../src/lib/folha/service'
import { isZigFolhaConfigured } from '../src/lib/folha/zig-consumo'

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
  const periodId = (process.env.PERIOD_ID || '2026-10-q1').trim()
  const today = (process.env.TODAY || '').trim() || undefined

  if (!process.env.DATABASE_URL?.trim()) throw new Error('DATABASE_URL required')
  if (!process.env.AVEC_LOGIN_EMAIL?.trim() || !process.env.AVEC_LOGIN_PASSWORD?.trim()) {
    throw new Error('AVEC_LOGIN_EMAIL/PASSWORD required')
  }
  if (!process.env.AVEC_UNIT_ID?.trim()) throw new Error('AVEC_UNIT_ID required')

  const minted = await mintAvecApiToken({ force: true })
  process.env.AVEC_API_TOKEN = minted.token

  const refreshed = await refreshFolhaDraft(panel, {
    periodId,
    actor: 'folha-native-period',
    today,
  })

  let zig: {
    applied: number | null
    skipped: string | null
    txs?: number
  } = { applied: null, skipped: 'zig_not_configured' }
  let lines = refreshed.draft.lines
  let total = refreshed.draft.total_proposed_pay

  if (isZigFolhaConfigured()) {
    try {
      const z = await applyZigConsumoBaruToPeriod(panel, {
        periodId: refreshed.period.id,
        actor: 'folha-native-period-zig',
      })
      zig = {
        applied: z.report.applied.length,
        skipped: z.zig.skipped ?? null,
        txs: z.zig.txs,
      }
      lines = z.draft.lines
      total = z.draft.total_proposed_pay
    } catch (e) {
      zig = {
        applied: null,
        skipped: e instanceof Error ? e.message : String(e),
      }
    }
  }

  const withPay = lines.filter((l) => l.proposed_pay != null).length
  const withBaru = lines.filter(
    (l) => l.folha_extras.consumo_baru != null && l.folha_extras.consumo_baru > 0.02,
  ).length

  console.log(
    JSON.stringify(
      {
        panel,
        unit_id: process.env.AVEC_UNIT_ID,
        period_id: refreshed.period.id,
        from: refreshed.quinzena.from,
        to: refreshed.quinzena.to,
        pay_date: refreshed.quinzena.payDate,
        source: refreshed.source,
        avec_range: refreshed.avec_range,
        fopag_overlay: 'never_for_oct_plus',
        profissionais: lines.length,
        com_a_pagar: withPay,
        com_baru: withBaru,
        total_liquido: fmt(total),
        zig,
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
