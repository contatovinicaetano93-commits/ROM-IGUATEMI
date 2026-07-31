import { getSql } from '@/lib/db'
import { getLatestSnapshot } from '@/lib/avec/snapshots'
import { normalizeStockValuationRow } from '@/lib/avec/normalize'
import type {
  NormalizedStockPosition,
  NormalizedStockAlert,
  NormalizedStockMovement,
  NormalizedStockPurchase,
} from '@/lib/avec/normalize'
import { normalizeSearchText } from '@/lib/search'

function productNameKey(name: string): string {
  return normalizeSearchText(name).toLowerCase()
}

/** Id sintético quando 0046 não traz produto_id e o catálogo ainda não tem o item. */
function syntheticAlertProductId(name: string): string {
  const slug = productNameKey(name)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
  return `alert:${slug || 'unknown'}`
}

export interface StockCategory {
  id: string
  name: string
}

export interface StockBrand {
  id: string
  name: string
}

export interface StockLocation {
  id: string
  avec_local_estoque_id: string | null
  name: string
}

export interface StockProduct {
  id: string
  avec_product_id: string | null
  sku: string | null
  name: string
  category_id: string | null
  category_name: string | null
  brand_id: string | null
  brand_name: string | null
  location_id: string | null
  location_name: string | null
  unit_cost: number | null
  unit_price: number | null
  current_qty: number
  minimum_qty: number | null
  suggested_reposition: number | null
  last_synced_at: string | null
}

export interface StockMovement {
  id: string
  product_id: string
  product_name: string
  type: 'entrada' | 'saida' | 'ajuste_manual'
  quantity: number
  cost: number | null
  reason: string | null
  source: string
  occurred_at: string
  created_by: string | null
}

export interface StockAlert {
  id: string
  product_id: string
  product_name: string
  category_name: string | null
  current_qty: number
  minimum_qty: number
  suggested_reposition: number | null
  /** Custo unitário do produto (0149) — para estimar custo de reposição localmente. */
  unit_cost: number | null
  status: 'ativo' | 'reconhecido'
  created_at: string
  acknowledged_at: string | null
  acknowledged_by: string | null
}

// ---------------------------------------------------------------------------
// Dimensões (categoria/marca/local) — resolvidas por nome (mesmo padrão de
// createCategory em finance.ts: busca antes de inserir, sem depender de
// ON CONFLICT em índice de expressão).
// ---------------------------------------------------------------------------

export async function upsertCategoryByName(name: string | null): Promise<string | null> {
  const trimmed = name?.trim()
  if (!trimmed) return null
  const sql = getSql()
  const existing = (await sql`
    select id from stock_categories where lower(name) = lower(${trimmed}) limit 1
  `) as { id: string }[]
  if (existing[0]) return existing[0].id
  const rows = (await sql`insert into stock_categories (name) values (${trimmed}) returning id`) as { id: string }[]
  return rows[0]!.id
}

export async function upsertBrandByName(name: string | null): Promise<string | null> {
  const trimmed = name?.trim()
  if (!trimmed) return null
  const sql = getSql()
  const existing = (await sql`
    select id from stock_brands where lower(name) = lower(${trimmed}) limit 1
  `) as { id: string }[]
  if (existing[0]) return existing[0].id
  const rows = (await sql`insert into stock_brands (name) values (${trimmed}) returning id`) as { id: string }[]
  return rows[0]!.id
}

export async function upsertLocationByAvecId(avecLocalEstoqueId: string | null): Promise<string | null> {
  const trimmed = avecLocalEstoqueId?.trim()
  if (!trimmed) return null
  const sql = getSql()
  const existing = (await sql`
    select id from stock_locations where avec_local_estoque_id = ${trimmed} limit 1
  `) as { id: string }[]
  if (existing[0]) return existing[0].id
  const rows = (await sql`
    insert into stock_locations (avec_local_estoque_id, name) values (${trimmed}, ${`Local ${trimmed}`})
    returning id
  `) as { id: string }[]
  return rows[0]!.id
}

