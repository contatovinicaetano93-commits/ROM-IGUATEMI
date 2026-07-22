'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Plus,
  X,
  PackagePlus,
  PackageMinus,
  RefreshCw,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Search,
} from 'lucide-react'
import { SectionCard, PrimaryButton, InfoBanner, CountBadge } from '../_components/ui'
import { apiFetch } from '@/lib/api-client'
import { formatCurrency } from '@/lib/salon/format'
import {
  alertRepositionCost,
  sortPurchaseQueue,
  purchaseQueueTotalCost,
} from '@/lib/stock-purchase-queue'
import {
  OUTFLOW_REASON_LABEL,
  classifyOutflowReason,
  isPurchaseEntry,
  listPurchaseEntries,
  summarizeOutflowsByReason,
  todayIsoDaySp,
  addIsoDays,
  type OutflowReasonBucket,
} from '@/lib/stock-movement-insights'

interface StockProduct {
  id: string
  name: string
  sku: string | null
  category_id: string | null
  category_name: string | null
  brand_id: string | null
  brand_name: string | null
  current_qty: number
  minimum_qty: number | null
  unit_cost: number | null
}
interface NamedOption {
  id: string
  name: string
}
interface StockMovement {
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
interface StockAlert {
  id: string
  product_id: string
  product_name: string
  category_name: string | null
  current_qty: number
  minimum_qty: number
  suggested_reposition: number | null
  unit_cost: number | null
  status: 'ativo' | 'reconhecido'
}
interface StockMovementSummary {
  entradas: number
  saidas: number
}
interface StockValuationBucket {
  key: string
  totalCost: number
  percentage: number | null
}
interface StockKpis {
  total_products: number
  total_value: number
  active_alerts: number
  zero_products: number
  movements_today: StockMovementSummary
  movements_week: StockMovementSummary
  by_category: StockValuationBucket[]
  by_brand: StockValuationBucket[]
  avec_official_total: number | null
  drift: number | null
  last_synced_at: string | null
}
interface SyncRun {
  id: string
  kind: string
  status: 'ok' | 'error' | 'partial'
  created_at: string
  error: string | null
}
interface SyncStatus {
  configured: boolean
  stock_auth_configured: boolean
  last_fast: SyncRun | null
  last_full: SyncRun | null
}

function timeAgo(iso: string | null): string {
  if (!iso) return 'nunca'
  const diffMs = Date.now() - new Date(iso).getTime()
  const min = Math.round(diffMs / 60000)
  if (min < 1) return 'agora mesmo'
  if (min < 60) return `há ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `há ${h}h`
  return `há ${Math.round(h / 24)}d`
}

function SyncBadge({ status }: { status: SyncStatus | null }) {
  if (!status) return null
  if (!status.stock_auth_configured) {
    return <CountBadge value="Login do estoque não configurado" tone="danger" />
  }
  const run = status.last_fast
  if (!run) return <CountBadge value="Ainda não sincronizado" tone="danger" />
  if (run.status === 'error') return <CountBadge value={`Falhou ${timeAgo(run.created_at)}`} tone="danger" />
  return <CountBadge value={`Sincronizado ${timeAgo(run.created_at)}`} tone={run.status === 'partial' ? 'gold' : 'success'} />
}

function StockKpiCard({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'warning' | 'success' }) {
  const subTone = tone === 'warning' ? 'text-warning' : tone === 'success' ? 'text-success' : 'text-muted'
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-[0.65rem] uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
      {sub && <p className={`mt-1 text-xs font-medium ${subTone}`}>{sub}</p>}
    </div>
  )
}

/** Total oficial da Avec (0045) + drift vs. valor computado localmente. */
function valueCardSub(kpis: StockKpis | null): { sub?: string; tone?: 'warning' | 'success' } {
  if (!kpis || kpis.avec_official_total == null) return {}
  const officialLabel = `Avec: ${formatCurrency(kpis.avec_official_total)}`
  if (kpis.drift != null && Math.abs(kpis.drift) > 50) {
    return { sub: `${officialLabel} · diferença de ${formatCurrency(Math.abs(kpis.drift))}`, tone: 'warning' }
  }
  return { sub: `Confere com a Avec (${officialLabel})`, tone: 'success' }
}

/** Barras de valorização (categoria/marca) — usa a % oficial da Avec quando existe, senão a fração do total. */
function ValuationBars({ buckets }: { buckets: StockValuationBucket[] }) {
  const total = buckets.reduce((sum, b) => sum + b.totalCost, 0)
  return (
    <div className="flex flex-col gap-2.5">
      {buckets.map((b) => {
        const pct = b.percentage ?? (total > 0 ? (b.totalCost / total) * 100 : 0)
        return (
          <div key={b.key} className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">{b.key}</span>
              <span className="tabular-nums text-muted">
                {formatCurrency(b.totalCost)} · {pct.toFixed(1)}%
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface">
              <div className="h-full rounded-full bg-gold" style={{ width: `${Math.min(pct, 100)}%` }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function formatQty(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

type CatalogStockFilter = 'all' | 'zero' | 'low'

export default function EstoquePage() {
  const [products, setProducts] = useState<StockProduct[]>([])
  const [categories, setCategories] = useState<NamedOption[]>([])
  const [brands, setBrands] = useState<NamedOption[]>([])
  const [movements, setMovements] = useState<StockMovement[]>([])
  const [alerts, setAlerts] = useState<StockAlert[]>([])
  const [kpis, setKpis] = useState<StockKpis | null>(null)
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [showBrands, setShowBrands] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [catalogQuery, setCatalogQuery] = useState('')
  const [catalogCategoryId, setCatalogCategoryId] = useState('')
  const [catalogBrandId, setCatalogBrandId] = useState('')
  const [catalogStockFilter, setCatalogStockFilter] = useState<CatalogStockFilter>('all')
  const [outflowWindow, setOutflowWindow] = useState<'hoje' | 'semana'>('semana')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [kpisRes, alertsRes, movRes, prodRes, statusRes, catRes, brandRes] = await Promise.all([
        apiFetch('/api/estoque/kpis', { cache: 'no-store' }),
        apiFetch('/api/estoque/alertas?status=ativo', { cache: 'no-store' }),
        apiFetch('/api/estoque/movimentos', { cache: 'no-store' }),
        apiFetch('/api/estoque/produtos', { cache: 'no-store' }),
        apiFetch('/api/estoque/sync/status', { cache: 'no-store' }),
        apiFetch('/api/estoque/categorias', { cache: 'no-store' }),
        apiFetch('/api/estoque/marcas', { cache: 'no-store' }),
      ])
      const [kpisJson, alertsJson, movJson, prodJson, statusJson, catJson, brandJson] =
        await Promise.all([
          kpisRes.json(),
          alertsRes.json(),
          movRes.json(),
          prodRes.json(),
          statusRes.json(),
          catRes.json(),
          brandRes.json(),
        ])
      if (kpisJson.error) throw new Error(kpisJson.error)
      setKpis(kpisJson.data)
      setAlerts(alertsJson.data ?? [])
      setMovements(movJson.data ?? [])
      setProducts(prodJson.data ?? [])
      setSyncStatus(statusJson.data ?? null)
      setCategories(catJson.data ?? [])
      setBrands(brandJson.data ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const interval = setInterval(load, 60_000)
    return () => clearInterval(interval)
  }, [load])

  const purchaseQueue = useMemo(() => sortPurchaseQueue(alerts), [alerts])
  const queueTotalCost = useMemo(() => purchaseQueueTotalCost(purchaseQueue), [purchaseQueue])

  const catalogProducts = useMemo(() => {
    const q = catalogQuery.trim().toLowerCase()
    return products.filter((p) => {
      if (catalogCategoryId && p.category_id !== catalogCategoryId) return false
      if (catalogBrandId && p.brand_id !== catalogBrandId) return false
      if (catalogStockFilter === 'zero' && !(p.current_qty <= 0)) return false
      if (
        catalogStockFilter === 'low' &&
        !(p.minimum_qty != null && p.current_qty <= p.minimum_qty)
      ) {
        return false
      }
      if (!q) return true
      const hay = `${p.name} ${p.sku ?? ''} ${p.category_name ?? ''} ${p.brand_name ?? ''}`.toLowerCase()
      return hay.includes(q)
    })
  }, [products, catalogQuery, catalogCategoryId, catalogBrandId, catalogStockFilter])

  const outflowRange = useMemo(() => {
    const today = todayIsoDaySp()
    if (outflowWindow === 'hoje') return { from: today, to: today }
    return { from: addIsoDays(today, -6), to: today }
  }, [outflowWindow])

  const outflowSummary = useMemo(
    () => summarizeOutflowsByReason(movements, outflowRange.from, outflowRange.to),
    [movements, outflowRange],
  )

  const purchaseEntries = useMemo(() => listPurchaseEntries(movements, 15), [movements])

  async function acknowledge(id: string) {
    await apiFetch(`/api/estoque/alertas/${id}`, { method: 'PATCH' })
    load()
  }

  async function triggerSync() {
    setSyncing(true)
    try {
      await apiFetch('/api/estoque/sync?mode=full', { method: 'POST' })
    } finally {
      setSyncing(false)
      load()
    }
  }

  const notOnboarded =
    !loading && syncStatus && (!syncStatus.stock_auth_configured || !syncStatus.last_fast)

  return (
    <main className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-6 px-5 py-6 lg:px-8 lg:py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[0.65rem] uppercase tracking-[0.25em] text-gold">Estoque</p>
          <h1 className="mt-1 text-xl font-semibold lg:text-2xl">Visão geral</h1>
          <p className="mt-1 text-xs text-muted">
            O que temos, o que falta e o que moveu. Caixa/CMV fica no Financeiro.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <SyncBadge status={syncStatus} />
          <button
            type="button"
            onClick={triggerSync}
            disabled={syncing}
            className="flex items-center gap-1.5 rounded-full border border-border px-3 py-2 text-xs font-medium text-foreground/90 transition-colors hover:bg-card disabled:opacity-50"
          >
            <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />{' '}
            {syncing ? 'Sincronizando…' : 'Sincronizar agora'}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-border bg-card px-4 py-3 text-sm text-muted">
          Não foi possível carregar ({error}). Confirme se o banco está configurado.
        </div>
      )}

      {notOnboarded && !syncStatus?.stock_auth_configured && (
        <InfoBanner
          title="Login do estoque ainda não configurado"
          text="Defina ROM_STOCK_USER e ROM_STOCK_PASSWORD nas variáveis de ambiente para liberar o acesso isolado ao painel de estoque."
        />
      )}
      {notOnboarded && syncStatus?.stock_auth_configured && (
        <InfoBanner
          title="Ainda sem sincronização com a Avec"
          text="Clique em 'Sincronizar agora' para trazer o saldo, alertas de reposição e histórico direto da Avec (fonte da verdade do estoque)."
        />
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StockKpiCard label="Produtos" value={loading || !kpis ? '—' : String(kpis.total_products)} />
        <StockKpiCard
          label="Valor em estoque"
          value={loading || !kpis ? '—' : formatCurrency(kpis.total_value)}
          {...(loading ? {} : valueCardSub(kpis))}
        />
        <StockKpiCard
          label="Fila de compra"
          value={loading ? '—' : String(purchaseQueue.length)}
          sub={
            !loading && purchaseQueue.length > 0
              ? `≈ ${formatCurrency(queueTotalCost)} para repor`
              : undefined
          }
          tone={!loading && purchaseQueue.length > 0 ? 'warning' : undefined}
        />
        <StockKpiCard
          label="Zerados"
          value={loading || !kpis ? '—' : String(kpis.zero_products)}
          sub={kpis && kpis.zero_products > 0 ? 'Sem saldo (posição Avec)' : undefined}
          tone={kpis && kpis.zero_products > 0 ? 'warning' : undefined}
        />
      </div>

      {!loading && kpis && (
        <p className="text-xs text-muted">
          Movimentação Avec · hoje{' '}
          <span className="tabular-nums text-success">+{formatQty(kpis.movements_today.entradas)}</span>
          {' / '}
          <span className="tabular-nums text-danger">−{formatQty(kpis.movements_today.saidas)}</span>
          {' · semana '}
          <span className="tabular-nums text-success">+{formatQty(kpis.movements_week.entradas)}</span>
          {' / '}
          <span className="tabular-nums text-danger">−{formatQty(kpis.movements_week.saidas)}</span>
        </p>
      )}

      <SectionCard
        title="Fila de compra"
        badge={
          <CountBadge
            value={String(purchaseQueue.length)}
            tone={purchaseQueue.length > 0 ? 'danger' : 'success'}
          />
        }
      >
        <p className="mb-3 text-xs text-muted">
          Avec 0046 · ordenada por urgência × custo estimado. Total sugerido:{' '}
          <span className="font-medium text-foreground/90">
            {loading ? '—' : formatCurrency(queueTotalCost)}
          </span>
        </p>
        {loading && <div className="h-16 animate-pulse rounded-2xl bg-surface" />}
        {!loading && purchaseQueue.length === 0 && (
          <p className="text-xs text-muted">Nenhum produto abaixo do estoque mínimo.</p>
        )}
        {!loading && purchaseQueue.length > 0 && (
          <div className="flex flex-col gap-2.5">
            {purchaseQueue.map((a, index) => {
              const cost = alertRepositionCost(a)
              const deficit = Math.max(0, a.minimum_qty - a.current_qty)
              return (
                <div
                  key={a.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      <span className="mr-2 tabular-nums text-muted">{index + 1}.</span>
                      {a.product_name}
                      {a.current_qty <= 0 && (
                        <span className="ml-2 rounded-full bg-danger/15 px-1.5 py-0.5 text-[0.6rem] font-semibold text-danger">
                          Zerado
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-muted">
                      {a.category_name ?? 'Sem categoria'} · atual {formatQty(a.current_qty)} / mín.{' '}
                      {formatQty(a.minimum_qty)}
                      {deficit > 0 && ` · falta ${formatQty(deficit)}`}
                      {a.suggested_reposition != null &&
                        ` · repor ${formatQty(a.suggested_reposition)} (Avec)`}
                      {cost != null && ` · ≈ ${formatCurrency(cost)}`}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => acknowledge(a.id)}
                    className="flex shrink-0 items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground/90 hover:bg-card"
                  >
                    <CheckCircle2 size={14} /> Reconhecer
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Catálogo"
        badge={<CountBadge value={`${catalogProducts.length}/${products.length}`} />}
      >
        <p className="mb-3 text-xs text-muted">Posição Avec 0149 — busca e filtros locais.</p>
        <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <label className="relative flex items-center sm:col-span-2 lg:col-span-2">
            <Search size={14} className="pointer-events-none absolute left-3 text-muted" />
            <input
              value={catalogQuery}
              onChange={(e) => setCatalogQuery(e.target.value)}
              placeholder="Buscar nome, SKU, marca…"
              className="w-full rounded-xl border border-border bg-surface py-2.5 pl-9 pr-3 text-sm outline-none focus:border-gold"
            />
          </label>
          <select
            value={catalogCategoryId}
            onChange={(e) => setCatalogCategoryId(e.target.value)}
            className="rounded-xl border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-gold"
          >
            <option value="">Todas as categorias</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            value={catalogBrandId}
            onChange={(e) => setCatalogBrandId(e.target.value)}
            className="rounded-xl border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-gold"
          >
            <option value="">Todas as marcas</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <div className="mb-3 flex flex-wrap gap-2">
          {(
            [
              ['all', 'Todos'],
              ['low', 'Abaixo do mín.'],
              ['zero', 'Zerados'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setCatalogStockFilter(value)}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${
                catalogStockFilter === value
                  ? 'border-gold/40 bg-gold/10 text-gold'
                  : 'border-border text-muted hover:text-foreground'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {loading && <div className="h-16 animate-pulse rounded-2xl bg-surface" />}
        {!loading && catalogProducts.length === 0 && (
          <p className="text-xs text-muted">Nenhum produto com esses filtros.</p>
        )}
        {!loading && catalogProducts.length > 0 && (
          <div className="max-h-96 overflow-y-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-card text-[0.65rem] uppercase tracking-wide text-muted">
                <tr>
                  <th className="py-1.5 font-medium">Produto</th>
                  <th className="py-1.5 font-medium">Saldo</th>
                  <th className="hidden py-1.5 font-medium sm:table-cell">Mín.</th>
                  <th className="py-1.5 font-medium">Custo</th>
                </tr>
              </thead>
              <tbody>
                {catalogProducts.slice(0, 200).map((p) => {
                  const low = p.minimum_qty != null && p.current_qty <= p.minimum_qty
                  return (
                    <tr key={p.id} className="border-t border-border/60">
                      <td className="py-2">
                        <p className="font-medium">{p.name}</p>
                        <p className="text-xs text-muted">
                          {[p.brand_name, p.category_name, p.sku].filter(Boolean).join(' · ') ||
                            '—'}
                        </p>
                      </td>
                      <td
                        className={`py-2 tabular-nums ${
                          p.current_qty <= 0 ? 'text-danger' : low ? 'text-warning' : ''
                        }`}
                      >
                        {formatQty(p.current_qty)}
                      </td>
                      <td className="hidden py-2 tabular-nums text-muted sm:table-cell">
                        {p.minimum_qty != null ? formatQty(p.minimum_qty) : '—'}
                      </td>
                      <td className="py-2 tabular-nums text-muted">
                        {p.unit_cost != null ? formatCurrency(p.unit_cost) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {catalogProducts.length > 200 && (
              <p className="mt-2 text-xs text-muted">
                Mostrando 200 de {catalogProducts.length}. Refine a busca.
              </p>
            )}
          </div>
        )}
      </SectionCard>

      {!loading && kpis && kpis.by_category.length > 0 && (
        <SectionCard title="Valor por categoria">
          <ValuationBars buckets={kpis.by_category} />
        </SectionCard>
      )}

      {!loading && kpis && kpis.by_brand.length > 0 && (
        <SectionCard title="Valor por marca">
          <button
            type="button"
            onClick={() => setShowBrands((v) => !v)}
            className="mb-1 flex items-center gap-1 text-xs font-medium text-muted hover:text-foreground"
          >
            {showBrands ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {showBrands ? 'Ocultar' : `Ver ${kpis.by_brand.length} marcas`}
          </button>
          {showBrands && <ValuationBars buckets={kpis.by_brand} />}
        </SectionCard>
      )}

      <SectionCard title="Saídas por motivo">
        <p className="mb-3 text-xs text-muted">
          Avec 0044 · classifica consumo, perda, venda e outros no período.
        </p>
        <div className="mb-3 flex flex-wrap gap-2">
          {(
            [
              ['hoje', 'Hoje'],
              ['semana', '7 dias'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setOutflowWindow(value)}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${
                outflowWindow === value
                  ? 'border-gold/40 bg-gold/10 text-gold'
                  : 'border-border text-muted hover:text-foreground'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {loading ? (
          <div className="h-16 animate-pulse rounded-2xl bg-surface" />
        ) : (
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            {outflowSummary.map((row) => (
              <div
                key={row.bucket}
                className={`rounded-xl border p-3 ${
                  row.bucket === 'perda' && row.count > 0
                    ? 'border-danger/30 bg-danger/5'
                    : 'border-border bg-surface'
                }`}
              >
                <p className="text-[0.65rem] uppercase tracking-wide text-muted">{row.label}</p>
                <p className="mt-1 text-lg font-semibold tabular-nums">{formatQty(row.quantity)}</p>
                <p className="mt-0.5 text-xs text-muted">
                  {row.count} mov. · {row.cost > 0 ? formatCurrency(row.cost) : 'sem custo'}
                </p>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Entradas por pedido"
        badge={<CountBadge value={String(purchaseEntries.length)} />}
      >
        <p className="mb-3 text-xs text-muted">
          Avec 0323 · entradas enriquecidas como pedido de compra.
        </p>
        {loading && <div className="h-16 animate-pulse rounded-2xl bg-surface" />}
        {!loading && purchaseEntries.length === 0 && (
          <p className="text-xs text-muted">
            Nenhuma entrada marcada como pedido ainda. Rode o sync full para enriquecer com 0323.
          </p>
        )}
        {!loading && purchaseEntries.length > 0 && (
          <ul className="flex flex-col gap-2">
            {purchaseEntries.map((m) => (
              <li
                key={m.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{m.product_name}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    {m.reason ?? 'Pedido de compra'} ·{' '}
                    {new Date(m.occurred_at).toLocaleDateString('pt-BR')}
                    {m.cost != null && ` · ${formatCurrency(m.cost)}`}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-success">
                  +{formatQty(m.quantity)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">Movimentações recentes</h2>
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 rounded-full border border-gold/40 bg-gold/10 px-3 py-1.5 text-xs font-medium text-gold"
        >
          <Plus size={14} /> Ajuste manual
        </button>
      </div>

      {loading &&
        Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-14 animate-pulse rounded-2xl bg-card" />
        ))}

      {!loading && movements.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 p-4 text-sm text-muted">
          Nenhuma movimentação sincronizada ainda.
        </div>
      )}

      {!loading &&
        movements.map((m) => {
          const outflowBucket: OutflowReasonBucket | null =
            m.type === 'saida' ? classifyOutflowReason(m.reason) : null
          const purchase = isPurchaseEntry(m)
          return (
            <div
              key={m.id}
              className="flex items-center justify-between rounded-2xl border border-border bg-card p-4"
            >
              <div className="flex min-w-0 items-center gap-3">
                {m.type === 'saida' ? (
                  <PackageMinus size={18} className="shrink-0 text-danger" />
                ) : (
                  <PackagePlus size={18} className="shrink-0 text-success" />
                )}
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {m.product_name}
                    {purchase && (
                      <span className="ml-2 rounded-full bg-success/15 px-1.5 py-0.5 text-[0.6rem] font-semibold text-success">
                        Pedido
                      </span>
                    )}
                    {outflowBucket && (
                      <span className="ml-2 rounded-full bg-surface px-1.5 py-0.5 text-[0.6rem] font-semibold text-muted">
                        {OUTFLOW_REASON_LABEL[outflowBucket]}
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    {m.reason ?? (m.source === 'manual' ? 'Ajuste manual' : 'Avec')} ·{' '}
                    {new Date(m.occurred_at).toLocaleDateString('pt-BR')}
                    {m.source === 'manual' && ' · correção local'}
                  </p>
                </div>
              </div>
              <span
                className={`shrink-0 text-sm font-semibold tabular-nums ${
                  m.type === 'saida' ? 'text-danger' : 'text-success'
                }`}
              >
                {m.type === 'saida' ? '−' : '+'}
                {m.quantity}
              </span>
            </div>
          )
        })}

      {showAdd && (
        <AddMovementSheet
          products={products}
          onClose={() => setShowAdd(false)}
          onAdded={() => {
            setShowAdd(false)
            load()
          }}
        />
      )}
    </main>
  )
}

function AddMovementSheet({
  products,
  onClose,
  onAdded,
}: {
  products: StockProduct[]
  onClose: () => void
  onAdded: () => void
}) {
  const [productId, setProductId] = useState('')
  const [type, setType] = useState<'entrada' | 'saida' | 'ajuste_manual'>('saida')
  const [quantity, setQuantity] = useState('')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setErr(null)
    try {
      if (!productId) throw new Error('Selecione um produto')
      const qty = Number(quantity.replace(',', '.'))
      if (!(qty > 0)) throw new Error('Quantidade precisa ser maior que zero')
      if (!reason.trim()) throw new Error('Informe o motivo do ajuste')

      const res = await apiFetch('/api/estoque/movimentos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, type, quantity: qty, reason: reason.trim() }),
      })
      const json = await res.json()
      if (!res.ok || json.error) throw new Error(json.error ?? 'Erro ao salvar')
      onAdded()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center lg:items-center lg:p-6" onClick={onClose}>
      <div className="animate-fade-in absolute inset-0 bg-black/60" />
      <div
        className="animate-slide-up relative w-full max-w-md rounded-t-2xl border-t border-border bg-card-elevated p-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] lg:animate-rise lg:max-w-lg lg:rounded-2xl lg:border lg:pb-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border" />
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">Ajuste manual de estoque</h2>
          <button type="button" onClick={onClose} aria-label="Fechar" className="text-muted active:text-foreground">
            <X size={22} />
          </button>
        </div>
        <p className="-mt-2 mb-4 text-xs text-muted">
          Use só quando a Avec não tem o dado (ex: contagem física). O saldo oficial continua vindo da Avec no
          próximo sync.
        </p>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs uppercase tracking-wide text-muted">Produto</span>
            <select
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              required
              className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-base outline-none focus:border-gold"
            >
              <option value="">Selecione…</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} {p.sku ? `(${p.sku})` : ''} — atual {p.current_qty}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs uppercase tracking-wide text-muted">Tipo</span>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as typeof type)}
              className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-base outline-none focus:border-gold"
            >
              <option value="entrada">Entrada</option>
              <option value="saida">Saída</option>
              <option value="ajuste_manual">Ajuste (contagem física)</option>
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs uppercase tracking-wide text-muted">Quantidade</span>
            <input
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              required
              inputMode="decimal"
              placeholder="0"
              className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-base outline-none focus:border-gold"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs uppercase tracking-wide text-muted">Motivo</span>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              placeholder="Ex.: Contagem física, produto danificado…"
              className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-base outline-none focus:border-gold"
            />
          </label>
          {err && <p className="text-sm text-danger">{err}</p>}
          <PrimaryButton type="submit" disabled={submitting}>
            {submitting ? 'Salvando…' : 'Salvar ajuste'}
          </PrimaryButton>
        </form>
      </div>
    </div>
  )
}
