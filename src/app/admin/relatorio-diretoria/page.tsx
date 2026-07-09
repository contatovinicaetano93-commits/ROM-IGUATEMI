'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  Download,
  RefreshCw,
  TrendingUp,
  Users,
  DollarSign,
  CalendarClock,
} from 'lucide-react'
import { SectionCard, CountBadge, PrimaryButton } from '../../_components/ui'
import { apiFetch } from '@/lib/api-client'
import { formatCurrency, formatPercent } from '@/lib/salon/format'
import type { DirectorReport } from '@/lib/director-report/types'

const QUARTERS = [
  { value: '2025-Q1', label: '1º tri 2025' },
  { value: '2025-Q2', label: '2º tri 2025' },
  { value: '2025-Q3', label: '3º tri 2025' },
  { value: '2025-Q4', label: '4º tri 2025' },
  { value: '2026-Q1', label: '1º tri 2026' },
]

const MONTHS = [
  ...Array.from({ length: 12 }, (_, i) => ({
    value: `2025-${String(i + 1).padStart(2, '0')}`,
    label: `${['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'][i]} 2025`,
  })),
  { value: '2026-01', label: 'Jan 2026' },
  { value: '2026-02', label: 'Fev 2026' },
  { value: '2026-03', label: 'Mar 2026' },
]