export async function listCategories(): Promise<StockCategory[]> {
  const sql = getSql()
  return (await sql`select id, name from stock_categories order by name asc`) as StockCategory[]
}

export async function listBrands(): Promise<StockBrand[]> {
  const sql = getSql()
  return (await sql`select id, name from stock_brands order by name asc`) as StockBrand[]
}

export async function listLocations(): Promise<StockLocation[]> {
  const sql = getSql()
  return (await sql`
    select id, avec_local_estoque_id, name from stock_locations order by name asc
  `) as StockLocation[]
}

// ---------------------------------------------------------------------------
// Produtos — upsert a partir da Avec (fonte da verdade) + leitura para a UI.
// ---------------------------------------------------------------------------

export interface ListProductsFilter {
  categoryId?: string
  brandId?: string
  locationId?: string
  lowStockOnly?: boolean
  /** Cap de linhas na UI (default 400). */
  limit?: number
}

export async function listProducts(filter: ListProductsFilter = {}): Promise<StockProduct[]> {
  const sql = getSql()
  const limit = Math.min(Math.max(1, filter.limit ?? 400), 1000)
  const rows = (await sql`
    select
      sp.id, sp.avec_product_id, sp.sku, sp.name,
      sp.category_id, sc.name as category_name,
      sp.brand_id, sb.name as brand_name,
      sp.location_id, sl.name as location_name,
      sp.unit_cost::float as unit_cost, sp.unit_price::float as unit_price,
      sp.current_qty::float as current_qty,
      sp.minimum_qty::float as minimum_qty,
      sp.suggested_reposition::float as suggested_reposition,
      sp.last_synced_at
    from stock_products sp
    left join stock_categories sc on sc.id = sp.category_id
    left join stock_brands sb on sb.id = sp.brand_id
    left join stock_locations sl on sl.id = sp.location_id
    where (${filter.categoryId ?? null}::uuid is null or sp.category_id = ${filter.categoryId ?? null}::uuid)
      and (${filter.brandId ?? null}::uuid is null or sp.brand_id = ${filter.brandId ?? null}::uuid)
      and (${filter.locationId ?? null}::uuid is null or sp.location_id = ${filter.locationId ?? null}::uuid)
      and (${filter.lowStockOnly ?? false} = false or sp.minimum_qty is not null and sp.current_qty <= sp.minimum_qty)
    order by sp.name asc
    limit ${limit}
  `) as StockProduct[]
  return rows
}

export async function getProduct(id: string): Promise<StockProduct | null> {
  const sql = getSql()
  const rows = (await sql`
    select
      sp.id, sp.avec_product_id, sp.sku, sp.name,
      sp.category_id, sc.name as category_name,
      sp.brand_id, sb.name as brand_name,
      sp.location_id, sl.name as location_name,
      sp.unit_cost::float as unit_cost, sp.unit_price::float as unit_price,
      sp.current_qty::float as current_qty,
      sp.minimum_qty::float as minimum_qty,
      sp.suggested_reposition::float as suggested_reposition,
      sp.last_synced_at
    from stock_products sp
    left join stock_categories sc on sc.id = sp.category_id
    left join stock_brands sb on sb.id = sp.brand_id
    left join stock_locations sl on sl.id = sp.location_id
    where sp.id = ${id}
    limit 1
  `) as StockProduct[]
  return rows[0] ?? null
}

