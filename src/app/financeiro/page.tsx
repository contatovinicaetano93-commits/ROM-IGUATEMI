'use client'

import { useCallback, useEffect, useState } from 'react'
import { Plus, X, Trash2, Download, Camera, Paperclip } from 'lucide-react'
import { upload } from '@vercel/blob/client'
import { PrimaryButton } from '../_components/ui'
import { MonthYearField } from '../_components/MonthYearField'
import { apiFetch } from '@/lib/api-client'
import {
  formatCurrency,
  formatDateBr,
  formatNumberBr,
  formatPercentPoints,
  todayIso,
} from '@/lib/salon/format'

interface FiscalSplitSummary {
  gross_paid: number
  cbs_retained: number
  ibs_retained: number
  net_received: number
  pending_count: number
  settled_count: number
  configured: boolean
}
interface PaymentReconciliation {
  revenue: number
  payments_total: number
  delta: number
  tolerance: number
  status: 'aligned' | 'divergent' | 'missing_payments' | 'missing_revenue'
}
interface FinanceKpiBucket {
  month: string
  label: string
  from: string
  to: string
  revenue: number
  expenses: number
  attended: number
  ticket_avg: number | null
  daily: { day: string; revenue: number; attended: number; ticket_avg: number | null }[]
  top_professionals: {
    name: string
    revenue: number
    attended: number
    ticket_avg: number
    occupancy?: number
  }[]
  top_services: { name: string; quantity: number; revenue: number }[]
  occupancy_avg: number | null
  cancelled: number
  no_shows: number
  lost_revenue: number
  cmv: number
  margin_after_cmv: number | null
  packages: { name: string; quantity: number; revenue: number }[]
  packages_sold: number
  packages_revenue: number
  booking_channels: { channel: string; count: number }[]
  acquisition: { channel: string; clients: number }[]
  return_rate: number | null
  new_clients_period: number
  gross_margin: number | null
  cash_flow: number
  payment_mix: { method: string; amount: number; share: number }[]
  payment_reconciliation: PaymentReconciliation
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
  compareLabel,
  positive,
  loading,
}: {
  label: string
  value: string
  delta: string | null
  /** Ex.: "Mai/2026" — mês escolhido em Comparar com (não necessariamente o anterior). */
  compareLabel: string
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
              {delta} vs. {compareLabel}
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

function csvRow(...cells: Array<string | number | null | undefined>) {
  return cells.map(csvEscape).join(';')
}

function csvMoney(v: number | null | undefined) {
  if (v === null || v === undefined || Number.isNaN(v)) return '—'
  return formatCurrency(v)
}

function csvPercentPoints(v: number | null | undefined) {
  return formatPercentPoints(v, 1)
}

function reconciliationStatusLabel(status: PaymentReconciliation['status']) {
  switch (status) {
    case 'aligned':
      return 'Conciliado'
    case 'divergent':
      return 'Divergente'
    case 'missing_payments':
      return 'Sem formas de pagamento'
    case 'missing_revenue':
      return 'Sem receita'
    default: {
      const _exhaustive: never = status
      return _exhaustive
    }
  }
}

const FINANCE_LEGEND: { term: string; meaning: string }[] = [
  {
    term: 'Receita',
    meaning: 'Faturamento do período (sync Avec / métricas diárias do salão).',
  },
  {
    term: 'Atendidos',
    meaning: 'Quantidade de atendimentos concluídos no mês.',
  },
  {
    term: 'Ticket médio',
    meaning: 'Receita ÷ atendidos (quanto cada atendimento gerou em média).',
  },
  {
    term: 'Despesas',
    meaning: 'Gastos lançados manualmente no ROM neste mês (não vêm da Avec).',
  },
  {
    term: 'Margem bruta (%)',
    meaning: '((Receita − Despesas) ÷ Receita) × 100.',
  },
  {
    term: 'Margem após CMV',
    meaning: '((Receita − Despesas − CMV) ÷ Receita) × 100. CMV = custo das saídas de estoque.',
  },
  {
    term: 'Fluxo',
    meaning: 'Receita − Despesas do período (caixa operacional simplificado).',
  },
  {
    term: 'Ocupação',
    meaning: 'Média da agenda preenchida por profissional (Avec 0126, janela ~30 dias).',
  },
  {
    term: 'Receita perdida',
    meaning: '(Cancelados + no-shows) × ticket médio — estimativa Avec 0052.',
  },
  {
    term: 'CMV',
    meaning: 'Custo das saídas de estoque no mês (proxy de produtos consumidos/vendidos).',
  },
  {
    term: 'Pacotes',
    meaning: 'Pacotes vendidos e receita (Avec 0061, snapshot ~30 dias).',
  },
  {
    term: 'Canais de agenda',
    meaning: 'De onde vieram os agendamentos (Avec 0056).',
  },
  {
    term: 'Novos / retorno',
    meaning: 'Novos no período (0017) e taxa de retorno (0007) — snapshot Avec.',
  },
  {
    term: 'Formas de pagamento',
    meaning: 'Relatório Avec 0081 — cartão, Pix, dinheiro etc., para conciliação.',
  },
  {
    term: 'Conciliação',
    meaning: 'Compara soma dos pagamentos (0081) com a receita das métricas.',
  },
  {
    term: 'Split fiscal',
    meaning: 'Bruto pago vs CBS/IBS retidos e líquido (quando settlements importados).',
  },
]

const EMPTY_FISCAL_SPLIT: FiscalSplitSummary = {
  gross_paid: 0,
  cbs_retained: 0,
  ibs_retained: 0,
  net_received: 0,
  pending_count: 0,
  settled_count: 0,
  configured: false,
}

const EMPTY_RECONCILIATION: PaymentReconciliation = {
  revenue: 0,
  payments_total: 0,
  delta: 0,
  tolerance: 1,
  status: 'missing_payments',
}

function normalizeKpiBucket(bucket: FinanceKpiBucket): FinanceKpiBucket {
  return {
    ...bucket,
    attended: bucket.attended ?? 0,
    ticket_avg: bucket.ticket_avg ?? null,
    daily: bucket.daily ?? [],
    top_professionals: bucket.top_professionals ?? [],
    top_services: bucket.top_services ?? [],
    occupancy_avg: bucket.occupancy_avg ?? null,
    cancelled: bucket.cancelled ?? 0,
    no_shows: bucket.no_shows ?? 0,
    lost_revenue: bucket.lost_revenue ?? 0,
    cmv: bucket.cmv ?? 0,
    margin_after_cmv: bucket.margin_after_cmv ?? null,
    packages: bucket.packages ?? [],
    packages_sold: bucket.packages_sold ?? 0,
    packages_revenue: bucket.packages_revenue ?? 0,
    booking_channels: bucket.booking_channels ?? [],
    acquisition: bucket.acquisition ?? [],
    return_rate: bucket.return_rate ?? null,
    new_clients_period: bucket.new_clients_period ?? 0,
    payment_mix: bucket.payment_mix ?? [],
    payment_reconciliation: bucket.payment_reconciliation ?? EMPTY_RECONCILIATION,
    fiscal_split: bucket.fiscal_split ?? EMPTY_FISCAL_SPLIT,
  }
}

function paymentReconciliationMessage(
  rec: PaymentReconciliation,
  hasMix: boolean,
): { tone: 'success' | 'muted' | 'warning'; text: string } | null {
  switch (rec.status) {
    case 'aligned':
      if (!hasMix) return null
      return {
        tone: 'success',
        text: `Conciliado: pagamentos ${formatCurrency(rec.payments_total)} ≈ receita ${formatCurrency(rec.revenue)}`,
      }
    case 'missing_payments':
      return {
        tone: 'muted',
        text: `Receita ${formatCurrency(rec.revenue)} sem formas de pagamento sincronizadas (0081) nesse mês — rode o sync Avec ou aguarde o cron.`,
      }
    case 'missing_revenue':
      return {
        tone: 'warning',
        text: `Pagamentos ${formatCurrency(rec.payments_total)} sem receita em métricas — conferir relatório de faturamento.`,
      }
    case 'divergent': {
      const sign = rec.delta > 0 ? '+' : ''
      return {
        tone: 'warning',
        text: `Divergência ${sign}${formatCurrency(rec.delta)}: pagamentos ${formatCurrency(rec.payments_total)} vs receita ${formatCurrency(rec.revenue)} (tolerância ${formatCurrency(rec.tolerance)}).`,
      }
    }
    default: {
      const _exhaustive: never = rec.status
      return _exhaustive
    }
  }
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
  const [fiscalImporting, setFiscalImporting] = useState(false)
  const [fiscalImportMsg, setFiscalImportMsg] = useState<string | null>(null)

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
      const raw = kpisJson.data as FinanceKpis
      setKpis({
        current: normalizeKpiBucket(raw.current),
        previous: normalizeKpiBucket(raw.previous),
      })
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
    const cur = kpis.current
    const prev = kpis.previous
    const rec = cur.payment_reconciliation
    const fiscal = cur.fiscal_split

    const lines: string[] = [
      csvRow('Relatório financeiro ROM'),
      csvRow('Gerado em', new Date().toLocaleString('pt-BR')),
      csvRow('Período', cur.label, 'vs', prev.label),
      csvRow('Valores em Real (R$) — formato brasileiro: milhar com ponto, decimal com vírgula'),
      '',
      csvRow('=== RESUMO ==='),
      csvRow('Métrica', cur.label, prev.label, 'Variação'),
      csvRow(
        'Receita',
        csvMoney(cur.revenue),
        csvMoney(prev.revenue),
        csvMoney(cur.revenue - prev.revenue),
      ),
      csvRow(
        'Atendidos',
        formatNumberBr(cur.attended, 0),
        formatNumberBr(prev.attended, 0),
        formatNumberBr(cur.attended - prev.attended, 0),
      ),
      csvRow(
        'Ticket médio',
        csvMoney(cur.ticket_avg),
        csvMoney(prev.ticket_avg),
        cur.ticket_avg != null && prev.ticket_avg != null
          ? csvMoney(cur.ticket_avg - prev.ticket_avg)
          : '—',
      ),
      csvRow(
        'Despesas',
        csvMoney(cur.expenses),
        csvMoney(prev.expenses),
        csvMoney(cur.expenses - prev.expenses),
      ),
      csvRow(
        'Margem bruta (%)',
        csvPercentPoints(cur.gross_margin),
        csvPercentPoints(prev.gross_margin),
        cur.gross_margin != null && prev.gross_margin != null
          ? csvPercentPoints(cur.gross_margin - prev.gross_margin)
          : '—',
      ),
      csvRow(
        'Fluxo (receita − despesas)',
        csvMoney(cur.cash_flow),
        csvMoney(prev.cash_flow),
        csvMoney(cur.cash_flow - prev.cash_flow),
      ),
      csvRow(
        'Ocupação média (%)',
        cur.occupancy_avg != null ? csvPercentPoints(cur.occupancy_avg * 100) : '—',
        prev.occupancy_avg != null ? csvPercentPoints(prev.occupancy_avg * 100) : '—',
        '—',
      ),
      csvRow(
        'Cancelados',
        formatNumberBr(cur.cancelled, 0),
        formatNumberBr(prev.cancelled, 0),
        formatNumberBr(cur.cancelled - prev.cancelled, 0),
      ),
      csvRow(
        'No-shows',
        formatNumberBr(cur.no_shows, 0),
        formatNumberBr(prev.no_shows, 0),
        formatNumberBr(cur.no_shows - prev.no_shows, 0),
      ),
      csvRow(
        'Receita perdida (estimativa)',
        csvMoney(cur.lost_revenue),
        csvMoney(prev.lost_revenue),
        csvMoney(cur.lost_revenue - prev.lost_revenue),
      ),
      csvRow(
        'CMV (saídas de estoque)',
        csvMoney(cur.cmv),
        csvMoney(prev.cmv),
        csvMoney(cur.cmv - prev.cmv),
      ),
      csvRow(
        'Margem após CMV (%)',
        csvPercentPoints(cur.margin_after_cmv),
        csvPercentPoints(prev.margin_after_cmv),
        cur.margin_after_cmv != null && prev.margin_after_cmv != null
          ? csvPercentPoints(cur.margin_after_cmv - prev.margin_after_cmv)
          : '—',
      ),
      csvRow(
        'Novos clientes (0017)',
        formatNumberBr(cur.new_clients_period, 0),
        formatNumberBr(prev.new_clients_period, 0),
        formatNumberBr(cur.new_clients_period - prev.new_clients_period, 0),
      ),
      csvRow(
        'Taxa de retorno (0007)',
        cur.return_rate != null ? csvPercentPoints(cur.return_rate * 100) : '—',
        prev.return_rate != null ? csvPercentPoints(prev.return_rate * 100) : '—',
        '—',
      ),
      csvRow(
        'Pacotes — receita (0061)',
        csvMoney(cur.packages_revenue),
        csvMoney(prev.packages_revenue),
        csvMoney(cur.packages_revenue - prev.packages_revenue),
      ),
      '',
      csvRow('=== CONCILIAÇÃO DE PAGAMENTOS (Avec 0081) ==='),
      csvRow('Status', reconciliationStatusLabel(rec.status)),
      csvRow('Receita (métricas)', csvMoney(rec.revenue)),
      csvRow('Soma formas de pagamento', csvMoney(rec.payments_total)),
      csvRow('Diferença (pagamentos − receita)', csvMoney(rec.delta)),
      csvRow('Tolerância', csvMoney(rec.tolerance)),
      '',
      csvRow(`=== FORMAS DE PAGAMENTO — ${cur.label} ===`),
      csvRow('Método', 'Valor', '% do total'),
      ...(cur.payment_mix.length > 0
        ? cur.payment_mix.map((p) =>
            csvRow(p.method, csvMoney(p.amount), csvPercentPoints(p.share)),
          )
        : [csvRow('(sem dados 0081 neste mês)')]),
      '',
      csvRow(`=== SPLIT FISCAL — ${cur.label} ===`),
      csvRow('Bruto pago', csvMoney(fiscal.gross_paid)),
      csvRow('CBS retido', csvMoney(fiscal.cbs_retained)),
      csvRow('IBS retido', csvMoney(fiscal.ibs_retained)),
      csvRow('Líquido recebido', csvMoney(fiscal.net_received)),
      csvRow('Settlements', `${fiscal.settled_count} liquidados / ${fiscal.pending_count} pendentes`),
      '',
      csvRow(`=== RECEITA DIÁRIA — ${cur.label} ===`),
      csvRow('Data', 'Receita', 'Atendidos', 'Ticket médio'),
      ...(cur.daily.length > 0
        ? cur.daily.map((d) =>
            csvRow(
              formatDateBr(d.day),
              csvMoney(d.revenue),
              formatNumberBr(d.attended, 0),
              csvMoney(d.ticket_avg),
            ),
          )
        : [csvRow('(sem receita diária)')]),
      '',
      csvRow(`=== TOP PROFISSIONAIS — ${cur.label} ===`),
      csvRow('Profissional', 'Receita', 'Atendidos', 'Ticket médio'),
      ...(cur.top_professionals.length > 0
        ? cur.top_professionals.map((p) =>
            csvRow(
              p.name,
              csvMoney(p.revenue),
              formatNumberBr(p.attended, 0),
              csvMoney(p.ticket_avg),
            ),
          )
        : [csvRow('(sem ranking 0021)')]),
      '',
      csvRow(`=== TOP SERVIÇOS — ${cur.label} ===`),
      csvRow('Serviço', 'Qtd', 'Receita'),
      ...(cur.top_services.length > 0
        ? cur.top_services.map((s) =>
            csvRow(s.name, formatNumberBr(s.quantity, 0), csvMoney(s.revenue)),
          )
        : [csvRow('(sem ranking 0032)')]),
      '',
      csvRow(`=== PACOTES (Avec 0061) — ${cur.label} ===`),
      csvRow('Pacote', 'Qtd', 'Receita'),
      ...(cur.packages.length > 0
        ? cur.packages.map((p) =>
            csvRow(p.name, formatNumberBr(p.quantity, 0), csvMoney(p.revenue)),
          )
        : [csvRow('(sem pacotes sincronizados)')]),
      csvRow('Total vendidos', formatNumberBr(cur.packages_sold, 0)),
      csvRow('Receita pacotes', csvMoney(cur.packages_revenue)),
      '',
      csvRow(`=== CANAIS DE AGENDA (Avec 0056) — ${cur.label} ===`),
      csvRow('Canal', 'Agendamentos'),
      ...(cur.booking_channels.length > 0
        ? cur.booking_channels.map((c) => csvRow(c.channel, formatNumberBr(c.count, 0)))
        : [csvRow('(sem canais sincronizados)')]),
      '',
      csvRow(`=== AQUISIÇÃO (Avec 0003) — ${cur.label} ===`),
      csvRow('Canal', 'Clientes'),
      ...(cur.acquisition.length > 0
        ? cur.acquisition.map((a) => csvRow(a.channel, formatNumberBr(a.clients, 0)))
        : [csvRow('(sem aquisição sincronizada)')]),
      '',
      csvRow(`=== DESPESAS — ${cur.label} ===`),
      csvRow('Data', 'Descrição', 'Categoria', 'Valor'),
      ...(expenses.length > 0
        ? expenses.map((e) =>
            csvRow(
              formatDateBr(e.expense_date),
              e.description,
              categoryName(e.category_id),
              csvMoney(e.amount),
            ),
          )
        : [csvRow('(nenhuma despesa lançada)')]),
      '',
      csvRow('=== LEGENDA ==='),
      csvRow('Termo', 'Significado'),
      ...FINANCE_LEGEND.map((item) => csvRow(item.term, item.meaning)),
      '',
      csvRow(
        'Observação',
        'Despesas são manuais no ROM. Receita, atendidos, ticket, formas de pagamento e rankings vêm da Avec (quando o sync estiver ativo).',
      ),
    ]

    // BOM UTF-8: Excel/Numbers reconhecem acentos e formato BR.
    const blob = new Blob(['\uFEFF' + lines.join('\n')], {
      type: 'text/csv;charset=utf-8',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `financeiro_${cur.month}_vs_${prev.month}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function removeExpense(id: string) {
    if (!confirm('Excluir essa despesa?')) return
    await apiFetch(`/api/financeiro/despesas/${id}`, { method: 'DELETE' })
    load()
  }

  async function importFiscalSettlements() {
    setFiscalImporting(true)
    setFiscalImportMsg(null)
    try {
      const res = await apiFetch('/api/financeiro/fiscal-split', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month }),
      })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      const imported = json.data?.imported ?? 0
      setFiscalImportMsg(
        imported > 0
          ? `Importados ${imported} settlement(s).`
          : json.data?.error ?? 'Nenhum settlement novo (verifique FISCAL_SPLIT_API_URL).',
      )
      await load()
    } catch (e) {
      setFiscalImportMsg(e instanceof Error ? e.message : String(e))
    } finally {
      setFiscalImporting(false)
    }
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
            <MonthYearField value={month} onChange={setMonth} aria-label="Mês do financeiro" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[0.65rem] uppercase tracking-wide text-muted">Comparar com</span>
            <MonthYearField
              value={compareMonth}
              onChange={setCompareMonth}
              allowEmpty
              emptyLabel="Automático"
              aria-label="Comparar com"
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

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <FinanceKpiCard
          label="Receita"
          value={loading || !kpis ? '—' : formatCurrency(kpis.current.revenue)}
          delta={kpis ? fmtDelta(kpis.current.revenue, kpis.previous.revenue) : null}
          compareLabel={kpis?.previous.label ?? 'período comparado'}
          positive={kpis ? kpis.current.revenue >= kpis.previous.revenue : null}
          loading={loading}
        />
        <FinanceKpiCard
          label="Atendidos"
          value={loading || !kpis ? '—' : String(kpis.current.attended ?? 0)}
          delta={
            kpis
              ? (() => {
                  const diff = (kpis.current.attended ?? 0) - (kpis.previous.attended ?? 0)
                  if (diff === 0) return null
                  return `${diff > 0 ? '+' : ''}${diff}`
                })()
              : null
          }
          compareLabel={kpis?.previous.label ?? 'período comparado'}
          positive={kpis ? (kpis.current.attended ?? 0) >= (kpis.previous.attended ?? 0) : null}
          loading={loading}
        />
        <FinanceKpiCard
          label="Ticket médio"
          value={
            loading || !kpis
              ? '—'
              : kpis.current.ticket_avg != null
                ? formatCurrency(kpis.current.ticket_avg)
                : '—'
          }
          delta={
            kpis && kpis.current.ticket_avg != null && kpis.previous.ticket_avg != null
              ? fmtDelta(kpis.current.ticket_avg, kpis.previous.ticket_avg)
              : null
          }
          compareLabel={kpis?.previous.label ?? 'período comparado'}
          positive={
            kpis && kpis.current.ticket_avg != null && kpis.previous.ticket_avg != null
              ? kpis.current.ticket_avg >= kpis.previous.ticket_avg
              : null
          }
          loading={loading}
        />
        <FinanceKpiCard
          label="Despesas"
          value={loading || !kpis ? '—' : formatCurrency(kpis.current.expenses)}
          delta={kpis ? fmtDelta(kpis.current.expenses, kpis.previous.expenses) : null}
          compareLabel={kpis?.previous.label ?? 'período comparado'}
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
          compareLabel={kpis?.previous.label ?? 'período comparado'}
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
          compareLabel={kpis?.previous.label ?? 'período comparado'}
          positive={kpis ? kpis.current.cash_flow >= kpis.previous.cash_flow : null}
          loading={loading}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <FinanceKpiCard
          label="Ocupação (0126)"
          value={
            loading || !kpis
              ? '—'
              : kpis.current.occupancy_avg != null
                ? formatPercentPoints(kpis.current.occupancy_avg * 100)
                : '—'
          }
          delta={
            kpis && kpis.current.occupancy_avg != null && kpis.previous.occupancy_avg != null
              ? fmtDelta(kpis.current.occupancy_avg * 100, kpis.previous.occupancy_avg * 100, 'pp')
              : null
          }
          compareLabel={kpis?.previous.label ?? 'período comparado'}
          positive={
            kpis && kpis.current.occupancy_avg != null && kpis.previous.occupancy_avg != null
              ? kpis.current.occupancy_avg >= kpis.previous.occupancy_avg
              : null
          }
          loading={loading}
        />
        <FinanceKpiCard
          label="Receita perdida"
          value={loading || !kpis ? '—' : formatCurrency(kpis.current.lost_revenue)}
          delta={kpis ? fmtDelta(kpis.current.lost_revenue, kpis.previous.lost_revenue) : null}
          compareLabel={kpis?.previous.label ?? 'período comparado'}
          positive={kpis ? kpis.current.lost_revenue <= kpis.previous.lost_revenue : null}
          loading={loading}
        />
        <FinanceKpiCard
          label="Cancel. + no-show"
          value={
            loading || !kpis
              ? '—'
              : String((kpis.current.cancelled ?? 0) + (kpis.current.no_shows ?? 0))
          }
          delta={
            kpis
              ? (() => {
                  const cur = (kpis.current.cancelled ?? 0) + (kpis.current.no_shows ?? 0)
                  const prev = (kpis.previous.cancelled ?? 0) + (kpis.previous.no_shows ?? 0)
                  const diff = cur - prev
                  if (diff === 0) return null
                  return `${diff > 0 ? '+' : ''}${diff}`
                })()
              : null
          }
          compareLabel={kpis?.previous.label ?? 'período comparado'}
          positive={
            kpis
              ? (kpis.current.cancelled ?? 0) + (kpis.current.no_shows ?? 0) <=
                (kpis.previous.cancelled ?? 0) + (kpis.previous.no_shows ?? 0)
              : null
          }
          loading={loading}
        />
        <FinanceKpiCard
          label="CMV (estoque)"
          value={loading || !kpis ? '—' : formatCurrency(kpis.current.cmv)}
          delta={kpis ? fmtDelta(kpis.current.cmv, kpis.previous.cmv) : null}
          compareLabel={kpis?.previous.label ?? 'período comparado'}
          positive={kpis ? kpis.current.cmv <= kpis.previous.cmv : null}
          loading={loading}
        />
        <FinanceKpiCard
          label="Margem após CMV"
          value={
            loading || !kpis
              ? '—'
              : kpis.current.margin_after_cmv != null
                ? formatPercentPoints(kpis.current.margin_after_cmv)
                : '—'
          }
          delta={
            kpis && kpis.current.margin_after_cmv != null && kpis.previous.margin_after_cmv != null
              ? fmtDelta(kpis.current.margin_after_cmv, kpis.previous.margin_after_cmv, 'pp')
              : null
          }
          compareLabel={kpis?.previous.label ?? 'período comparado'}
          positive={
            kpis && kpis.current.margin_after_cmv != null && kpis.previous.margin_after_cmv != null
              ? kpis.current.margin_after_cmv >= kpis.previous.margin_after_cmv
              : null
          }
          loading={loading}
        />
        <FinanceKpiCard
          label="Novos / retorno"
          value={
            loading || !kpis
              ? '—'
              : `${kpis.current.new_clients_period}${
                  kpis.current.return_rate != null
                    ? ` · ${formatPercentPoints(kpis.current.return_rate * 100, 0)}`
                    : ''
                }`
          }
          delta={
            kpis
              ? (() => {
                  const diff = kpis.current.new_clients_period - kpis.previous.new_clients_period
                  if (diff === 0) return null
                  return `${diff > 0 ? '+' : ''}${diff} novos`
                })()
              : null
          }
          compareLabel={kpis?.previous.label ?? 'período comparado'}
          positive={
            kpis ? kpis.current.new_clients_period >= kpis.previous.new_clients_period : null
          }
          loading={loading}
        />
      </div>

      <details className="rounded-2xl border border-border bg-card/60 px-4 py-3">
        <summary className="cursor-pointer text-sm font-medium text-foreground/90">
          Legenda das métricas
        </summary>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          {FINANCE_LEGEND.map((item) => (
            <div key={item.term} className="rounded-xl bg-surface/60 px-3 py-2">
              <dt className="font-medium text-gold">{item.term}</dt>
              <dd className="mt-0.5 text-xs leading-relaxed text-muted">{item.meaning}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-xs text-muted">
          O CSV exportado usa formato brasileiro (R$ 1.234,56) e inclui esta legenda no final do
          arquivo.
        </p>
      </details>

      {!loading && kpis && (kpis.current.daily?.length ?? 0) > 0 && (
        <div className="rounded-2xl border border-border bg-card p-4">
          <h2 className="text-sm font-medium">Receita diária — {kpis.current.label}</h2>
          <p className="mt-0.5 text-xs text-muted">
            Fonte: salon_daily_metrics (sync Avec + histórico Lake).
          </p>
          <div className="mt-3 max-h-64 overflow-y-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-card text-[0.65rem] uppercase tracking-wide text-muted">
                <tr>
                  <th className="py-1.5 font-medium">Dia</th>
                  <th className="py-1.5 font-medium">Receita</th>
                  <th className="py-1.5 font-medium">Atendidos</th>
                  <th className="py-1.5 font-medium">Ticket</th>
                </tr>
              </thead>
              <tbody>
                {[...kpis.current.daily].reverse().map((d) => (
                  <tr key={d.day} className="border-t border-border/60">
                    <td className="py-1.5 tabular-nums">{d.day.slice(8)}/{d.day.slice(5, 7)}</td>
                    <td className="py-1.5 tabular-nums">{formatCurrency(d.revenue)}</td>
                    <td className="py-1.5 tabular-nums">{d.attended}</td>
                    <td className="py-1.5 tabular-nums">
                      {d.ticket_avg != null ? formatCurrency(d.ticket_avg) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && kpis && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="text-sm font-medium">Top profissionais</h2>
                <p className="mt-0.5 text-xs text-muted">Snapshot 0021 (janela ~30 dias).</p>
              </div>
              <a
                href="/admin/relatorio-diretoria"
                className="shrink-0 text-xs text-gold hover:underline"
              >
                Relatório 0021
              </a>
            </div>
            {(kpis.current.top_professionals?.length ?? 0) === 0 ? (
              <p className="mt-3 text-xs text-muted">Sem ranking sincronizado — aguarde o sync full.</p>
            ) : (
              <ul className="mt-3 flex flex-col gap-2">
                {kpis.current.top_professionals.map((p) => (
                  <li key={p.name} className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="truncate font-medium">{p.name}</span>
                    <span className="shrink-0 tabular-nums text-muted">
                      {formatCurrency(p.revenue)} · {p.attended} at.
                      {p.occupancy != null && p.occupancy > 0
                        ? ` · ${formatPercentPoints(p.occupancy * 100, 0)}`
                        : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="rounded-2xl border border-border bg-card p-4">
            <h2 className="text-sm font-medium">Top serviços</h2>
            <p className="mt-0.5 text-xs text-muted">Snapshot 0032 (janela ~30 dias).</p>
            {(kpis.current.top_services?.length ?? 0) === 0 ? (
              <p className="mt-3 text-xs text-muted">Sem ranking sincronizado — aguarde o sync full.</p>
            ) : (
              <ul className="mt-3 flex flex-col gap-2">
                {kpis.current.top_services.map((s) => (
                  <li key={s.name} className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="truncate font-medium">{s.name}</span>
                    <span className="shrink-0 tabular-nums text-muted">
                      {formatCurrency(s.revenue)} · {s.quantity}×
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {!loading && kpis && (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-border bg-card p-4">
            <h2 className="text-sm font-medium">Pacotes — {kpis.current.label}</h2>
            <p className="mt-0.5 text-xs text-muted">
              Avec 0061 · {kpis.current.packages_sold} vendidos ·{' '}
              {formatCurrency(kpis.current.packages_revenue)}
            </p>
            {(kpis.current.packages?.length ?? 0) === 0 ? (
              <p className="mt-3 text-xs text-muted">Sem pacotes no snapshot — aguarde o sync full.</p>
            ) : (
              <ul className="mt-3 flex flex-col gap-2">
                {kpis.current.packages.map((p) => (
                  <li key={p.name} className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="truncate font-medium">{p.name}</span>
                    <span className="shrink-0 tabular-nums text-muted">
                      {formatCurrency(p.revenue)} · {p.quantity}×
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="rounded-2xl border border-border bg-card p-4">
            <h2 className="text-sm font-medium">Canais de agenda</h2>
            <p className="mt-0.5 text-xs text-muted">Avec 0056 (snapshot ~30 dias).</p>
            {(kpis.current.booking_channels?.length ?? 0) === 0 ? (
              <p className="mt-3 text-xs text-muted">Sem canais sincronizados.</p>
            ) : (
              <ul className="mt-3 flex flex-col gap-2">
                {kpis.current.booking_channels.map((c) => (
                  <li key={c.channel} className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="truncate font-medium">{c.channel}</span>
                    <span className="shrink-0 tabular-nums text-muted">{c.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="rounded-2xl border border-border bg-card p-4">
            <h2 className="text-sm font-medium">Como nos conheceram</h2>
            <p className="mt-0.5 text-xs text-muted">Avec 0003 (aquisição).</p>
            {(kpis.current.acquisition?.length ?? 0) === 0 ? (
              <p className="mt-3 text-xs text-muted">Sem dados de aquisição.</p>
            ) : (
              <ul className="mt-3 flex flex-col gap-2">
                {kpis.current.acquisition.map((a) => (
                  <li key={a.channel} className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="truncate font-medium">{a.channel}</span>
                    <span className="shrink-0 tabular-nums text-muted">{a.clients}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {!loading && noRevenueYet && (
        <p className="-mt-3 text-xs text-muted">
          Margem bruta e fluxo dependem do faturamento sincronizado pela Avec — ainda sem dado esse mês.
        </p>
      )}

      {!loading && kpis && (
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-medium">Split fiscal — {kpis.current.label}</h2>
              <p className="mt-0.5 text-xs text-muted">
                CBS/IBS retidos na liquidação (Plataforma Pública / export do PSP). O ROM só reconcilia — não
                processa pagamento.
              </p>
            </div>
            <button
              type="button"
              onClick={importFiscalSettlements}
              disabled={fiscalImporting}
              className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground/90 transition-colors hover:bg-surface disabled:opacity-50"
            >
              {fiscalImporting ? 'Importando…' : 'Importar settlements'}
            </button>
          </div>
          {fiscalImportMsg && <p className="mt-2 text-xs text-muted">{fiscalImportMsg}</p>}
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
            Relatório 0081 da Avec (dinheiro, Pix, cartão etc.), reconciliado com a receita do mês.
          </p>
          {(() => {
            const msg = paymentReconciliationMessage(
              kpis.current.payment_reconciliation,
              kpis.current.payment_mix.length > 0,
            )
            if (!msg) return null
            const toneClass =
              msg.tone === 'success' ? 'text-success' : msg.tone === 'warning' ? 'text-warning' : 'text-muted'
            return <p className={`mt-2 text-xs ${toneClass}`}>{msg.text}</p>
          })()}
          {kpis.current.payment_mix.length === 0 ? (
            <p className="mt-3 text-xs text-muted">Sem dado de pagamento sincronizado pela Avec esse mês.</p>
          ) : (
            <div className="mt-3 flex flex-col gap-2.5">
              {kpis.current.payment_mix.map((p) => (
                <div key={p.method} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{p.method}</span>
                    <span className="tabular-nums text-muted">
                      {formatCurrency(p.amount)} · {formatPercentPoints(p.share)}
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
