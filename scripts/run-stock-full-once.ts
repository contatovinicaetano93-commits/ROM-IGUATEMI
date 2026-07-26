/**
 * One-shot: sync estoque full (0149/0046 + 0044 movimentos → CMV).
 * Usage: DATABASE_URL=... AVEC_API_TOKEN=... AVEC_UNIT_ID=... npx tsx scripts/run-stock-full-once.ts
 */
import { runStockSync } from '../src/lib/avec/sync-stock'

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL obrigatório')
  if (!process.env.AVEC_API_TOKEN) throw new Error('AVEC_API_TOKEN obrigatório')
  console.log('stock full start')
  const result = await runStockSync('full')
  console.log(
    JSON.stringify(
      {
        status: result.status,
        error: result.error,
        positions_synced: result.stats?.positions_synced,
        movements_synced: result.stats?.movements_synced,
        alerts_active: result.stats?.alerts_active,
        errors: (result.stats?.errors || []).slice(0, 15),
        warnings: (result.stats?.warnings || []).slice(0, 10),
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
