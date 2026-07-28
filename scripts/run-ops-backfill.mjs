#!/usr/bin/env node
/**
 * Backfill operacional YTD — preenche gaps das outras seções além da receita:
 *  - 0081 payment_mix dia a dia (Financeiro / reconciliação)
 *  - P1/P2/P3 snapshot por mês (Visão ocupação/canais/pacotes/tops/retorno)
 *
 *   BACKFILL_FROM=2026-01-01 BACKFILL_TO=2026-07-28 node --import tsx scripts/run-ops-backfill.mjs
 *   OPS_SKIP_PAYMENT_MIX=1  — só snapshots mensais
 *   OPS_SKIP_MONTH_SNAPS=1  — só payment mix
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
const { syncPaymentMixRange, syncP2Kpis } = await import('../src/lib/avec/sync-p2.ts')
const { syncP1Kpis } = await import('../src/lib/avec/sync-p1.ts')
const { syncP3Kpis } = await import('../src/lib/avec/sync-p3.ts')

function addDays(iso, delta) {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + delta)
  return d.toISOString().slice(0, 10)
}

function monthLastDay(monthKey) {
  const [y, m] = monthKey.split('-').map(Number)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return `${monthKey}-${String(last).padStart(2, '0')}`
}

function isoToBr(iso) {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function listMonths(fromIso, toIso) {
  const out = []
  let cur = fromIso.slice(0, 7) + '-01'
  const end = toIso.slice(0, 7) + '-01'
  while (cur <= end) {
    out.push(cur.slice(0, 7))
    const [y, m] = cur.split('-').map(Number)
    const n = new Date(Date.UTC(y, m, 1))
    cur = n.toISOString().slice(0, 10)
  }
  return out
}

const to = (process.env.BACKFILL_TO?.trim() || todayIso()).slice(0, 10)
const from = (process.env.BACKFILL_FROM?.trim() || yearStartIso(to)).slice(0, 10)
const chunkDays = Math.max(1, Number(process.env.BACKFILL_CHUNK_DAYS || 7) || 7)
const skipPay = process.env.OPS_SKIP_PAYMENT_MIX === '1'
const skipSnaps = process.env.OPS_SKIP_MONTH_SNAPS === '1'

console.log(`ops backfill ${from} → ${to} chunk=${chunkDays} pay=${!skipPay} snaps=${!skipSnaps}`)

if (!skipPay) {
  let cursor = from
  let n = 0
  while (cursor <= to) {
    n += 1
    const chunkTo = (() => {
      const end = addDays(cursor, chunkDays - 1)
      return end < to ? end : to
    })()
    const stats = { snapshots_saved: 0, errors: [], warnings: [], p2_rows: 0 }
    const started = Date.now()
    await syncPaymentMixRange(stats, cursor, chunkTo)
    console.log(
      JSON.stringify({
        payment_chunk: n,
        from: cursor,
        to: chunkTo,
        elapsed_ms: Date.now() - started,
        p2_rows: stats.p2_rows,
        errors: stats.errors.slice(0, 3),
        warnings: stats.warnings.slice(0, 3),
      }),
    )
    if (chunkTo >= to) break
    cursor = addDays(chunkTo, 1)
  }
}

if (!skipSnaps) {
  const months = listMonths(from, to)
  console.log('month snaps', months)
  for (const month of months) {
    const monthEnd = monthLastDay(month)
    const asOf = monthEnd > to ? to : monthEnd
    const inicio = isoToBr(`${month}-01`)
    const fim = isoToBr(asOf)
    const stats = {
      snapshots_saved: 0,
      errors: [],
      warnings: [],
      p1_rows: 0,
      p2_rows: 0,
      p3_rows: 0,
    }
    const started = Date.now()
    const opts = { asOf, inicio, fim, includePaymentMix: false }
    try {
      await syncP1Kpis(stats, undefined, opts)
    } catch (e) {
      stats.errors.push(`P1: ${e instanceof Error ? e.message : e}`)
    }
    try {
      await syncP2Kpis(stats, undefined, opts)
    } catch (e) {
      stats.errors.push(`P2: ${e instanceof Error ? e.message : e}`)
    }
    try {
      await syncP3Kpis(stats, undefined, opts)
    } catch (e) {
      stats.errors.push(`P3: ${e instanceof Error ? e.message : e}`)
    }
    console.log(
      JSON.stringify({
        month,
        asOf,
        inicio,
        fim,
        elapsed_ms: Date.now() - started,
        p1_rows: stats.p1_rows,
        p2_rows: stats.p2_rows,
        p3_rows: stats.p3_rows,
        errors: stats.errors.slice(0, 5),
        warnings: stats.warnings.slice(0, 5),
      }),
    )
  }
}

console.log('OPS_BACKFILL_DONE')