/** Upsert vindo do relatório 0149 (Posição de Estoque) — fast sync. */
export async function upsertStockProductFromPosition(
  pos: NormalizedStockPosition
): Promise<{ productId: string; previousQty: number | null }> {
  const sql = getSql()
  const [categoryId, brandId, locationId] = await Promise.all([
    upsertCategoryByName(pos.categoryName),
    upsertBrandByName(pos.brandName),
    upsertLocationByAvecId(pos.locationId),
  ])

  const before = (await sql`
    select current_qty::float as current_qty from stock_products where avec_product_id = ${pos.avecProductId} limit 1
  `) as { current_qty: number }[]
  const previousQty = before[0]?.current_qty ?? null

  const rows = (await sql`
    insert into stock_products (
      avec_product_id, sku, name, category_id, brand_id, location_id,
      unit_cost, unit_price, current_qty, minimum_qty, last_synced_at
    )
    values (
      ${pos.avecProductId}, ${pos.sku}, ${pos.name}, ${categoryId}, ${brandId}, ${locationId},
      ${pos.unitCost}, ${pos.unitPrice}, ${pos.quantity}, ${pos.minimumQty}, now()
    )
    on conflict (avec_product_id) do update set
      sku = coalesce(excluded.sku, stock_products.sku),
      name = excluded.name,
      category_id = coalesce(excluded.category_id, stock_products.category_id),
      brand_id = coalesce(excluded.brand_id, stock_products.brand_id),
      location_id = coalesce(excluded.location_id, stock_products.location_id),
      unit_cost = coalesce(excluded.unit_cost, stock_products.unit_cost),
      unit_price = coalesce(excluded.unit_price, stock_products.unit_price),
      current_qty = excluded.current_qty,
      minimum_qty = coalesce(excluded.minimum_qty, stock_products.minimum_qty),
      last_synced_at = excluded.last_synced_at,
      updated_at = now()
    returning id
  `) as { id: string }[]

  return { productId: rows[0]!.id, previousQty }
}

// ---------------------------------------------------------------------------
// Alertas — vindos do relatório 0046 (a Avec já calcula a sugestão de reposição).
// ---------------------------------------------------------------------------

/** Aplica uma linha de 0046: garante o produto, atualiza mínimo/sugestão e abre/atualiza alerta ativo. */
export async function applyStockAlert(
  alert: NormalizedStockAlert,
  opts?: {
    /** Mapa nameKey → avec_product_id (evita SELECT * em stock_products por linha). */
    productNameIndex?: Map<string, string>
  },
): Promise<{ productId: string; avecProductId: string } | null> {
  const sql = getSql()
  const categoryId = await upsertCategoryByName(alert.categoryName)

  let avecProductId = alert.avecProductId
  if (!avecProductId) {
    // Match sem acento/case — 0046 manda nome sem id e o catálogo pode diferir em acentos.
    const target = productNameKey(alert.name)
    const fromIndex = opts?.productNameIndex?.get(target)
    if (fromIndex) {
      avecProductId = fromIndex
    } else {
      const candidates = (await sql`
        select avec_product_id, name from stock_products
        where avec_product_id is not null
      `) as { avec_product_id: string; name: string }[]
      const hit = candidates.find((p) => productNameKey(p.name) === target)
      avecProductId = hit?.avec_product_id ?? syntheticAlertProductId(alert.name)
    }
  }
  if (!avecProductId) return null

  const rows = (await sql`
    insert into stock_products (avec_product_id, name, category_id, current_qty, minimum_qty, suggested_reposition, last_synced_at)
    values (${avecProductId}, ${alert.name}, ${categoryId}, ${alert.currentQty}, ${alert.minimumQty}, ${alert.suggestedReposition}, now())
    on conflict (avec_product_id) do update set
      name = excluded.name,
      category_id = coalesce(stock_products.category_id, excluded.category_id),
      current_qty = case
        when excluded.current_qty > 0 then excluded.current_qty
        else stock_products.current_qty
      end,
      minimum_qty = excluded.minimum_qty,
      suggested_reposition = excluded.suggested_reposition,
      last_synced_at = excluded.last_synced_at,
      updated_at = now()
    returning id
  `) as { id: string }[]
  const productId = rows[0]!.id

  const existing = (await sql`
    select id from stock_alerts where product_id = ${productId} and status = 'ativo' limit 1
  `) as { id: string }[]

  if (existing[0]) {
    await sql`
      update stock_alerts
      set current_qty = ${alert.currentQty}, minimum_qty = ${alert.minimumQty}, suggested_reposition = ${alert.suggestedReposition}
      where id = ${existing[0].id}
    `
  } else {
    await sql`
      insert into stock_alerts (product_id, current_qty, minimum_qty, suggested_reposition)
      values (${productId}, ${alert.currentQty}, ${alert.minimumQty}, ${alert.suggestedReposition})
    `
  }

  return { productId, avecProductId }
}

