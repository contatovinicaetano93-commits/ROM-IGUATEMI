/**
 * One-shot: P1 (ocupação/aquisição) + estoque fast (alertas 0046).
 * Usage: DATABASE_URL=... AVEC_API_TOKEN=... AVEC_UNIT_ID=... npx tsx scripts/run-kpi-empties-once.ts
 */
import { syncP1Kpis } from '../src/lib/avec/sync-p1'
import { runStockSync } from '../src/lib/avec/sync-stock'

async function main() {
  const p1 = {
    snapshots_saved: 0,
    errors: [] as string[],
    warnings: [] as string[],
    p1_rows: 0,
  }
  console.log('P1 start')
  await syncP1Kpis(p1)
  console.log('P1', JSON.stringify(p1, null, 2))

  console.log('stock fast start')
  const stock = await runStockSync('fast')
  console.log(
    'STOCK',
    JSON.stringify(
      {
        status: stock.status,
        error: stock.error,
        alerts_active: stock.stats?.alerts_active,
        alerts_resolved: stock.stats?.alerts_resolved,
        positions_synced: stock.stats?.positions_synced,
        errors: (stock.stats?.errors || []).slice(0, 10),
        warnings: (stock.stats?.warnings || []).slice(0, 10),
      },
      null,
      2,
    ),
  )
}

main().catch((e) => {
  console.error('FATAL', e)
  process.exit(1)
})
