'use client'

import { useCallback, useEffect, useState } from 'react'
import { Plus, X, Trash2, Download, Camera, Paperclip } from 'lucide-react'
import { upload } from '@vercel/blob/client'
import { PrimaryButton } from '../_components/ui'
import { apiFetch } from '@/lib/api-client'
import { formatCurrency, todayIso } from '@/lib/salon/format'

interface FiscalSplitSummary {
  gross_paid: number
  cbs_retained: number
  ibs_retained: number
  net_received: number
  pending_count: number
  settled_count: number
  configured: boolean
}
interface FinanceKpiBucket {
  month: string
  label: string
  from: string
  to: string
  revenue: number
  expenses: number
  gross_margin: number | null
  cash_flow: number
  payment_mix: { method: string; amount: number; share: number }[]
  fiscal_split: FiscalSplitSummary
}
interface FinanceKpis {
  current: FinanceKpiBucket
  previous: FinanceKpiBucket
}
interface FinanceCategory {
  id: string
  name: string
  active: boolean
  created_at: string
}
interface FinanceExpense {
  id: string
  category_id: string | null
  description: string
  amount: number
  expense_date: string
  notes: string | null
  receipt_url: string | null
  created_at: string
}

function fmtDelta(current: number, previous: number, unit: 'currency' | 'pp' = 'currency') {
  const diff = Math.round((current - previous) * 10) / 10
  if (diff === 0) return null
  const sign = diff > 0 ? '+' : ''
  const text = unit === 'currency' ? formatCurrency(Math.abs(diff)) : `${Math.abs(diff)}pp`
  return `${sign}${diff > 0 ? text : `-${text}`}`
}

function FinanceKpiCard({
  label,
  value,
  delta,
  positive,
  loading,
}: {
  label: string
  value: string
  delta: string | null
  positive: boolean | null
  loading: boolean
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-[0.65rem] uppercase tracking-wide text-muted">{label}</p>
      {loading ? (
        <div className="mt-2 h-7 w-20 animate-pulse rounded bg-border" />
      ) : (
        <>
          <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
          {delta && (
            <p
              className={`mt-1 text-xs font-medium ${
                positive == null ? 'text-muted' : positive ? 'text-success' : 'text-warning'
              }`}
            >
              {delta} vs. mês anterior
            </p>
          )}
        </>
      )}
    </div>
  )
}

function currentMonthKey() {
  return todayIso().slice(0, 7)
}

/** YYYY-MM-DD → N dias atrás (calendário, sem fuso UTC). */
function shiftIsoDate(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y!, m! - 1, d! + days)
  const yy = dt.getFullYear()
  const mm = String(dt.getMonth() + 1).padStart(2, '0')
  const dd = String(dt.getDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

function formatExpenseDateLabel(iso: string): string {
  const today = todayIso()
  if (iso === today) return 'Hoje'
  if (iso === shiftIsoDate(today, -1)) return 'Ontem'
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y!, m! - 1, d!)
  const weekday = dt.toLocaleDateString('pt-BR', { weekday: 'short' })
  const day = dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  return `${weekday} ${day}`
}

function recentExpenseDates(count = 30): string[] {
  const today = todayIso()
  return Array.from({ length: count }, (_, i) => shiftIsoDate(today, -i))
}