/** Índice nameKey → avec_product_id para o sync 0046 (1 query, N lookups). */
export async function loadStockProductNameIndex(): Promise<Map<string, string>> {
  const sql = getSql()
  const rows = (await sql`
    select avec_product_id, name from stock_products
    where avec_product_id is not null
  `) as { avec_product_id: string; name: string }[]
  const map = new Map<string, string>()
  for (const row of rows) {
    const key = productNameKey(row.name)
    if (key && !map.has(key)) map.set(key, row.avec_product_id)
  }
  return map
}

/**
 * Quando 0046 (Avec) vem vazio/timeout mas o catálogo 0149 já tem
 * current_qty <= minimum_qty, materializa alertas locais para a fila/Cérebro
 * não ficarem com "alertas ausentes" enquanto o sync Avec falha.
 */
export async function seedLocalStockAlertsFromCatalog(limit = 2000): Promise<number> {
  const sql = getSql()
  const low = (await sql`
    select
      id,
      current_qty::float as current_qty,
      minimum_qty::float as minimum_qty
    from stock_products
    where minimum_qty is not null
      and current_qty <= minimum_qty
      and not exists (
        select 1 from stock_alerts sa
        where sa.product_id = stock_products.id and sa.status = 'ativo'
      )
    order by (minimum_qty - current_qty) desc
    limit ${limit}
  `) as { id: string; current_qty: number; minimum_qty: number }[]

  let inserted = 0
  for (const p of low) {
    const suggested = Math.max(0, Math.ceil(Number(p.minimum_qty) - Number(p.current_qty)))
    await sql`
      insert into stock_alerts (product_id, current_qty, minimum_qty, suggested_reposition)
      values (${p.id}, ${p.current_qty}, ${p.minimum_qty}, ${suggested})
    `
    inserted++
  }
  return inserted
}

/**
 * Resolve (reconhece automaticamente) alertas ativos cujo produto não apareceu
 * mais no relatório 0046 do ciclo atual — significa que voltou a ficar acima
 * do mínimo. Evita alerta "fantasma" ficar ativo pra sempre.
 */
export async function resolveStaleStockAlerts(stillLowAvecProductIds: string[]): Promise<number> {
  const sql = getSql()
  const active = (await sql`
    select sa.id, sp.avec_product_id
    from stock_alerts sa
    join stock_products sp on sp.id = sa.product_id
    where sa.status = 'ativo'
  `) as { id: string; avec_product_id: string | null }[]

  const stillLow = new Set(stillLowAvecProductIds)
  const staleIds = active.filter((a) => !a.avec_product_id || !stillLow.has(a.avec_product_id)).map((a) => a.id)

  for (const id of staleIds) {
    await sql`
      update stock_alerts
      set status = 'reconhecido', acknowledged_at = now(), acknowledged_by = 'system:sync'
      where id = ${id}
    `
  }
  return staleIds.length
}

export async function listAlerts(status?: 'ativo' | 'reconhecido'): Promise<StockAlert[]> {
  const sql = getSql()
  const rows = (await sql`
    select
      sa.id, sa.product_id, sp.name as product_name, sc.name as category_name,
      sa.current_qty::float as current_qty, sa.minimum_qty::float as minimum_qty,
      sa.suggested_reposition::float as suggested_reposition,
      sp.unit_cost::float as unit_cost,
      sa.status, sa.created_at, sa.acknowledged_at, sa.acknowledged_by
    from stock_alerts sa
    join stock_products sp on sp.id = sa.product_id
    left join stock_categories sc on sc.id = sp.category_id
    where (${status ?? null}::text is null or sa.status = ${status ?? null})
    order by sa.status asc, sa.created_at desc
  `) as StockAlert[]
  return rows
}

export async function acknowledgeAlert(id: string, user: string): Promise<void> {
  const sql = getSql()
  await sql`
    update stock_alerts
    set status = 'reconhecido', acknowledged_at = now(), acknowledged_by = ${user}
    where id = ${id} and status = 'ativo'
  `
}

