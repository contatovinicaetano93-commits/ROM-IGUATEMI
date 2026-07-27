/**
 * One-shot: backfill métricas diárias YTD (ou FROM/TO) para o Financeiro.
 *
 * Usage (Vercel build / local):
 *   DATABASE_URL=... AVEC_API_TOKEN=... AVEC_UNIT_ID=... \
 *   npx tsx scripts/backfill-revenue-ytd.ts
 *
 * Opcional: BACKFILL_FROM=2026-01-01 BACKFILL_TO=2026-07-27 BACKFILL_CHUNK_DAYS=14
 */
import {
  runAvecRevenueBackfill,
  yearStartIso,
} from '../src/lib/avec/sync'
import { todayIso } from '../src/lib/salon/format'

async function main() {
  const to = (process.env.BACKFILL_TO?.trim() || todayIso()).slice(0, 10)
  let from = (process.env.BACKFILL_FROM?.trim() || yearStartIso(to)).slice(0, 10)
  const chunkDays = Math.max(1, Number(process.env.BACKFILL_CHUNK_DAYS || 14) || 14)

  console.log(`revenue backfill start ${from} → ${to} (chunk=${chunkDays})`)

  let chunks = 0
  while (true) {
    chunks++
    const result = await runAvecRevenueBackfill({ from, to, chunkDays })
    console.log(
      JSON.stringify(
        {
          chunk: chunks,
          from: result.from,
          to: result.to,
          days: result.days,
          status: result.status,
          revenue_rows: result.stats.revenue_rows,
          errors: result.stats.errors.slice(0, 5),
          warnings: result.stats.warnings.slice(0, 5),
          next_from: result.next_from,
          done: result.done,
        },
        null,
        2,
      ),
    )
    if (result.status === 'error' && result.stats.revenue_rows === 0) {
      throw new Error(result.error || result.stats.errors[0] || 'backfill error')
    }
    if (result.done || !result.next_from) break
    from = result.next_from
  }

  console.log('revenue backfill done')
}

main().catch((e) => {
  console.error('FATAL', e)
  process.exit(1)
})
