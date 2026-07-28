#!/usr/bin/env node
/**
 * Backfill YTD de métricas diárias (receita/cancel/no-show) no Supabase.
 *
 *   node --import tsx scripts/run-revenue-backfill.mjs
 *   BACKFILL_FROM=2026-01-01 BACKFILL_TO=2026-07-27 BACKFILL_CHUNK_DAYS=10 ...
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
process.env.AVEC_SYNC_DEBUG = process.env.AVEC_SYNC_DEBUG || '1'
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

console.log(
  'db',
  process.env.DATABASE_URL.replace(/:[^:@/]+@/, ':***@').split('@')[1]?.split('/')[0],
)

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

const { runAvecRevenueBackfill, yearStartIso } = await import('../src/lib/avec/sync.ts')
const { todayIso } = await import('../src/lib/salon/format.ts')
const { materializeSalonMonthMetrics } = await import('../src/lib/salon/month-metrics.ts')

const to = (process.env.BACKFILL_TO?.trim() || todayIso()).slice(0, 10)
let from = (process.env.BACKFILL_FROM?.trim() || yearStartIso(to)).slice(0, 10)
const chunkDays = Math.max(1, Number(process.env.BACKFILL_CHUNK_DAYS || 10) || 10)

console.log(`revenue backfill ${from} → ${to} chunk=${chunkDays}`)

let n = 0
while (true) {
  n += 1
  const started = Date.now()
  const r = await runAvecRevenueBackfill({ from, to, chunkDays })
  console.log(
    JSON.stringify({
      chunk: n,
      elapsed_ms: Date.now() - started,
      from: r.from,
      to: r.to,
      status: r.status,
      revenue_rows: r.stats.revenue_rows,
      cancellation_rows: r.stats.cancellation_rows,
      errors: r.stats.errors.slice(0, 5),
      warnings: r.stats.warnings.slice(0, 5),
      next_from: r.next_from,
      done: r.done,
    }),
  )
  if (r.status === 'error' && r.stats.revenue_rows === 0) {
    throw new Error(r.error || r.stats.errors[0] || 'backfill error')
  }
  if (r.done || !r.next_from) break
  from = r.next_from
}

// Materializa meses do intervalo para Relatórios / comparativo.
const months = new Set()
for (
  let d = new Date(`${(process.env.BACKFILL_FROM?.trim() || yearStartIso(to)).slice(0, 7)}-01T12:00:00Z`);
  d <= new Date(`${to}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1)
) {
  months.add(d.toISOString().slice(0, 7))
}
console.log('materialize months', [...months])
for (const month of months) {
  try {
    const row = await materializeSalonMonthMetrics(month, { force: true })
    console.log('month', month, row?.status ?? 'ok', 'revenue', row?.revenue)
  } catch (e) {
    console.warn('month fail', month, e instanceof Error ? e.message : e)
  }
}

console.log('BACKFILL_DONE')