// ---------------------------------------------------------------------------
// Movimentos — histórico (fonte mestra: relatório 0044). Ajuste manual é
// fallback, sempre marcado como tal (nunca confundido com o dado oficial).
// ---------------------------------------------------------------------------

function legacyMovementDedupKey(
  productId: string,
  type: string,
  quantity: number,
  occurredAt: string,
  source: string,
): string {
  return `${productId}|${type}|${quantity}|${occurredAt}|${source}`
}

function movementDedupKey(
  productId: string,
  mv: NormalizedStockMovement,
  occurredAt: string,
  source: string,
): string {
  return mv.dedupKey || legacyMovementDedupKey(productId, mv.type, mv.quantity, occurredAt, source)
}

/** Aplica uma linha de 0044. Dedup por fingerprint Avec, com fallback legado produto+tipo+quantidade+data+origem. */
export async function applyStockMovement(
  mv: NormalizedStockMovement,
  source: 'avec_0044'
): Promise<boolean> {
  const result = await applyStockMovementsBatch([mv], source)
  return result.synced > 0
}

/**
 * Upsert em lote de 0044 — evita N selects por movimento (backfill YTD / sync).
 * Dedup idêntico a `applyStockMovement`.
 */
export async function applyStockMovementsBatch(
  movements: NormalizedStockMovement[],
  source: 'avec_0044' = 'avec_0044',
): Promise<{ synced: number; skipped: number }> {
  const valid = movements.filter((m) => Boolean(m.occurredAt))
  if (valid.length === 0) return { synced: 0, skipped: movements.length }

  const sql = getSql()
  const nameByAvec = new Map<string, string>()
  for (const mv of valid) nameByAvec.set(mv.avecProductId, mv.name)
  const avecIds = [...nameByAvec.keys()]

  type ProductCostRow = {
    id: string
    avec_product_id: string
    unit_cost: number | null
    avg_cost: number | null
  }
  const productByAvec = new Map<string, ProductCostRow>()

  const CHUNK = 400
  for (let i = 0; i < avecIds.length; i += CHUNK) {
    const slice = avecIds.slice(i, i + CHUNK)
    const rows = (await sql`
      select id, avec_product_id,
        unit_cost::float as unit_cost, avg_cost::float as avg_cost
      from stock_products
      where avec_product_id = any(${slice}::text[])
    `) as ProductCostRow[]
    for (const row of rows) productByAvec.set(row.avec_product_id, row)
  }

  const missing = avecIds.filter((id) => !productByAvec.has(id))
  for (let i = 0; i < missing.length; i += CHUNK) {
    const slice = missing.slice(i, i + CHUNK)
    // Inserts individuais — o wrapper Sql do painel não expõe sql(rows, cols) do postgres.js.
    await Promise.all(
      slice.map(async (avec_product_id) => {
        const name = nameByAvec.get(avec_product_id) ?? avec_product_id
        const rows = (await sql`
          insert into stock_products (avec_product_id, name, current_qty)
          values (${avec_product_id}, ${name}, 0)
          on conflict (avec_product_id) do update set name = excluded.name
          returning id, avec_product_id,
            unit_cost::float as unit_cost, avg_cost::float as avg_cost
        `) as ProductCostRow[]
        if (rows[0]) productByAvec.set(rows[0].avec_product_id, rows[0])
      }),
    )
  }

  let minAt = valid[0]!.occurredAt!
  let maxAt = minAt
  for (const mv of valid) {
    const at = mv.occurredAt!
    if (at < minAt) minAt = at
    if (at > maxAt) maxAt = at
  }

  const existingKeys = new Set<string>()
  const existingLegacyKeys = new Set<string>()
  const existingRows = (await sql`
    select product_id, type, quantity::float as quantity, occurred_at, source, created_by
    from stock_movements
    where source = ${source}
      and occurred_at >= ${minAt}::timestamptz
      and occurred_at <= ${maxAt}::timestamptz
  `) as {
    product_id: string
    type: string
    quantity: number
    occurred_at: string
    source: string
    created_by: string | null
  }[]
  for (const row of existingRows) {
    if (row.created_by) {
      existingKeys.add(row.created_by)
      continue
    }
    const at = new Date(row.occurred_at).toISOString()
    const legacyKey = legacyMovementDedupKey(row.product_id, row.type, Number(row.quantity), at, row.source)
    existingKeys.add(legacyKey)
    existingLegacyKeys.add(legacyKey)
  }

  type InsertRow = {
    product_id: string
    type: string
    quantity: number
    cost: number | null
    reason: string | null
    source: string
    occurred_at: string
    created_by: string | null
  }
  const toInsert: InsertRow[] = []
  let skipped = movements.length - valid.length

  for (const mv of valid) {
    const product = productByAvec.get(mv.avecProductId)
    if (!product) {
      skipped += 1
      continue
    }
    const occurredAt = new Date(mv.occurredAt!).toISOString()
    const key = movementDedupKey(product.id, mv, occurredAt, source)
    const legacyKey = legacyMovementDedupKey(product.id, mv.type, mv.quantity, occurredAt, source)
    if (existingKeys.has(key) || existingLegacyKeys.has(legacyKey)) {
      skipped += 1
      continue
    }

    let cost = mv.cost
    if (cost == null || !(cost > 0)) {
      const unit = product.unit_cost ?? product.avg_cost ?? null
      if (unit != null && unit > 0) {
        cost = Math.round(mv.quantity * unit * 100) / 100
      }
    }

    existingKeys.add(key)
    toInsert.push({
      product_id: product.id,
      type: mv.type,
      quantity: mv.quantity,
      cost,
      reason: mv.reason,
      source,
      occurred_at: occurredAt,
      created_by: mv.dedupKey || null,
    })
  }

  let synced = 0
  for (let i = 0; i < toInsert.length; i += CHUNK) {
    const slice = toInsert.slice(i, i + CHUNK)
    const productIds = slice.map((r) => r.product_id)
    const types = slice.map((r) => r.type)
    const quantities = slice.map((r) => r.quantity)
    const costs = slice.map((r) => r.cost)
    const reasons = slice.map((r) => r.reason)
    const sources = slice.map((r) => r.source)
    const occurredAts = slice.map((r) => r.occurred_at)
    const createdBys = slice.map((r) => r.created_by)
    await sql`
      insert into stock_movements (product_id, type, quantity, cost, reason, source, occurred_at, created_by)
      select *
      from unnest(
        ${productIds}::uuid[],
        ${types}::text[],
        ${quantities}::float8[],
        ${costs}::float8[],
        ${reasons}::text[],
        ${sources}::text[],
        ${occurredAts}::timestamptz[],
        ${createdBys}::text[]
      ) as t(product_id, type, quantity, cost, reason, source, occurred_at, created_by)
    `
    synced += slice.length
  }

  return { synced, skipped }
}

