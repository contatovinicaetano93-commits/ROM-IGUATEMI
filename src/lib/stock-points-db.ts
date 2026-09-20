import 'server-only'

import { getSql } from '@/lib/db'
import {
  ROM_POINT_SEED,
  almoxQtyFromAvec,
  assertTransferOk,
  sumPointQtys,
  type PointBalanceRow,
  type RomPointKind,
} from '@/lib/stock-points'

export type RomLocation = {
  id: string
  name: string
  rom_code: string
  rom_kind: RomPointKind
}

function isMissingRelation(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error)
  return /stock_point_balances|stock_locations|rom_code|does not exist|relation/i.test(msg)
}

/** Garante as 4 linhas ROM (idempotente). */
export async function ensureRomPoints(): Promise<RomLocation[]> {
  const sql = getSql()
  for (const seed of ROM_POINT_SEED) {
    const existing = (await sql`
      select id from stock_locations where rom_code = ${seed.rom_code} limit 1
    `) as { id: string }[]
    if (existing[0]) {
      await sql`
        update stock_locations
        set name = ${seed.name}, rom_kind = ${seed.rom_kind}
        where id = ${existing[0].id}::uuid
      `
    } else {
      await sql`
        insert into stock_locations (name, rom_code, rom_kind)
        values (${seed.name}, ${seed.rom_code}, ${seed.rom_kind})
      `
    }
  }
  const rows = (await sql`
    select id, name, rom_code, rom_kind
    from stock_locations
    where rom_code is not null
    order by case rom_code
      when 'almox' then 0
      when 'piso_1' then 1
      when 'piso_2' then 2
      when 'piso_3' then 3
      else 9
    end
  `) as RomLocation[]
  return rows
}

export async function listRomLocations(): Promise<RomLocation[]> {
  try {
    return await ensureRomPoints()
  } catch (error) {
    if (isMissingRelation(error)) return []
    throw error
  }
}

async function getBalance(productId: string, locationId: string): Promise<number> {
  const sql = getSql()
  const rows = (await sql`
    select qty from stock_point_balances
    where product_id = ${productId}::uuid and location_id = ${locationId}::uuid
    limit 1
  `) as { qty: number }[]
  return Number(rows[0]?.qty ?? 0)
}

async function setBalance(productId: string, locationId: string, qty: number): Promise<void> {
  const sql = getSql()
  const next = Math.max(0, Math.round(qty * 1000) / 1000)
  await sql`
    insert into stock_point_balances (product_id, location_id, qty, updated_at)
    values (${productId}::uuid, ${locationId}::uuid, ${next}, now())
    on conflict (product_id, location_id) do update
      set qty = excluded.qty, updated_at = now()
  `
}

export async function listBalancesForProduct(productId: string): Promise<PointBalanceRow[]> {
  const sql = getSql()
  const locations = await ensureRomPoints()
  const rows = (await sql`
    select location_id, qty from stock_point_balances
    where product_id = ${productId}::uuid
  `) as { location_id: string; qty: number }[]
  const byId = new Map(rows.map((r) => [r.location_id, Number(r.qty)]))
  return locations.map((loc) => ({
    location_id: loc.id,
    rom_code: loc.rom_code,
    rom_kind: loc.rom_kind,
    name: loc.name,
    qty: byId.get(loc.id) ?? 0,
  }))
}

/**
 * Depois do sync Avec: Almox absorve o restante (Avec − pisos).
 * Inventário nos pisos permanece até transferência ou inventário novo.
 */
export async function reconcileAlmoxAfterAvecQty(
  productId: string,
  avecQty: number,
): Promise<{ almox: number; drift: number }> {
  const locations = await ensureRomPoints()
  const almox = locations.find((l) => l.rom_code === 'almox')
  if (!almox) return { almox: 0, drift: 0 }
  const balances = await listBalancesForProduct(productId)
  const floorsSum = sumPointQtys(balances.filter((b) => b.rom_kind === 'piso'))
  const next = almoxQtyFromAvec(avecQty, floorsSum)
  await setBalance(productId, almox.id, next.almox)
  return next
}

/** Inventário inicial / reset: tudo no Almox (= Avec). Pisos zeram. */
export async function allocateAllToAlmox(productId: string, avecQty: number): Promise<void> {
  const locations = await ensureRomPoints()
  for (const loc of locations) {
    const qty = loc.rom_code === 'almox' ? Math.max(0, avecQty) : 0
    await setBalance(productId, loc.id, qty)
  }
}

export async function allocateAllProductsToAlmox(): Promise<{ updated: number }> {
  const sql = getSql()
  const products = (await sql`
    select id, current_qty from stock_products
  `) as { id: string; current_qty: number }[]
  for (const p of products) {
    await allocateAllToAlmox(p.id, Number(p.current_qty) || 0)
  }
  return { updated: products.length }
}

export async function transferBetweenPoints(input: {
  productId: string
  fromLocationId: string
  toLocationId: string
  quantity: number
  createdBy?: string | null
  note?: string | null
}): Promise<{ fromQty: number; toQty: number }> {
  const locations = await ensureRomPoints()
  const from = locations.find((l) => l.id === input.fromLocationId)
  const to = locations.find((l) => l.id === input.toLocationId)
  if (!from || !to) throw new Error('Local ROM inválido')
  if (from.id === to.id) throw new Error('Origem e destino iguais')

  const fromQty = await getBalance(input.productId, from.id)
  const err = assertTransferOk({
    fromKind: from.rom_kind,
    toKind: to.rom_kind,
    fromQty,
    quantity: input.quantity,
  })
  if (err) throw new Error(err)

  const toQty = await getBalance(input.productId, to.id)
  const nextFrom = fromQty - input.quantity
  const nextTo = toQty + input.quantity
  await setBalance(input.productId, from.id, nextFrom)
  await setBalance(input.productId, to.id, nextTo)

  const sql = getSql()
  await sql`
    insert into stock_point_transfers (
      product_id, from_location_id, to_location_id, quantity, note, created_by
    ) values (
      ${input.productId}::uuid,
      ${from.id}::uuid,
      ${to.id}::uuid,
      ${input.quantity},
      ${input.note?.trim() || null},
      ${input.createdBy?.trim() || null}
    )
  `
  return { fromQty: nextFrom, toQty: nextTo }
}

export async function listPointBoard(locationId?: string): Promise<
  Array<{
    product_id: string
    product_name: string
    sku: string | null
    avec_qty: number
    point_qty: number
    rom_sum: number
    drift: number
  }>
> {
  const sql = getSql()
  await ensureRomPoints()
  const products = (await sql`
    select id, name, sku, current_qty from stock_products order by lower(name)
  `) as { id: string; name: string; sku: string | null; current_qty: number }[]

  const out: Array<{
    product_id: string
    product_name: string
    sku: string | null
    avec_qty: number
    point_qty: number
    rom_sum: number
    drift: number
  }> = []

  for (const p of products) {
    const balances = await listBalancesForProduct(p.id)
    const romSum = sumPointQtys(balances)
    const avec = Number(p.current_qty) || 0
    const pointQty = locationId
      ? balances.find((b) => b.location_id === locationId)?.qty ?? 0
      : romSum
    if (locationId && pointQty === 0 && avec === 0) continue
    out.push({
      product_id: p.id,
      product_name: p.name,
      sku: p.sku,
      avec_qty: avec,
      point_qty: pointQty,
      rom_sum: romSum,
      drift: Math.round((romSum - avec) * 1000) / 1000,
    })
  }
  return out
}
