/**
 * One-shot: popular return_rate (P3) + alertas de estoque locais.
 * Uso (prod IG):
 *   DATABASE_URL=... AVEC_API_TOKEN=... AVEC_UNIT_ID=99801 \
 *   npx tsx scripts/fix-proximas-acoes-ausentes.ts
 */
import { syncP3Kpis } from '../src/lib/avec/sync-p3'
import { ensureSalonP3Table } from '../src/lib/salon/p3-metrics'
import { seedLocalStockAlertsFromCatalog } from '../src/lib/stock'
import { getSql } from '../src/lib/db'

async function main() {
  await ensureSalonP3Table()

  const p3 = {
    snapshots_saved: 0,
    errors: [] as string[],
    warnings: [] as string[],
    p3_rows: 0,
  }
  console.log('P3 start')
  await syncP3Kpis(p3)
  console.log('P3', JSON.stringify(p3, null, 2))

  const sql = getSql()
  const p3row = (await sql`
    select day::text as day, return_rate::float as return_rate, new_clients_period
    from salon_p3_daily
    order by day desc
    limit 1
  `) as { day: string; return_rate: number | null; new_clients_period: number }[]
  console.log('salon_p3_daily latest', p3row[0] ?? null)

  console.log('seed stock alerts start')
  const seeded = await seedLocalStockAlertsFromCatalog()
  const alerts = (await sql`
    select count(*)::int as n from stock_alerts where status = 'ativo'
  `) as { n: number }[]
  console.log('STOCK', { seeded, active_alerts: alerts[0]?.n ?? 0 })

  // Liberar lock preso de stock_fast (abandoned_partial_timeout).
  await sql`delete from sync_locks where key = 'stock_sync' and expires_at < now()`.catch(() => undefined)
  await sql`delete from sync_locks where key = 'stock_sync'`.catch(() => undefined)
  console.log('sync_locks stock_sync cleared')
}

main().catch((e) => {
  console.error('FATAL', e)
  process.exit(1)
})