/**
 * 0323 não vira movimento próprio (já está contido em 0044 — inserir os dois
 * duplicaria a entrada). Só enriquece o motivo do movimento já existente com
 * a origem "pedido de compra", quando a Avec não mandou motivo específico.
 */
export async function enrichMovementWithPurchaseOrigin(purchase: NormalizedStockPurchase): Promise<boolean> {
  if (!purchase.occurredAt) return false
  const sql = getSql()
  const productRows = (await sql`
    select id from stock_products where avec_product_id = ${purchase.avecProductId} limit 1
  `) as { id: string }[]
  const productId = productRows[0]?.id
  if (!productId) return false

  const day = purchase.occurredAt.slice(0, 10)
  const rows = (await sql`
    update stock_movements
    set reason = coalesce(nullif(reason, ''), 'Pedido de compra')
    where product_id = ${productId} and type = 'entrada' and quantity = ${purchase.quantity}
      and source = 'avec_0044' and occurred_at::date = ${day}::date
    returning id
  `) as { id: string }[]
  return rows.length > 0
}

export interface ListMovementsFilter {
  productId?: string
  from?: string
  to?: string
}

export async function listMovements(filter: ListMovementsFilter = {}): Promise<StockMovement[]> {
  const sql = getSql()
  const rows = (await sql`
    select
      sm.id, sm.product_id, sp.name as product_name, sm.type,
      sm.quantity::float as quantity, sm.cost::float as cost, sm.reason, sm.source,
      sm.occurred_at, sm.created_by
    from stock_movements sm
    join stock_products sp on sp.id = sm.product_id
    where (${filter.productId ?? null}::uuid is null or sm.product_id = ${filter.productId ?? null}::uuid)
      and (${filter.from ?? null}::date is null or sm.occurred_at >= ${filter.from ?? null}::date)
      and (${filter.to ?? null}::date is null or sm.occurred_at < (${filter.to ?? null}::date + 1))
    order by sm.occurred_at desc
    limit 500
  `) as StockMovement[]
  return rows
}

