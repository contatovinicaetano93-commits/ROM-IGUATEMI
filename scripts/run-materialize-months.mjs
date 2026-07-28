#!/usr/bin/env node
/**
 * Materializa salon_month_metrics (receita/CMV/despesas) para meses YTD.
 *
 *   BACKFILL_FROM=2026-01 BACKFILL_TO=2026-07 node --import tsx scripts/run-materialize-months.mjs
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
process.env.DATABASE_URL = loadOverlayDatabaseUrl() || process.env.DATABASE_URL?.trim() || ''

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL ausente')
  process.exit(1)
}

const { materializeSalonMonthMetrics, monthKeyFromDay } = await import(
  '../src/lib/salon/month-metrics.ts'
)
const { todayIso } = await import('../src/lib/salon/format.ts')

function addMonth(ym, delta) {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

const to = (process.env.BACKFILL_TO?.trim() || monthKeyFromDay(todayIso())).slice(0, 7)
const from = (process.env.BACKFILL_FROM?.trim() || `${to.slice(0, 4)}-01`).slice(0, 7)

console.log(`materialize months ${from} → ${to}`)
let cursor = from
while (cursor <= to) {
  const row = await materializeSalonMonthMetrics(cursor)
  console.log(
    JSON.stringify({
      month: cursor,
      status: row.status,
      revenue: row.revenue,
      attended: row.attended,
      cmv: row.cmv,
      expenses: row.expenses,
      days_present: row.days_present,
    }),
  )
  if (cursor >= to) break
  cursor = addMonth(cursor, 1)
}
console.log('MATERIALIZE_MONTHS_DONE')
