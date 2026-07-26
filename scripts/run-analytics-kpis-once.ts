/**
 * One-shot: preenche Visão analítica — P1 (0126/0021/0003/0032) + P2 (0056/0061/0081) + P3 (0007/0017).
 * Usage: DATABASE_URL=... AVEC_API_TOKEN=... AVEC_UNIT_ID=... npx tsx scripts/run-analytics-kpis-once.ts
 */
import { syncP1Kpis } from '../src/lib/avec/sync-p1'
import { syncP2Kpis } from '../src/lib/avec/sync-p2'
import { syncP3Kpis } from '../src/lib/avec/sync-p3'

async function runLayer(name: string, fn: (s: Stats) => Promise<void>) {
  const stats: Stats = {
    snapshots_saved: 0,
    errors: [],
    warnings: [],
    p1_rows: 0,
    p2_rows: 0,
    p3_rows: 0,
  }
  console.log(`${name} start`)
  await fn(stats)
  console.log(
    name,
    JSON.stringify(
      {
        snapshots_saved: stats.snapshots_saved,
        errors: stats.errors.slice(0, 12),
        warnings: (stats.warnings || []).slice(0, 8),
        p1_rows: stats.p1_rows,
        p2_rows: stats.p2_rows,
        p3_rows: stats.p3_rows,
      },
      null,
      2,
    ),
  )
  return stats
}

type Stats = {
  snapshots_saved: number
  errors: string[]
  warnings?: string[]
  p1_rows?: number
  p2_rows?: number
  p3_rows?: number
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL obrigatório')
  if (!process.env.AVEC_API_TOKEN) throw new Error('AVEC_API_TOKEN obrigatório')
  await runLayer('P1', (s) => syncP1Kpis(s))
  await runLayer('P2', (s) => syncP2Kpis(s))
  await runLayer('P3', (s) => syncP3Kpis(s))
  console.log('OK analytics KPIs')
}

main().catch((e) => {
  console.error('FATAL', e)
  process.exit(1)
})
