import { getSql } from '@/lib/db'
import { getLatestSnapshot } from '@/lib/avec/snapshots'
import { normalizeStockValuationRow } from '@/lib/avec/normalize'
import type {
  NormalizedStockPosition,
  NormalizedStockAlert,
  NormalizedStockMovement,
  NormalizedStockPurchase,
} from '@/lib/avec/normalize'

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
}

export async function listProducts(filter: ListProductsFilter = {}): Promise<StockProduct[]> {
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
    where (${filter.categoryId ?? null}::uuid is null or sp.category_id = ${filter.categoryId ?? null}::uuid)
      and (${filter.brandId ?? null}::uuid is null or sp.brand_id = ${filter.brandId ?? null}::uuid)
      and (${filter.locationId ?? null}::uuid is null or sp.location_id = ${filter.locationId ?? null}::uuid)
      and (${filter.lowStockOnly ?? false} = false or sp.minimum_qty is not null and sp.current_qty <= sp.minimum_qty)
    order by sp.name asc
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
      unit_cost, unit_price, current_qty, last_synced_at
    )
    values (
      ${pos.avecProductId}, ${pos.sku}, ${pos.name}, ${categoryId}, ${brandId}, ${locationId},
      ${pos.unitCost}, ${pos.unitPrice}, ${pos.quantity}, now()
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
      last_synced_at = excluded.last_synced_at,
      updated_at = now()
    returning id
  `) as { id: string }[]

  return { productId: rows[0]!.id, previousQty }
}

async function ensureProductExists(avecProductId: string, name: string): Promise<string> {
  const sql = getSql()
  const existing = (await sql`
    select id from stock_products where avec_product_id = ${avecProductId} limit 1
  `) as { id: string }[]
  if (existing[0]) return existing[0].id
  const rows = (await sql`
    insert into stock_products (avec_product_id, name, current_qty)
    values (${avecProductId}, ${name}, 0)
    on conflict (avec_product_id) do update set name = excluded.name
    returning id
  `) as { id: string }[]
  return rows[0]!.id
}

// ---------------------------------------------------------------------------
// Alertas — vindos do relatório 0046 (a Avec já calcula a sugestão de reposição).
// ---------------------------------------------------------------------------

/** Aplica uma linha de 0046: garante o produto, atualiza mínimo/sugestão e abre/atualiza alerta ativo. */
export async function applyStockAlert(alert: NormalizedStockAlert): Promise<string> {
  const sql = getSql()
  const categoryId = await upsertCategoryByName(alert.categoryName)

  const rows = (await sql`
    insert into stock_products (avec_product_id, name, category_id, current_qty, minimum_qty, suggested_reposition, last_synced_at)
    values (${alert.avecProductId}, ${alert.name}, ${categoryId}, ${alert.currentQty}, ${alert.minimumQty}, ${alert.suggestedReposition}, now())
    on conflict (avec_product_id) do update set
      name = excluded.name,
      category_id = coalesce(stock_products.category_id, excluded.category_id),
      current_qty = excluded.current_qty,
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

  return productId
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

/** Aplica uma linha de 0044. Dedup por produto+tipo+quantidade+data+origem (idempotente entre syncs). */
export async function applyStockMovement(
  mv: NormalizedStockMovement,
  source: 'avec_0044'
): Promise<boolean> {
  if (!mv.occurredAt) return false
  const sql = getSql()
  const productId = await ensureProductExists(mv.avecProductId, mv.name)

  const existing = (await sql`
    select id from stock_movements
    where product_id = ${productId} and type = ${mv.type} and quantity = ${mv.quantity}
      and occurred_at = ${mv.occurredAt}::timestamptz and source = ${source}
    limit 1
  `) as { id: string }[]
  if (existing[0]) return false

  await sql`
    insert into stock_movements (product_id, type, quantity, cost, reason, source, occurred_at)
    values (${productId}, ${mv.type}, ${mv.quantity}, ${mv.cost}, ${mv.reason}, ${source}, ${mv.occurredAt}::timestamptz)
  `
  return true
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

  const results = await sql.transaction((txn) => [
    txn`
      insert into stock_movements (product_id, type, quantity, reason, source, occurred_at, created_by)
      values (${input.productId}, ${input.type}, ${input.quantity}, ${input.reason.trim()}, 'manual', now(), ${input.createdBy})
      returning id, product_id, type, quantity::float as quantity, cost::float as cost, reason, source, occurred_at, created_by
    `,
    txn`
      update stock_products
      set current_qty = greatest(current_qty + ${delta}, 0), updated_at = now()
      where id = ${input.productId}
    `,
  ])

  const movementRows = results[0] as {
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
  const movement = movementRows[0]!

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
  const totals = (await sql`
    select
      count(*)::int as total_products,
      count(*) filter (where current_qty <= 0)::int as zero_products,
      coalesce(sum(current_qty * coalesce(unit_cost, 0)), 0)::float as total_value,
      max(last_synced_at) as last_synced_at
    from stock_products
  `) as {
    total_products: number
    zero_products: number
    total_value: number
    last_synced_at: string | null
  }[]

  const alerts = (await sql`
    select count(*)::int as active_alerts from stock_alerts where status = 'ativo'
  `) as { active_alerts: number }[]

  const movementBuckets = (await sql`
    select
      coalesce(sum(quantity) filter (
        where type = 'entrada'
          and (occurred_at at time zone 'America/Sao_Paulo')::date
            = (now() at time zone 'America/Sao_Paulo')::date
      ), 0)::float as today_in,
      coalesce(sum(quantity) filter (
        where type = 'saida'
          and (occurred_at at time zone 'America/Sao_Paulo')::date
            = (now() at time zone 'America/Sao_Paulo')::date
      ), 0)::float as today_out,
      coalesce(sum(quantity) filter (
        where type = 'entrada'
          and (occurred_at at time zone 'America/Sao_Paulo')::date
            >= ((now() at time zone 'America/Sao_Paulo')::date - 6)
      ), 0)::float as week_in,
      coalesce(sum(quantity) filter (
        where type = 'saida'
          and (occurred_at at time zone 'America/Sao_Paulo')::date
            >= ((now() at time zone 'America/Sao_Paulo')::date - 6)
      ), 0)::float as week_out
    from stock_movements
    where source = 'avec_0044'
  `) as {
    today_in: number
    today_out: number
    week_in: number
    week_out: number
  }[]

  const [byCategory, byBrand, officialTotalBuckets, byCategoryPeriod] = await Promise.all([
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