function csvEscape(v: string | number | null | undefined) {
  const s = v == null ? '' : String(v)
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export default function FinanceiroPage() {
  const [month, setMonth] = useState(currentMonthKey())
  const [compareMonth, setCompareMonth] = useState('')
  const [kpis, setKpis] = useState<FinanceKpis | null>(null)
  const [categories, setCategories] = useState<FinanceCategory[]>([])
  const [expenses, setExpenses] = useState<FinanceExpense[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const kpisParams = new URLSearchParams({ month, ...(compareMonth ? { compare: compareMonth } : {}) })
      const [kpisRes, catRes, expRes] = await Promise.all([
        apiFetch(`/api/financeiro/kpis?${kpisParams}`, { cache: 'no-store' }),
        apiFetch('/api/financeiro/categorias', { cache: 'no-store' }),
        apiFetch(`/api/financeiro/despesas?month=${month}`, { cache: 'no-store' }),
      ])
      const [kpisJson, catJson, expJson] = await Promise.all([kpisRes.json(), catRes.json(), expRes.json()])
      if (kpisJson.error) throw new Error(kpisJson.error)
      setKpis(kpisJson.data)
      setCategories(catJson.data ?? [])
      setExpenses(expJson.data?.expenses ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [month, compareMonth])

  useEffect(() => {
    load()
  }, [load])

  function downloadReport() {
    if (!kpis) return
    const lines = [
      ['Métrica', kpis.current.label, kpis.previous.label].map(csvEscape).join(';'),
      ['Receita', kpis.current.revenue, kpis.previous.revenue].map(csvEscape).join(';'),
      ['Despesas', kpis.current.expenses, kpis.previous.expenses].map(csvEscape).join(';'),
      ['Margem bruta (%)', kpis.current.gross_margin ?? '', kpis.previous.gross_margin ?? ''].map(csvEscape).join(';'),
      ['Fluxo (receita - despesas)', kpis.current.cash_flow, kpis.previous.cash_flow].map(csvEscape).join(';'),
      '',
      ['Formas de pagamento — ' + kpis.current.label].map(csvEscape).join(';'),
      ['Método', 'Valor', '% do total'].map(csvEscape).join(';'),
      ...kpis.current.payment_mix.map((p) => [p.method, p.amount, p.share].map(csvEscape).join(';')),
      '',
      ['Despesas de ' + kpis.current.label].map(csvEscape).join(';'),
      ['Data', 'Descrição', 'Categoria', 'Valor'].map(csvEscape).join(';'),
      ...expenses.map((e) =>
        [e.expense_date, e.description, categoryName(e.category_id), e.amount].map(csvEscape).join(';')
      ),
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `financeiro_${kpis.current.month}_vs_${kpis.previous.month}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function removeExpense(id: string) {
    if (!confirm('Excluir essa despesa?')) return
    await apiFetch(`/api/financeiro/despesas/${id}`, { method: 'DELETE' })
    load()
  }

  function categoryName(id: string | null) {
    return categories.find((c) => c.id === id)?.name ?? 'Sem categoria'
  }

  const noRevenueYet = Boolean(kpis && kpis.current.revenue === 0)

  return (
    <main className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-6 px-5 py-6 lg:px-8 lg:py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[0.65rem] uppercase tracking-[0.25em] text-gold">Financeiro</p>
          <h1 className="mt-1 text-xl font-semibold lg:text-2xl">{kpis ? kpis.current.label : 'Este mês'}</h1>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[0.65rem] uppercase tracking-wide text-muted">Mês</span>
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-gold"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[0.65rem] uppercase tracking-wide text-muted">Comparar com</span>
            <input
              type="month"
              value={compareMonth}
              onChange={(e) => setCompareMonth(e.target.value)}
              placeholder="Automático"
              className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-gold"
            />
          </label>
          <button
            type="button"
            onClick={downloadReport}
            disabled={!kpis}
            className="flex items-center gap-1.5 rounded-full border border-border px-3 py-2 text-xs font-medium text-foreground/90 transition-colors hover:bg-card disabled:opacity-50"
          >
            <Download size={14} /> Relatório (CSV)
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-border bg-card px-4 py-3 text-sm text-muted">
          Não foi possível carregar ({error}). Confirme se o banco está configurado.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <FinanceKpiCard
          label="Receita"
          value={loading || !kpis ? '—' : formatCurrency(kpis.current.revenue)}
          delta={kpis ? fmtDelta(kpis.current.revenue, kpis.previous.revenue) : null}
          positive={kpis ? kpis.current.revenue >= kpis.previous.revenue : null}
          loading={loading}
        />
        <FinanceKpiCard
          label="Despesas"
          value={loading || !kpis ? '—' : formatCurrency(kpis.current.expenses)}
          delta={kpis ? fmtDelta(kpis.current.expenses, kpis.previous.expenses) : null}
          positive={kpis ? kpis.current.expenses <= kpis.previous.expenses : null}
          loading={loading}
        />
        <FinanceKpiCard
          label="Margem bruta"
          value={loading || !kpis ? '—' : kpis.current.gross_margin != null ? `${kpis.current.gross_margin}%` : '—'}
          delta={
            kpis && kpis.current.gross_margin != null && kpis.previous.gross_margin != null
              ? fmtDelta(kpis.current.gross_margin, kpis.previous.gross_margin, 'pp')
              : null
          }
          positive={
            kpis && kpis.current.gross_margin != null && kpis.previous.gross_margin != null
              ? kpis.current.gross_margin >= kpis.previous.gross_margin
              : null
          }
          loading={loading}
        />
        <FinanceKpiCard
          label="Fluxo (receita − despesas)"
          value={loading || !kpis ? '—' : formatCurrency(kpis.current.cash_flow)}
          delta={kpis ? fmtDelta(kpis.current.cash_flow, kpis.previous.cash_flow) : null}
          positive={kpis ? kpis.current.cash_flow >= kpis.previous.cash_flow : null}
          loading={loading}
        />
      </div>

      {!loading && noRevenueYet && (
        <p className="-mt-3 text-xs text-muted">
          Margem bruta e fluxo dependem do faturamento sincronizado pela Avec — ainda sem dado esse mês.
        </p>
      )}

      {!loading && kpis && (
        <div className="rounded-2xl border border-border bg-card p-4">
          <h2 className="text-sm font-medium">Split fiscal — {kpis.current.label}</h2>
          <p className="mt-0.5 text-xs text-muted">
            CBS/IBS retidos na liquidação (Plataforma Pública / export do PSP). O ROM só reconcilia — não processa pagamento.
          </p>
          {kpis.current.fiscal_split.settled_count === 0 && kpis.current.fiscal_split.pending_count === 0 ? (
            <p className="mt-3 text-xs text-muted">
              {kpis.current.fiscal_split.configured
                ? 'Sem settlements fiscais importados nesse mês.'
                : 'Pendente de conciliação fiscal — configure FISCAL_SPLIT_API_URL ou importe settlements.'}
            </p>
          ) : (
            <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <div>
                <p className="text-[0.65rem] uppercase tracking-wide text-muted">Bruto liquidado</p>
                <p className="mt-1 text-sm font-semibold tabular-nums">
                  {formatCurrency(kpis.current.fiscal_split.gross_paid)}
                </p>
              </div>
              <div>
                <p className="text-[0.65rem] uppercase tracking-wide text-muted">CBS retida</p>
                <p className="mt-1 text-sm font-semibold tabular-nums">
                  {formatCurrency(kpis.current.fiscal_split.cbs_retained)}
                </p>
              </div>
              <div>
                <p className="text-[0.65rem] uppercase tracking-wide text-muted">IBS retido</p>
                <p className="mt-1 text-sm font-semibold tabular-nums">
                  {formatCurrency(kpis.current.fiscal_split.ibs_retained)}
                </p>
              </div>
              <div>
                <p className="text-[0.65rem] uppercase tracking-wide text-muted">Líquido estimado</p>
                <p className="mt-1 text-sm font-semibold tabular-nums">
                  {formatCurrency(kpis.current.fiscal_split.net_received)}
                </p>
                {kpis.current.fiscal_split.pending_count > 0 && (
                  <p className="mt-1 text-xs text-warning">
                    {kpis.current.fiscal_split.pending_count} pendente
                    {kpis.current.fiscal_split.pending_count > 1 ? 's' : ''}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {!loading && kpis && (
        <div className="rounded-2xl border border-border bg-card p-4">
          <h2 className="text-sm font-medium">Formas de pagamento — {kpis.current.label}</h2>
          <p className="mt-0.5 text-xs text-muted">
            Reconciliação com o relatório de pagamentos da Avec (dinheiro, Pix, cartão etc.)
          </p>
          {kpis.current.payment_mix.length === 0 ? (
            <p className="mt-3 text-xs text-muted">Sem dado de pagamento sincronizado pela Avec esse mês.</p>
          ) : (
            <div className="mt-3 flex flex-col gap-2.5">
              {kpis.current.payment_mix.map((p) => (
                <div key={p.method} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{p.method}</span>
                    <span className="tabular-nums text-muted">
                      {formatCurrency(p.amount)} · {p.share}%
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface">
                    <div className="h-full rounded-full bg-gold" style={{ width: `${p.share}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">Despesas de {kpis?.current.label ?? 'este mês'}</h2>
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 rounded-full border border-gold/40 bg-gold/10 px-3 py-1.5 text-xs font-medium text-gold"
        >
          <Plus size={14} /> Nova despesa
        </button>
      </div>

      {loading &&
        Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-16 animate-pulse rounded-2xl bg-card" />)}

      {!loading && expenses.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 p-4 text-sm text-muted">
          Nenhuma despesa cadastrada esse mês.
        </div>
      )}

      {!loading &&
        expenses.map((e) => (
          <div key={e.id} className="flex items-center justify-between rounded-2xl border border-border bg-card p-4">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{e.description}</p>
              <p className="mt-0.5 text-xs text-muted">
                {categoryName(e.category_id)} · {new Date(`${e.expense_date}T12:00:00`).toLocaleDateString('pt-BR')}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              {e.receipt_url && (
                <a
                  href={e.receipt_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Ver nota fiscal"
                  className="text-muted transition-colors hover:text-gold"
                >
                  <Paperclip size={16} />
                </a>
              )}
              <span className="text-sm font-semibold tabular-nums">{formatCurrency(e.amount)}</span>
              <button
                type="button"
                onClick={() => removeExpense(e.id)}
                aria-label="Excluir despesa"
                className="text-muted transition-colors hover:text-danger"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}

      {showAdd && (
        <AddExpenseSheet
          categories={categories}
          onClose={() => setShowAdd(false)}
          onAdded={() => {
            setShowAdd(false)
            load()
          }}
          onCategoryCreated={(c) =>
            setCategories((prev) => [...prev, c].sort((a, b) => a.name.localeCompare(b.name)))
          }
        />
      )}
    </main>
  )
}

function AddExpenseSheet({
  categories,
  onClose,
  onAdded,
  onCategoryCreated,
}: {
  categories: FinanceCategory[]
  onClose: () => void
  onAdded: () => void
  onCategoryCreated: (c: FinanceCategory) => void
}) {
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [newCategoryMode, setNewCategoryMode] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [expenseDate, setExpenseDate] = useState(todayIso)
  const [customDateMode, setCustomDateMode] = useState(false)
  const [notes, setNotes] = useState('')
  const recentDates = recentExpenseDates(30)
  const dateInRecent = recentDates.includes(expenseDate)
  const [receiptUrl, setReceiptUrl] = useState('')
  const [receiptUploading, setReceiptUploading] = useState(false)
  const [receiptErr, setReceiptErr] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function handleReceipt(file: File) {
    setReceiptUploading(true)
    setReceiptErr(null)
    try {
      const blob = await upload(file.name, file, {
        access: 'public',
        handleUploadUrl: '/api/financeiro/upload',
      })
      setReceiptUrl(blob.url)
    } catch (e) {
      setReceiptErr(e instanceof Error ? e.message : 'Erro no upload')
    } finally {
      setReceiptUploading(false)
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setErr(null)
    try {
      let finalCategoryId: string | null = categoryId || null

      if (newCategoryMode) {
        if (!newCategoryName.trim()) throw new Error('Informe o nome da nova categoria')
        const res = await apiFetch('/api/financeiro/categorias', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: newCategoryName.trim() }),
        })
        const json = await res.json()
        if (!res.ok || json.error) throw new Error(json.error ?? 'Erro ao criar categoria')
        finalCategoryId = json.data.id
        onCategoryCreated(json.data)
      }

      const amountNum = Number(amount.replace(',', '.'))
      if (!(amountNum > 0)) throw new Error('Valor precisa ser maior que zero')

      const res = await apiFetch('/api/financeiro/despesas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoryId: finalCategoryId,
          description,
          amount: amountNum,
          expenseDate,
          notes: notes || null,
          receiptUrl: receiptUrl || null,
        }),
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
          <h2 className="text-base font-semibold">Nova despesa</h2>
          <button type="button" onClick={onClose} aria-label="Fechar" className="text-muted active:text-foreground">
            <X size={22} />
          </button>
        </div>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs uppercase tracking-wide text-muted">Descrição</span>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
              autoFocus
              placeholder="Ex.: Conta de luz"
              className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-base outline-none focus:border-gold"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs uppercase tracking-wide text-muted">Valor (R$)</span>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              inputMode="decimal"
              placeholder="0,00"
              className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-base outline-none focus:border-gold"
            />
          </label>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs uppercase tracking-wide text-muted">Data</span>
            <div className="flex flex-wrap gap-2">
              {[
                { label: 'Hoje', value: todayIso() },
                { label: 'Ontem', value: shiftIsoDate(todayIso(), -1) },
              ].map((opt) => {
                const active = !customDateMode && expenseDate === opt.value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      setCustomDateMode(false)
                      setExpenseDate(opt.value)
                    }}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                      active
                        ? 'border-gold/50 bg-gold/15 text-gold'
                        : 'border-border text-foreground/80 hover:bg-surface'
                    }`}
                  >
                    {opt.label}
                  </button>
                )
              })}
            </div>
            {!customDateMode ? (
              <select
                value={dateInRecent ? expenseDate : '__other__'}
                onChange={(e) => {
                  if (e.target.value === '__other__') {
                    setCustomDateMode(true)
                    return
                  }
                  setExpenseDate(e.target.value)
                }}
                required
                className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-base outline-none focus:border-gold"
              >
                {recentDates.map((iso) => (
                  <option key={iso} value={iso}>
                    {formatExpenseDateLabel(iso)}
                  </option>
                ))}
                <option value="__other__">Outra data…</option>
              </select>
            ) : (
              <div className="flex flex-col gap-2">
                <input
                  type="date"
                  value={expenseDate}
                  onChange={(e) => setExpenseDate(e.target.value)}
                  required
                  className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-base outline-none focus:border-gold"
                />
                <button
                  type="button"
                  onClick={() => {
                    setCustomDateMode(false)
                    if (!dateInRecent) setExpenseDate(todayIso())
                  }}
                  className="self-start text-xs text-gold"
                >
                  Voltar às datas recentes
                </button>
              </div>
            )}
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs uppercase tracking-wide text-muted">Categoria</span>
            {!newCategoryMode ? (
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-base outline-none focus:border-gold"
              >
                <option value="">Sem categoria</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            ) : (
              <input
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="Nome da nova categoria"
                className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-base outline-none focus:border-gold"
              />
            )}
            <button
              type="button"
              onClick={() => setNewCategoryMode((v) => !v)}
              className="mt-1 self-start text-xs text-gold"
            >
              {newCategoryMode ? 'Escolher categoria existente' : '+ Nova categoria'}
            </button>
          </label>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs uppercase tracking-wide text-muted">Nota fiscal / recibo (opcional)</span>
            <label className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-surface px-4 py-3 text-sm text-muted transition-colors hover:border-gold hover:text-foreground">
              <Camera size={16} />
              {receiptUploading ? 'Enviando…' : receiptUrl ? 'Nota anexada ✓ (trocar)' : 'Tirar foto ou escolher arquivo'}
              <input
                type="file"
                accept="image/*,application/pdf"
                capture="environment"
                disabled={receiptUploading}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) handleReceipt(file)
                }}
                className="hidden"
              />
            </label>
            {receiptErr && <p className="text-xs text-danger">{receiptErr}</p>}
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs uppercase tracking-wide text-muted">Observações (opcional)</span>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Opcional"
              className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-base outline-none focus:border-gold"
            />
          </label>
          {err && <p className="text-sm text-danger">{err}</p>}
          <PrimaryButton type="submit" disabled={submitting}>
            {submitting ? 'Salvando…' : 'Salvar despesa'}
          </PrimaryButton>
        </form>
      </div>
    </div>
  )
}