export default function RelatorioDiretoriaPage() {
  const [month, setMonth] = useState('2026-03')
  const [quarter, setQuarter] = useState('2026-Q1')
  const [compare, setCompare] = useState('2025-Q1')
  const [proId, setProId] = useState('')
  const [data, setData] = useState<DirectorReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const q = new URLSearchParams({
        month,
        quarter,
        compare,
        mock: '1',
      })
      if (proId) q.set('professional_id', proId)
      const res = await apiFetch(`/api/director-report?${q}`, { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok || json.error) {
        setError(json.error ?? 'Não autorizado — entre como ADMIN-BRASIL')
        setData(null)
        return
      }
      setData(json.data)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [month, quarter, compare, proId])

  useEffect(() => {
    load()
  }, [load])

  const pros = useMemo(() => data?.return_blocks.map((b) => b.professional) ?? [], [data])

  const selectedReturn = useMemo(() => {
    if (!data) return []
    return data.return_blocks.map((b) => {
      const sel = b.quarters.find((q) => q.quarter === quarter)
      const cmp = b.quarters.find((q) => q.quarter === compare)
      return { pro: b.professional, sel, cmp, reactivation: b.reactivation }
    })
  }, [data, quarter, compare])

  const selectedRevenue = useMemo(() => {
    if (!data) return []
    return data.revenue_blocks
      .map((b) => {
        const row = b.months.find((m) => m.month === month)
        return { pro: b.professional, row, months: b.months }
      })
      .sort((a, b) => (b.row?.revenue ?? 0) - (a.row?.revenue ?? 0))
  }, [data, month])

  async function download(format: string, filename: string) {
    const q = new URLSearchParams({ format, month, quarter, compare, mock: '1' })
    if (proId) q.set('professional_id', proId)
    const res = await apiFetch(`/api/director-report?${q}`)
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      setError(json.error ?? 'Falha ao exportar')
      return
    }
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <main className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-6 px-5 py-6 lg:gap-8 lg:px-8 lg:py-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            href="/admin"
            className="mb-2 inline-flex items-center gap-1 text-xs text-muted hover:text-gold"
          >
            <ArrowLeft size={14} /> Diagnóstico
          </Link>
          <p className="text-[0.65rem] uppercase tracking-[0.25em] text-gold">Admin operacional</p>
          <h1 className="mt-1 text-xl font-semibold lg:text-2xl">Relatório diretoria</h1>
          <p className="mt-1 max-w-xl text-sm text-muted">
            Avec <span className="text-foreground">0011</span> (retorno por trimestre) +{' '}
            <span className="text-foreground">0021</span> (faturamento e ticket médio mês a mês).
            Preview com dados da planilha Vitor M + equipe do portfólio.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 rounded-2xl border border-gold/40 bg-gold/10 px-4 py-2.5 text-sm font-semibold text-gold disabled:opacity-60"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          Atualizar
        </button>
      </div>

      {error && (
        <div className="rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <FilterSelect
          label="Mês (0021)"
          value={month}
          onChange={setMonth}
          options={MONTHS}
        />
        <FilterSelect
          label="Trimestre (0011)"
          value={quarter}
          onChange={setQuarter}
          options={QUARTERS}
        />
        <FilterSelect
          label="Comparar com"
          value={compare}
          onChange={setCompare}
          options={QUARTERS}
        />
        <label className="flex flex-col gap-1.5">
          <span className="text-xs uppercase tracking-wide text-muted">Profissional</span>
          <select
            value={proId}
            onChange={(e) => setProId(e.target.value)}
            className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-gold"
          >
            <option value="">Todos</option>
            {pros.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          icon={<Users size={16} />}
          label="Profissionais"
          value={loading ? '—' : String(data?.summary.professionals ?? 0)}
        />
        <Kpi
          icon={<TrendingUp size={16} />}
          label="Retorno médio"
          value={loading ? '—' : formatPercent(data?.summary.avg_return_rate, 1)}
        />
        <Kpi
          icon={<DollarSign size={16} />}
          label="Fat. mês"
          value={loading ? '—' : formatCurrency(data?.summary.total_revenue_selected_month)}
        />
        <Kpi
          icon={<DollarSign size={16} />}
          label="Ticket médio"
          value={loading ? '—' : formatCurrency(data?.summary.avg_ticket_selected_month)}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3 text-xs text-muted">
        <CalendarClock size={14} className="text-gold" />
        {data?.schedule_note ?? 'Terças 08:00'}
        <span className="text-border">·</span>
        Fonte: {data?.source === 'mock' ? 'preview (mock)' : 'Avec'} · relatórios{' '}
        {data?.avec_reports.return}/{data?.avec_reports.revenue}
        <span className="ml-auto flex flex-wrap gap-2">
          <ExportBtn
            onClick={() => download('csv-revenue', 'faturamento-ticket-profissionais.csv')}
            label="CSV fat + ticket"
          />
          <ExportBtn
            onClick={() => download('csv-return', 'retorno-clientes-trimestre.csv')}
            label="CSV retorno"
          />
          <ExportBtn
            onClick={() => download('csv-reactivation', 'lista-reativacao-por-profissional.csv')}
            label="CSV reativação"
          />
        </span>
      </div>

      <SectionCard
        title="0021 · Faturamento e ticket médio"
        badge={<CountBadge value={String(selectedRevenue.length)} tone="gold" />}
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
                <th className="py-2 pr-3 font-medium">Profissional</th>
                <th className="py-2 pr-3 font-medium">Faturamento</th>
                <th className="py-2 pr-3 font-medium">Ticket médio</th>
                <th className="py-2 font-medium">Atendimentos</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={4} className="py-6 text-muted">
                    Carregando…
                  </td>
                </tr>
              )}
              {!loading &&
                selectedRevenue.map(({ pro, row }) => (
                  <tr key={pro.id} className="border-b border-border/60">
                    <td className="py-3 pr-3 font-medium">{pro.name}</td>
                    <td className="py-3 pr-3 tabular-nums text-gold">
                      {formatCurrency(row?.revenue)}
                    </td>
                    <td className="py-3 pr-3 tabular-nums">{formatCurrency(row?.ticket_avg)}</td>
                    <td className="py-3 tabular-nums text-muted">{row?.attended ?? '—'}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        {!loading && selectedRevenue[0] && (
          <p className="mt-3 text-xs text-muted">
            Série completa (ex. {selectedRevenue[0].pro.name}):{' '}
            {selectedRevenue[0].months
              .slice(-6)
              .map((m) => `${m.label} ${formatCurrency(m.revenue)}`)
              .join(' · ')}
          </p>
        )}
      </SectionCard>

      <SectionCard
        title="0011 · Retorno de clientes (trimestre)"
        badge={<CountBadge value={String(selectedReturn.length)} tone="gold" />}
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
                <th className="py-2 pr-3 font-medium">Profissional</th>
                <th className="py-2 pr-3 font-medium">Trimestre</th>
                <th className="py-2 pr-3 font-medium">Taxa retorno</th>
                <th className="py-2 pr-3 font-medium">vs comparativo</th>
                <th className="py-2 font-medium">Clientes p/ reativar</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={5} className="py-6 text-muted">
                    Carregando…
                  </td>
                </tr>
              )}
              {!loading &&
                selectedReturn.map(({ pro, sel, cmp, reactivation }) => {
                  const delta =
                    sel && cmp
                      ? Math.round((sel.return_rate - cmp.return_rate) * 1000) / 10
                      : null
                  return (
                    <tr key={pro.id} className="border-b border-border/60">
                      <td className="py-3 pr-3 font-medium">{pro.name}</td>
                      <td className="py-3 pr-3 text-muted">{sel?.label ?? '—'}</td>
                      <td className="py-3 pr-3 tabular-nums text-gold">
                        {formatPercent(sel?.return_rate, 1)}
                      </td>
                      <td
                        className={`py-3 pr-3 tabular-nums ${
                          delta != null && delta < 0 ? 'text-danger' : 'text-success'
                        }`}
                      >
                        {delta == null ? '—' : `${delta > 0 ? '+' : ''}${delta} p.p.`}
                        <span className="ml-1 text-xs text-muted">
                          ({formatPercent(cmp?.return_rate, 1)})
                        </span>
                      </td>
                      <td className="py-3 tabular-nums">{reactivation.length}</td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard title="Ações · lista de reativação por profissional">
        <div className="space-y-4">
          {(proId
            ? selectedReturn.filter((r) => r.pro.id === proId)
            : selectedReturn.slice(0, 3)
          ).map(({ pro, reactivation }) => (
            <div key={pro.id} className="rounded-2xl border border-border bg-surface/50 p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="font-medium">{pro.name}</p>
                <CountBadge value={String(reactivation.length)} tone="gold" />
              </div>
              <ul className="space-y-2 text-sm">
                {reactivation.map((c, i) => (
                  <li
                    key={`${pro.id}-${i}`}
                    className="flex flex-col gap-0.5 border-b border-border/50 pb-2 last:border-0 sm:flex-row sm:items-baseline sm:justify-between"
                  >
                    <span>
                      <span className="font-medium">{c.name}</span>
                      <span className="text-muted"> · {c.days_since}d sem vir</span>
                    </span>
                    <span className="text-xs text-muted">{c.suggested_action}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {!proId && (
            <p className="text-xs text-muted">
              Mostrando 3 profissionais. Filtre um profissional ou baixe o CSV completo de reativação.
            </p>
          )}
        </div>
      </SectionCard>

      <div className="flex flex-wrap gap-3">
        <PrimaryButton
          type="button"
          onClick={async () => {
            const res = await apiFetch('/api/director-report', { method: 'POST' })
            const json = await res.json()
            alert(json.data?.note ?? json.error ?? 'OK')
          }}
        >
          Simular envio semanal
        </PrimaryButton>
        <p className="self-center text-xs text-muted">
          Cron: terça 08:00 · POST /api/director-report com CRON_SECRET
        </p>
      </div>
    </main>
  )
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs uppercase tracking-wide text-muted">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-gold"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function Kpi({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-xs text-muted">
        <span className="text-gold">{icon}</span>
        {label}
      </div>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
    </div>
  )
}

function ExportBtn({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[0.65rem] text-foreground hover:border-gold/40 hover:text-gold"
    >
      <Download size={12} />
      {label}
    </button>
  )
}
