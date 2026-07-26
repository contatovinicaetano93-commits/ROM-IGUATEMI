/**
 * Fast 0044 backfill via postgres.js (TCP) — evita Neon HTTP por linha.
 * Usage:
 *   DATABASE_URL=... AVEC_API_TOKEN=... AVEC_UNIT_ID=... \
 *   STOCK_MOVEMENTS_DAYS_BACK=30 npx tsx scripts/run-stock-movements-fast.ts
 */
import postgres from 'postgres'
import { fetchAllAvecReport } from '../src/lib/avec/client'
import { normalizeStockMovementRow } from '../src/lib/avec/normalize'

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

function* dayWindows(from: string, to: string) {
  let cur = from
  while (cur <= to) {
    yield cur
    cur = addDays(cur, 1)
  }
}

async function main() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL obrigatório')
  if (!process.env.AVEC_API_TOKEN) throw new Error('AVEC_API_TOKEN obrigatório')

  const sql = postgres(url, { ssl: 'require', max: 1, prepare: false, connect_timeout: 30 })
  const today = todayIsoLocal()
  const daysBack = Number(process.env.STOCK_MOVEMENTS_DAYS_BACK ?? 30)
  const from = addDays(today, -Math.max(0, daysBack))

  const products = (await sql`
    select id, avec_product_id, unit_cost::float8 as unit_cost, avg_cost::float8 as avg_cost
    from stock_products
  `) as {
    id: string
    avec_product_id: string
    unit_cost: number | null
    avg_cost: number | null
  }[]
  const byAvec = new Map(products.map((p) => [String(p.avec_product_id), p]))
  console.log('products cached', byAvec.size)

  const existing = (await sql`
    select product_id::text as product_id, type, quantity::float8 as quantity,
           occurred_at::text as occurred_at
    from stock_movements where source = 'avec_0044'
  `) as { product_id: string; type: string; quantity: number; occurred_at: string }[]
  const seen = new Set(
    existing.map(
      (r) => `${r.product_id}|${r.type}|${r.quantity}|${String(r.occurred_at).slice(0, 19)}`,
    ),
  )
  console.log('existing movements', seen.size)

  let synced = 0
  let skipped = 0
  let bad = 0
  let rowsTotal = 0
  const batch: {
    product_id: string
    type: string
    quantity: number
    cost: number | null
    reason: string | null
    source: string
    occurred_at: string
  }[] = []

  async function flush() {
    if (!batch.length) return
    const chunk = batch.splice(0, batch.length)
    await sql`
      insert into stock_movements ${sql(
        chunk,
        'product_id',
        'type',
        'quantity',
        'cost',
        'reason',
        'source',
        'occurred_at',
      )}
    `
    synced += chunk.length
  }

  try {
    for (const day of dayWindows(from, today)) {
      const params = { inicio: isoToBr(day), fim: isoToBr(day), limit: 250 }
      const result = await fetchAllAvecReport('0044', params)
      rowsTotal += result.rows.length
      let dayNew = 0
      for (const row of result.rows) {
        const mv = normalizeStockMovementRow(row)
        if (!mv || !mv.occurredAt) {
          bad++
          continue
        }
        let prod = byAvec.get(String(mv.avecProductId))
        if (!prod) {
          const inserted = (await sql`
            insert into stock_products (avec_product_id, name, current_qty, unit_cost)
            values (${mv.avecProductId}, ${mv.name}, 0, null)
            on conflict (avec_product_id) do update set name = excluded.name
            returning id, avec_product_id, unit_cost::float8 as unit_cost, avg_cost::float8 as avg_cost
          `) as {
            id: string
            avec_product_id: string
            unit_cost: number | null
            avg_cost: number | null
          }[]
          prod = inserted[0]!
          byAvec.set(String(mv.avecProductId), prod)
        }
        const occurredKey = String(mv.occurredAt).replace('T', ' ').slice(0, 19)
        const key = `${prod.id}|${mv.type}|${mv.quantity}|${occurredKey}`
        if (seen.has(key)) {
          skipped++
          continue
        }
        seen.add(key)
        let cost = mv.cost
        if (cost == null || !(cost > 0)) {
          const unit = prod.unit_cost ?? prod.avg_cost
          if (unit != null && unit > 0) cost = Math.round(mv.quantity * unit * 100) / 100
        }
        batch.push({
          product_id: prod.id,
          type: mv.type,
          quantity: mv.quantity,
          cost: cost ?? null,
          reason: mv.reason ?? null,
          source: 'avec_0044',
          occurred_at: mv.occurredAt,
        })
        dayNew++
        if (batch.length >= 200) await flush()
      }
      await flush()
      console.log(day, 'rows', result.rows.length, 'new', dayNew, 'synced', synced)
    }
    console.log(JSON.stringify({ from, to: today, rowsTotal, synced, skipped, bad }, null, 2))
  } finally {
    await sql.end({ timeout: 5 })
  }
}

main().catch((e) => {
  console.error('FATAL', e)
  process.exit(1)
})
