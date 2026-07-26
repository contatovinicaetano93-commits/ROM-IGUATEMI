/**
 * One-shot: 0044 (movimentos) → stock_movements / CMV.
 * Varre em janelas semanais (evita truncamento 5000 linhas).
 * Não grava snapshot (quota Neon IG).
 *
 * Usage: DATABASE_URL=... AVEC_API_TOKEN=... AVEC_UNIT_ID=... \
 *   STOCK_MOVEMENTS_DAYS_BACK=30 npx tsx scripts/run-stock-movements-once.ts
 */
import { fetchAllAvecReport, formatTruncationWarning } from '../src/lib/avec/client'
import { normalizeStockMovementRow } from '../src/lib/avec/normalize'
import { applyStockMovement } from '../src/lib/stock'
import { getSql } from '../src/lib/db'

function todayIsoLocal() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function addDays(iso: string, delta: number) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y!, m! - 1, d! + delta)).toISOString().slice(0, 10)
}

function isoToBr(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function* weekWindows(from: string, to: string): Generator<{ from: string; to: string }> {
  let cur = from
  while (cur <= to) {
    const end = addDays(cur, 6)
    const winTo = end < to ? end : to
    yield { from: cur, to: winTo }
    cur = addDays(winTo, 1)
  }
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL obrigatório')
  if (!process.env.AVEC_API_TOKEN) throw new Error('AVEC_API_TOKEN obrigatório')

  const sql = getSql()
  await sql`delete from sync_locks where key = ${'stock_sync'}`
  await sql`
    insert into sync_locks (key, owner, locked_at, expires_at)
    values (${'stock_sync'}, ${'stock-movements-once'}, now(), now() + interval '20 minutes')
  `

  const today = todayIsoLocal()
  const daysBack = Number(process.env.STOCK_MOVEMENTS_DAYS_BACK ?? 30)
  const from = addDays(today, -Math.max(0, daysBack))
  let synced = 0
  let skipped = 0
  let bad = 0
  let rowsTotal = 0
  const warnings: string[] = []

  try {
    for (const win of weekWindows(from, today)) {
      const params = { inicio: isoToBr(win.from), fim: isoToBr(win.to), limit: 250 }
      console.log('0044 window', params)
      const result = await fetchAllAvecReport('0044', params)
      if (result.truncated) {
        const msg = formatTruncationWarning('0044', result)
        warnings.push(`${win.from}..${win.to}: ${msg}`)
        console.warn(msg)
      }
      rowsTotal += result.rows.length
      for (const row of result.rows) {
        const mv = normalizeStockMovementRow(row)
        if (!mv) {
          bad++
          continue
        }
        const inserted = await applyStockMovement(mv, 'avec_0044')
        if (inserted) synced++
        else skipped++
      }
      console.log('  progress', { rows: result.rows.length, synced, skipped, bad })
    }
    console.log(JSON.stringify({ from, to: today, rowsTotal, synced, skipped, bad, warnings }, null, 2))
  } finally {
    await sql`delete from sync_locks where key = ${'stock_sync'} and owner = ${'stock-movements-once'}`
  }
}

main().catch((e) => {
  console.error('FATAL', e)
  process.exit(1)
})
