/**
 * One-shot: só 0044 (movimentos) → stock_movements / CMV.
 * Usage: DATABASE_URL=... AVEC_API_TOKEN=... AVEC_UNIT_ID=... npx tsx scripts/run-stock-movements-once.ts
 */
import { fetchAllAvecReport, periodRange } from '../src/lib/avec/client'
import { normalizeStockMovementRow } from '../src/lib/avec/normalize'
import { applyStockMovement } from '../src/lib/stock'
import { getSql } from '../src/lib/db'
import { saveReportSnapshot } from '../src/lib/avec/snapshots'

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL obrigatório')
  if (!process.env.AVEC_API_TOKEN) throw new Error('AVEC_API_TOKEN obrigatório')

  // Evita colidir com cron stock-fast enquanto preenchemos CMV.
  const sql = getSql()
  await sql`delete from sync_locks where key = ${'stock_sync'}`
  await sql`
    insert into sync_locks (key, owner, locked_at, expires_at)
    values (${'stock_sync'}, ${'stock-movements-once'}, now(), now() + interval '10 minutes')
  `

  try {
    const daysBack = Number(process.env.STOCK_MOVEMENTS_DAYS_BACK ?? 30)
    const { inicio, fim } = periodRange(daysBack, 0)
    const params = { inicio, fim, limit: 250 }
    console.log('0044', params)
    const result = await fetchAllAvecReport('0044', params)
    const rows = Array.isArray(result)
      ? result
      : ((result as { rows?: Record<string, unknown>[] }).rows ?? [])
    await saveReportSnapshot('0044', params, rows as Record<string, unknown>[])

    let synced = 0
    let skipped = 0
    let bad = 0
    for (const row of rows as Record<string, unknown>[]) {
      const mv = normalizeStockMovementRow(row)
      if (!mv) {
        bad++
        continue
      }
      const inserted = await applyStockMovement(mv, 'avec_0044')
      if (inserted) synced++
      else skipped++
    }
    console.log(JSON.stringify({ rows: rows.length, synced, skipped, bad }, null, 2))
  } finally {
    await sql`delete from sync_locks where key = ${'stock_sync'} and owner = ${'stock-movements-once'}`
  }
}

main().catch((e) => {
  console.error('FATAL', e)
  process.exit(1)
})