export interface CreateManualMovementInput {
  productId: string
  type: 'entrada' | 'saida' | 'ajuste_manual'
  quantity: number
  reason: string
  createdBy: string
}

/**
 * Ajuste manual (fallback quando a Avec não tem o dado, ex: contagem física).
 * Insere o movimento e atualiza current_qty na mesma transação HTTP —
 * evita estoque desalinhado por falha parcial.
 */
export async function createManualMovement(input: CreateManualMovementInput): Promise<StockMovement> {
  if (!(input.quantity > 0)) throw new Error('Quantidade precisa ser maior que zero')
  if (!input.reason.trim()) throw new Error('Motivo é obrigatório para ajuste manual')

  const sql = getSql()
  const delta = input.type === 'saida' ? -input.quantity : input.quantity

  const movement = await sql.begin(async (txn) => {
    const movementRows = (await txn`
      insert into stock_movements (product_id, type, quantity, reason, source, occurred_at, created_by)
      values (${input.productId}, ${input.type}, ${input.quantity}, ${input.reason.trim()}, 'manual', now(), ${input.createdBy})
      returning id, product_id, type, quantity::float as quantity, cost::float as cost, reason, source, occurred_at, created_by
    `) as {
      id: string
      product_id: string
      type: 'entrada' | 'saida' | 'ajuste_manual'
      quantity: number
      cost: number | null
      reason: string | null
      source: string
      occurred_at: string
      created_by: string | null
    }[]

    await txn`
      update stock_products
      set current_qty = greatest(current_qty + ${delta}, 0), updated_at = now()
      where id = ${input.productId}
    `

    return movementRows[0]!
  })

  const product = await getProduct(input.productId)
  return { ...movement, product_name: product?.name ?? '—' }
}

// ---------------------------------------------------------------------------
// KPIs — valor total computado localmente + total oficial da Avec (0045) como
// checagem cruzada (drift). Categoria/marca vêm do snapshot bruto mais recente
// (reaproveita avec_report_snapshots — sem tabela nova de valorização).
// ---------------------------------------------------------------------------

export interface StockValuationBucket {
  key: string
  totalCost: number
  percentage: number | null
}

async function getStockValuationSnapshot(reportId: string): Promise<StockValuationBucket[]> {
  const snapshot = await getLatestSnapshot(reportId)
  if (!snapshot || !Array.isArray(snapshot.payload)) return []
  const out: StockValuationBucket[] = []
  for (const row of snapshot.payload as Record<string, unknown>[]) {
    const v = normalizeStockValuationRow(row)
    if (v) out.push({ key: v.key, totalCost: v.totalCost, percentage: v.percentage })
  }
  return out
}

export interface StockMovementSummary {
  entradas: number
  saidas: number
}

export interface StockKpis {
  total_products: number
  total_value: number
  active_alerts: number
  /** Produtos com saldo 0 — filtro local sobre posição Avec (0149). */
  zero_products: number
  /** Agregação local das movimentações Avec (0044), fuso America/Sao_Paulo. */
  movements_today: StockMovementSummary
  movements_week: StockMovementSummary
  by_category: StockValuationBucket[]
  by_brand: StockValuationBucket[]
  /**
   * Categorias com % oficial Avec 0142 (janela ~30d).
   * Preferir em Relatórios quando preenchido; 0243 continua em by_category.
   */
  by_category_period: StockValuationBucket[]
  avec_official_total: number | null
  /** Diferença entre o valor computado localmente e o total oficial da Avec (0045) — auditoria/drift. */
  drift: number | null
  last_synced_at: string | null
}

