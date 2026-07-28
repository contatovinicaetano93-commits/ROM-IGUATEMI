#!/usr/bin/env node
/**
 * Backfill 0044 (movimentos de estoque) → CMV no Financeiro/Relatórios.
 *
 *   BACKFILL_FROM=2026-01-01 BACKFILL_TO=2026-07-28 BACKFILL_CHUNK_DAYS=7 \
 *     node --import tsx scripts/run-stock-movements-backfill.mjs
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

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL ausente')
  process.exit(1)
}

try {
  require('dns').setDefaultResultOrder('ipv4first')
} catch {
  // ignore
}

if (!process.env.AVEC_API_TOKEN?.trim()) {
  const { loadRuntimeAvecApiToken, saveAvecApiToken } = await import('../src/lib/avec/token-store.ts')
  const { isAvecLoginConfigured, mintAvecApiToken } = await import('../src/lib/avec/refresh-token.ts')
  let token = await loadRuntimeAvecApiToken()
  if (token) {
    process.env.AVEC_API_TOKEN = token
    console.log('token: app_runtime_secrets')
  } else if (isAvecLoginConfigured()) {
    const minted = await mintAvecApiToken({ force: true })
    token = minted.token
    await saveAvecApiToken(token)
    process.env.AVEC_API_TOKEN = token
    console.log('token: renovado')
  } else {
    console.error('AVEC_API_TOKEN ausente')
    process.exit(1)
  }
}

const { todayIso } = await import('../src/lib/salon/format.ts')
const { yearStartIso } = await import('../src/lib/avec/sync.ts')
const { syncMovementsDateRange } = await import('../src/lib/avec/sync-stock.ts')

function addDays(iso, delta) {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + delta)
  return d.toISOString().slice(0, 10)
}

function isoToBr(iso) {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

const to = (process.env.BACKFILL_TO?.trim() || todayIso()).slice(0, 10)
const from = (process.env.BACKFILL_FROM?.trim() || yearStartIso(to)).slice(0, 10)
const chunkDays = Math.max(1, Number(process.env.BACKFILL_CHUNK_DAYS || 7) || 7)

console.log(`stock movements backfill ${from} → ${to} chunk=${chunkDays}`)

let cursor = from
let n = 0
while (cursor <= to) {
  n += 1
  const chunkTo = (() => {
    const end = addDays(cursor, chunkDays - 1)
    return end < to ? end : to
  })()
  const stats = {
    positions_synced: 0,
    alerts_active: 0,
    alerts_resolved: 0,
    movements_synced: 0,
    movements_skipped_duplicate: 0,
    purchases_enriched: 0,
    snapshots_saved: 0,
    errors: [],
    warnings: [],
  }
  const started = Date.now()
  await syncMovementsDateRange(stats, undefined, isoToBr(cursor), isoToBr(chunkTo))
  console.log(
    JSON.stringify({
      chunk: n,
      from: cursor,
      to: chunkTo,
      elapsed_ms: Date.now() - started,
      synced: stats.movements_synced,
      skipped: stats.movements_skipped_duplicate,
      errors: stats.errors.slice(0, 3),
      warnings: stats.warnings.slice(0, 3),
    }),
  )
  if (chunkTo >= to) break
  cursor = addDays(chunkTo, 1)
}

console.log('STOCK_MOVEMENTS_BACKFILL_DONE')
