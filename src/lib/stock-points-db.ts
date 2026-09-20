import 'server-only'

import { getSql, type Sql } from '@/lib/db'
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

let romPointsPromise: Promise<RomLocation[]> | null = null

function isMissingRelation(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error)
  return /stock_point_balances|stock_locations|rom_code|does not exist|relation/i.test(msg)
}

async function seedRomPoints(): Promise<RomLocation[]> {
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

/** Garante as 4 linhas ROM (idempotente). Cacheia o seed no isolate. */
export async function ensureRomPoints(): Promise<RomLocation[]> {
  if (!romPointsPromise) {
    romPointsPromise = seedRomPoints().catch((error) => {
      romPointsPromise = null
      throw error
    })
  }
  return romPointsPromise
}

export async function listRomLocations(): Promise<RomLocation[]> {
  try {
    return await ensureRomPoints()
  } catch (error) {
    if (isMissingRelation(error)) return []
    throw error
  }
}

async function setBalance(
  productId: string,
  locationId: string,
  qty: number,
  sql: Sql = getSql(),
): Promise<void> {
  if (!(qty >= 0)) throw new Error('Saldo de ponto não pode ser negativo')
  const next = Math.round(qty * 1000) / 1000
  await sql`
    insert into stock_point_balances (product_id, location_id, qty, updated_at)
    values (${productId}::uuid, ${locationId}::uuid, ${next}, now())
    on conflict (product_id, location_id) do update
      set qty = excluded.qty, updated_at = now()
  `
}

/** Trava o par origem/destino em ordem estável (evita deadlock). */
async function lockBalance(txn: Sql, productId: string, locationId: string): Promise<number> {
  const rows = (await txn`
    insert into stock_point_balances (product_id, location_id, qty, updated_at)
    values (${productId}::uuid, ${locationId}::uuid, 0, now())
    on conflict (product_id, location_id) do update
      set qty = stock_point_balances.qty
    returning qty
  `) as { qty: number }[]
  return Number(rows[0]?.qty ?? 0)
}

export async function listBalancesForProduct(
  productId: string,
  locations?: RomLocation[],
): Promise<PointBalanceRow[]> {
  const sql = getSql()
  const locs = locations ?? (await ensureRomPoints())
  const rows = (await sql`
    select location_id, qty from stock_point_balances
    where product_id = ${productId}::uuid
  `) as { location_id: string; qty: number }[]
  const byId = new Map(rows.map((r) => [r.location_id, Number(r.qty)]))
  return locs.map((loc) => ({
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
  const balances = await listBalancesForProduct(productId, locations)
  const floorsSum = sumPointQtys(balances.filter((b) => b.rom_kind === 'piso'))
  const next = almoxQtyFromAvec(avecQty, floorsSum)
  await setBalance(productId, almox.id, next.almox)
  return next
}

/** Inventário inicial / reset: tudo no Almox (= Avec). Pisos zeram. */
export async function allocateAllToAlmox(productId: string, avecQty: number): Promise<void> {
  const locations = await ensureRomPoints()
  const sql = getSql()
  await sql.begin(async (txn) => {
    for (const loc of locations) {
      const qty = loc.rom_code === 'almox' ? Math.max(0, avecQty) : 0
      await setBalance(productId, loc.id, qty, txn)
    }
  })
}

export async function allocateAllProductsToAlmox(): Promise<{ updated: number }> {
  const locations = await ensureRomPoints()
  if (!locations.some((l) => l.rom_code === 'almox')) return { updated: 0 }

  const sql = getSql()
  return await sql.begin(async (txn) => {
    const inserted = (await txn`
      insert into stock_point_balances (product_id, location_id, qty, updated_at)
      select
        p.id,
        loc.id,
        case
          when loc.rom_code = 'almox' then greatest(coalesce(p.current_qty, 0), 0)
          else 0
        end,
        now()
      from stock_products p
      cross join stock_locations loc
      where loc.rom_code is not null
      on conflict (product_id, location_id) do update
        set qty = excluded.qty, updated_at = now()
      returning product_id
    `) as { product_id: string }[]
    return { updated: new Set(inserted.map((r) => r.product_id)).size }
  })
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

  const sql = getSql()
  return await sql.begin(async (txn) => {
    const [firstId, secondId] = [from.id, to.id].sort()
    const firstQty = await lockBalance(txn, input.productId, firstId)
    const secondQty = await lockBalance(txn, input.productId, secondId)
    const fromQty = firstId === from.id ? firstQty : secondQty
    const err = assertTransferOk({
      fromKind: from.rom_kind,
      toKind: to.rom_kind,
      fromQty,
      quantity: input.quantity,
    })
    if (err) throw new Error(err)

    const origin = (await txn`
      update stock_point_balances
      set qty = qty - ${input.quantity}, updated_at = now()
      where product_id = ${input.productId}::uuid
        and location_id = ${from.id}::uuid
        and qty >= ${input.quantity}
      returning qty
    `) as { qty: number }[]
    if (!origin[0]) throw new Error('Saldo insuficiente na origem')

    const dest = (await txn`
      update stock_point_balances
      set qty = qty + ${input.quantity}, updated_at = now()
      where product_id = ${input.productId}::uuid
        and location_id = ${to.id}::uuid
      returning qty
    `) as { qty: number }[]
    if (!dest[0]) throw new Error('Local ROM inválido')

    await txn`
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
    return { fromQty: Number(origin[0].qty), toQty: Number(dest[0].qty) }
  })
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
  const locations = await ensureRomPoints()
  const locationIds = locations.map((l) => l.id)
  if (locationIds.length === 0) return []

  const rows = (await sql`
    select
      p.id as product_id,
      p.name as product_name,
      p.sku,
      coalesce(p.current_qty, 0)::float as avec_qty,
      coalesce(sum(b.qty), 0)::float as rom_sum,
      coalesce(
        sum(b.qty) filter (where b.location_id = ${locationId ?? null}::uuid),
        0
      )::float as filtered_qty
    from stock_products p
    left join stock_point_balances b
      on b.product_id = p.id
      and b.location_id in ${sql(locationIds)}
    group by p.id, p.name, p.sku, p.current_qty
    order by lower(p.name)
  `) as {
    product_id: string
    product_name: string
    sku: string | null
    avec_qty: number
    rom_sum: number
    filtered_qty: number
  }[]

  const out: Array<{
    product_id: string
    product_name: string
    sku: string | null
    avec_qty: number
    point_qty: number
    rom_sum: number
    drift: number
  }> = []

  for (const row of rows) {
    const avec = Number(row.avec_qty) || 0
    const romSum = Number(row.rom_sum) || 0
    const pointQty = locationId ? Number(row.filtered_qty) || 0 : romSum
    if (locationId && pointQty === 0 && avec === 0) continue
    out.push({
      product_id: row.product_id,
      product_name: row.product_name,
      sku: row.sku,
      avec_qty: avec,
      point_qty: pointQty,
      rom_sum: romSum,
      drift: Math.round((romSum - avec) * 1000) / 1000,
    })
  }
  return out
}