export async function computeStockKpis(): Promise<StockKpis> {
  const sql = getSql()
  // Janela SP em timestamptz — usa índice em occurred_at (evita full scan com AT TIME ZONE).
  const [totals, alerts, movementBuckets, byCategory, byBrand, officialTotalBuckets, byCategoryPeriod] =
    await Promise.all([
      sql`
        select
          count(*)::int as total_products,
          count(*) filter (where current_qty <= 0)::int as zero_products,
          coalesce(sum(greatest(current_qty, 0) * coalesce(unit_cost, 0)), 0)::float as total_value,
          max(last_synced_at) as last_synced_at
        from stock_products
      ` as Promise<
        {
          total_products: number
          zero_products: number
          total_value: number
          last_synced_at: string | null
        }[]
      >,
      sql`
        select count(*)::int as active_alerts from stock_alerts where status = 'ativo'
      ` as Promise<{ active_alerts: number }[]>,
      sql`
        select
          coalesce(sum(quantity) filter (
            where type = 'entrada'
              and occurred_at >= (date_trunc('day', now() at time zone 'America/Sao_Paulo')
                at time zone 'America/Sao_Paulo')
              and occurred_at < (date_trunc('day', now() at time zone 'America/Sao_Paulo')
                at time zone 'America/Sao_Paulo') + interval '1 day'
          ), 0)::float as today_in,
          coalesce(sum(quantity) filter (
            where type = 'saida'
              and occurred_at >= (date_trunc('day', now() at time zone 'America/Sao_Paulo')
                at time zone 'America/Sao_Paulo')
              and occurred_at < (date_trunc('day', now() at time zone 'America/Sao_Paulo')
                at time zone 'America/Sao_Paulo') + interval '1 day'
          ), 0)::float as today_out,
          coalesce(sum(quantity) filter (
            where type = 'entrada'
              and occurred_at >= (date_trunc('day', now() at time zone 'America/Sao_Paulo')
                at time zone 'America/Sao_Paulo') - interval '6 days'
          ), 0)::float as week_in,
          coalesce(sum(quantity) filter (
            where type = 'saida'
              and occurred_at >= (date_trunc('day', now() at time zone 'America/Sao_Paulo')
                at time zone 'America/Sao_Paulo') - interval '6 days'
          ), 0)::float as week_out
        from stock_movements
        where source = 'avec_0044'
          and occurred_at >= (date_trunc('day', now() at time zone 'America/Sao_Paulo')
            at time zone 'America/Sao_Paulo') - interval '6 days'
      ` as Promise<
        {
          today_in: number
          today_out: number
          week_in: number
          week_out: number
        }[]
      >,
      getStockValuationSnapshot('0243'),
      getStockValuationSnapshot('0242'),
      getStockValuationSnapshot('0045'),
      getStockValuationSnapshot('0142'),
    ])

  const officialTotal = officialTotalBuckets.length > 0
    ? officialTotalBuckets.reduce((sum, b) => sum + b.totalCost, 0)
    : null

  const localTotal = totals[0]?.total_value ?? 0
  const drift = officialTotal != null ? Math.round((localTotal - officialTotal) * 100) / 100 : null
  const mov = movementBuckets[0]

  return {
    total_products: totals[0]?.total_products ?? 0,
    total_value: Math.round(localTotal * 100) / 100,
    active_alerts: alerts[0]?.active_alerts ?? 0,
    zero_products: totals[0]?.zero_products ?? 0,
    movements_today: {
      entradas: mov?.today_in ?? 0,
      saidas: mov?.today_out ?? 0,
    },
    movements_week: {
      entradas: mov?.week_in ?? 0,
      saidas: mov?.week_out ?? 0,
    },
    by_category: byCategory,
    by_brand: byBrand,
    by_category_period: byCategoryPeriod,
    avec_official_total: officialTotal != null ? Math.round(officialTotal * 100) / 100 : null,
    drift,
    last_synced_at: totals[0]?.last_synced_at ?? null,
  }
}
