#!/usr/bin/env node
/**
 * Re-sincroniza só P3 (retorno/novos) por mês — limpa return_rate=0 falso.
 */
import { readFileSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { Module } from 'node:module'

const require = createRequire(import.meta.url)
const originalLoad = Module._load
Module._load = function (request, parent, isMain) {
  if (request === 'server-only') return {}
  return originalLoad(request, parent, isMain)
}

function loadOverlayDatabaseUrl() {
  for (const rel of ['secrets/database-url.txt', '.secrets/database-url.txt']) {
    const p = join(process.cwd(), rel)
    if (!existsSync(p)) continue
    const url = readFileSync(p, 'utf8').trim()
    if (url.startsWith('postgres')) return url
  }
  return null
}

process.env.ROM_PANEL = process.env.ROM_PANEL || 'iguatemi'
process.env.NEXT_PUBLIC_ROM_PANEL = process.env.NEXT_PUBLIC_ROM_PANEL || 'iguatemi'
process.env.AVEC_UNIT_ID = process.env.AVEC_UNIT_ID || '99801'
process.env.DATABASE_URL = loadOverlayDatabaseUrl() || process.env.DATABASE_URL?.trim() || ''

if (!process.env.AVEC_API_TOKEN?.trim()) {
  const { loadRuntimeAvecApiToken, saveAvecApiToken } = await import('../src/lib/avec/token-store.ts')
  const { isAvecLoginConfigured, mintAvecApiToken } = await import('../src/lib/avec/refresh-token.ts')
  let token = await loadRuntimeAvecApiToken()
  if (token) process.env.AVEC_API_TOKEN = token
  else if (isAvecLoginConfigured()) {
    const minted = await mintAvecApiToken({ force: true })
    await saveAvecApiToken(minted.token)
    process.env.AVEC_API_TOKEN = minted.token
  }
}

const { syncP3Kpis } = await import('../src/lib/avec/sync-p3.ts')
const { todayIso } = await import('../src/lib/salon/format.ts')

function monthLastDay(monthKey) {
  const [y, m] = monthKey.split('-').map(Number)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return `${monthKey}-${String(last).padStart(2, '0')}`
}
function isoToBr(iso) {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

const to = (process.env.BACKFILL_TO?.trim() || todayIso()).slice(0, 10)
const fromMonth = (process.env.BACKFILL_FROM?.trim() || `${to.slice(0, 4)}-01-01`).slice(0, 7)
const months = []
for (let cur = `${fromMonth}-01`; cur.slice(0, 7) <= to.slice(0, 7); ) {
  months.push(cur.slice(0, 7))
  const [y, m] = cur.split('-').map(Number)
  cur = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10)
}

console.log('p3 resnap months', months)
for (const month of months) {
  const monthEnd = monthLastDay(month)
  const asOf = monthEnd > to ? to : monthEnd
  const stats = { snapshots_saved: 0, errors: [], warnings: [], p3_rows: 0 }
  const t0 = Date.now()
  await syncP3Kpis(stats, undefined, {
    asOf,
    inicio: isoToBr(`${month}-01`),
    fim: isoToBr(asOf),
  })
  console.log(
    JSON.stringify({
      month,
      asOf,
      ms: Date.now() - t0,
      p3_rows: stats.p3_rows,
      errors: stats.errors.slice(0, 3),
      warnings: stats.warnings.slice(0, 3),
    }),
  )
}
console.log('P3_RESNAP_DONE')
