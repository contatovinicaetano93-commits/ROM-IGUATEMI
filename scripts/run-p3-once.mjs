#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { Module } from 'node:module'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const originalLoad = Module._load
Module._load = function (request, parent, isMain) {
  if (request === 'server-only') return {}
  return originalLoad(request, parent, isMain)
}

process.env.DATABASE_URL = readFileSync('secrets/database-url.txt', 'utf8').trim()
process.env.ROM_PANEL = 'iguatemi'
process.env.NEXT_PUBLIC_ROM_PANEL = 'iguatemi'
process.env.AVEC_UNIT_ID = process.env.AVEC_UNIT_ID || '99801'

async function main() {
  const { loadRuntimeAvecApiToken, saveAvecApiToken } = await import('../src/lib/avec/token-store.ts')
  const { isAvecLoginConfigured, mintAvecApiToken } = await import('../src/lib/avec/refresh-token.ts')
  let token = await loadRuntimeAvecApiToken()
  if (!token && isAvecLoginConfigured()) {
    const minted = await mintAvecApiToken({ force: true })
    await saveAvecApiToken(minted.token)
    token = minted.token
  }
  if (!token) {
    console.error('NO_AVEC_TOKEN')
    process.exit(2)
  }
  process.env.AVEC_API_TOKEN = token

  const { syncP3Kpis } = await import('../src/lib/avec/sync-p3.ts')
  const { getSql } = await import('../src/lib/db.ts')
  const sql = getSql()

  const before = await sql`
    select
      count(*)::int as n,
      count(return_rate)::int as with_rate,
      count(*) filter (where return_rate is not null and return_rate > 0)::int as gt0
    from salon_p3_daily
  `
  console.log('BEFORE', before)

  const stats = { snapshots_saved: 0, errors: [], warnings: [], p3_rows: 0 }
  await syncP3Kpis(stats)
  console.log('SYNC', JSON.stringify(stats))

  const rows = await sql`
    select day::text, return_rate::float, new_clients_period
    from salon_p3_daily
    order by day desc
    limit 8
  `
  console.log('P3_ROWS', JSON.stringify(rows))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
