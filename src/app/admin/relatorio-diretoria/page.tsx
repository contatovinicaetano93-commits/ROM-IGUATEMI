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

type StageTab = '0011' | '0021'

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
  const [tab, setTab] = useState<StageTab>('0011')
  const [month, setMonth] = useState('2026-03')
  const [compareMonth, setCompareMonth] = useState('2026-02')
  /** 0021: false = só o mês selecionado (sem Δ) */
  const [compareMonths, setCompareMonths] = useState(true)
  const [quarter, setQuarter] = useState('2026-Q1')
  const [compare, setCompare] = useState('2025-Q1')
  const [proId, setProId] = useState('')
  const [data, setData] = useState<DirectorReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const q = new URLSearchParams({
        month,
        compare_month: compareMonth,
        compare_months: compareMonths ? '1' : '0',
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
  }, [month, compareMonth, compareMonths, quarter, compare, proId])

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

  /** Ordem cronológica dos dois meses (mais antigo → mais recente). */
  const monthPair = useMemo(() => {
    if (!compareMonths) return { older: month, newer: month }
    return month <= compareMonth
      ? { older: month, newer: compareMonth }
      : { older: compareMonth, newer: month }
  }, [month, compareMonth, compareMonths])

  const selectedRevenue = useMemo(() => {
    if (!data) return []
    return data.revenue_blocks
      .map((b) => {
        const older = b.months.find((m) => m.month === monthPair.older)
        const newer = b.months.find((m) => m.month === monthPair.newer)
        const focus = b.months.find((m) => m.month === month)
        return { pro: b.professional, older, newer, focus, months: b.months }
      })
      .sort((a, b) => {
        if (compareMonths) return (b.newer?.revenue ?? 0) - (a.newer?.revenue ?? 0)
        return (b.focus?.revenue ?? 0) - (a.focus?.revenue ?? 0)
      })
  }, [data, monthPair, month, compareMonths])

  async function download(format: string, filename: string) {
    const q = new URLSearchParams({
      format,
      month,
      compare_month: compareMonth,
      compare_months: compareMonths ? '1' : '0',
      quarter,
      compare,
      mock: '1',
    })
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

  async function sendStage(stage: StageTab | 'all') {
    setSending(true)
    try {
      const res = await apiFetch('/api/director-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mock: true,
          stage,
          month,
          compare_month: compareMonth,
          compare_months: compareMonths,
          quarter,
          compare,
        }),
      })
      const json = await res.json()
      if (json.error) {
        alert(json.error)
        return
      }
      alert(json.data?.note ?? 'Enviado')
    } finally {
      setSending(false)
    }
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
            Duas etapas: <span className="text-foreground">0011</span> trimestre vs trimestre ·{' '}
            <span className="text-foreground">0021</span> mês vs mês.
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

      {/* Tabs etapas */}
      <div className="flex flex-wrap gap-2">
        <StageTabBtn
          active={tab === '0011'}
          onClick={() => setTab('0011')}
          label="Etapa 1 · 0011"
          hint="Trimestre vs trimestre"
        />
        <StageTabBtn
          active={tab === '0021'}
          onClick={() => setTab('0021')}
          label="Etapa 2 · 0021"
          hint="Mês vs mês"
        />
      </div>

      <label className="flex max-w-sm flex-col gap-1.5">
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

      {tab === '0011' && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <FilterSelect
              label="Trimestre (0011)"
              value={quarter}
              onChange={setQuarter}
              options={QUARTERS}
            />
            <FilterSelect
              label="Comparar com trimestre"
              value={compare}
              onChange={setCompare}
              options={QUARTERS}
            />
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
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
              icon={<CalendarClock size={16} />}
              label="Comparativo"
              value={data?.period.label_0011 ?? '—'}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3 text-xs text-muted">
            <span className="text-foreground">
              Etapa 1 · {data?.period.label_0011 ?? '…'} · ref. {data?.period.reference_date ?? '—'}
            </span>
            <span className="ml-auto flex flex-wrap gap-2">
              <ExportBtn
                onClick={() => download('csv-return-compare', '0011-comparativo-trimestre.csv')}
                label="CSV comparativo"
              />
              <ExportBtn
                onClick={() => download('csv-reactivation', '0011-lista-clientes.csv')}
                label="CSV lista clientes"
              />
            </span>
          </div>

          <SectionCard
            title="0011 · Comparativo trimestre a trimestre"
            badge={<CountBadge value={String(selectedReturn.length)} tone="gold" />}
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
                    <th className="py-2 pr-3 font-medium">Profissional</th>
                    <th className="py-2 pr-3 font-medium">{quarter}</th>
                    <th className="py-2 pr-3 font-medium">{compare}</th>
                    <th className="py-2 pr-3 font-medium">Δ</th>
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
                          <td className="py-3 pr-3 tabular-nums text-gold">
                            {formatPercent(sel?.return_rate, 1)}
                          </td>
                          <td className="py-3 pr-3 tabular-nums">
                            {formatPercent(cmp?.return_rate, 1)}
                          </td>
                          <td
                            className={`py-3 pr-3 tabular-nums ${
                              delta != null && delta < 0 ? 'text-danger' : 'text-success'
                            }`}
                          >
                            {delta == null ? '—' : `${delta > 0 ? '+' : ''}${delta} p.p.`}
                          </td>
                          <td className="py-3 tabular-nums">{reactivation.length}</td>
                        </tr>
                      )
                    })}
                </tbody>
              </table>
            </div>
          </SectionCard>

          <SectionCard title="0011 · Lista de clientes (formato Avec)">
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
                    {reactivation.slice(0, 12).map((c, i) => (
                      <li
                        key={`${pro.id}-${i}`}
                        className="flex flex-col gap-0.5 border-b border-border/50 pb-2 last:border-0"
                      >
                        <span className="font-medium">{c.name}</span>
                        <span className="text-xs text-muted">
                          {[c.mobile || c.phone, c.email, c.last_visit && `última ${c.last_visit}`]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </li>
                    ))}
                    {reactivation.length > 12 && (
                      <li className="text-xs text-muted">
                        + {reactivation.length - 12} na lista (baixe o CSV)
                      </li>
                    )}
                  </ul>
                </div>
              ))}
            </div>
          </SectionCard>

          <PrimaryButton type="button" disabled={sending} onClick={() => sendStage('0011')}>
            {sending ? 'Enviando…' : 'Enviar etapa 1 (0011) por e-mail'}
          </PrimaryButton>
        </>
      )}

      {tab === '0021' && (
        <>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setCompareMonths(false)}
              className={`rounded-2xl border px-4 py-2.5 text-sm font-medium ${
                !compareMonths
                  ? 'border-gold/50 bg-gold/10 text-gold'
                  : 'border-border text-muted hover:text-foreground'
              }`}
            >
              Só um mês
            </button>
            <button
              type="button"
              onClick={() => setCompareMonths(true)}
              className={`rounded-2xl border px-4 py-2.5 text-sm font-medium ${
                compareMonths
                  ? 'border-gold/50 bg-gold/10 text-gold'
                  : 'border-border text-muted hover:text-foreground'
              }`}
            >
              Comparar dois meses
            </button>
          </div>

          <div className={`grid gap-3 ${compareMonths ? 'sm:grid-cols-2' : 'sm:grid-cols-1 max-w-sm'}`}>
            <FilterSelect
              label={compareMonths ? 'Mês A' : 'Mês (0021)'}
              value={month}
              onChange={setMonth}
              options={MONTHS}
            />
            {compareMonths && (
              <FilterSelect
                label="Mês B"
                value={compareMonth}
                onChange={setCompareMonth}
                options={MONTHS}
              />
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
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
            <Kpi
              icon={<CalendarClock size={16} />}
              label={compareMonths ? 'Comparativo' : 'Período'}
              value={data?.period.label_0021 ?? '—'}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3 text-xs text-muted">
            <span className="text-foreground">
              Etapa 2 · {data?.period.label_0021 ?? '…'} · ref. {data?.period.reference_date ?? '—'}
              {compareMonths && (
                <span className="ml-1 text-muted">
                  (Δ = {monthPair.newer} − {monthPair.older})
                </span>
              )}
            </span>
            <span className="ml-auto flex flex-wrap gap-2">
              {compareMonths ? (
                <ExportBtn
                  onClick={() => download('csv-revenue-compare', '0021-comparativo-mes.csv')}
                  label="CSV comparativo"
                />
              ) : (
                <ExportBtn
                  onClick={() => download('csv-revenue', '0021-mes.csv')}
                  label="CSV do mês"
                />
              )}
            </span>
          </div>

          <SectionCard
            title={
              compareMonths
                ? '0021 · Comparativo mês a mês (faturamento + ticket)'
                : '0021 · Faturamento e ticket do mês'
            }
            badge={<CountBadge value={String(selectedRevenue.length)} tone="gold" />}
          >
            <div className="overflow-x-auto">
              {compareMonths ? (
                <table className="w-full min-w-[800px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
                      <th className="py-2 pr-3 font-medium">Profissional</th>
                      <th className="py-2 pr-3 font-medium">Fat {monthPair.older}</th>
                      <th className="py-2 pr-3 font-medium">Ticket {monthPair.older}</th>
                      <th className="py-2 pr-3 font-medium">Fat {monthPair.newer}</th>
                      <th className="py-2 pr-3 font-medium">Ticket {monthPair.newer}</th>
                      <th className="py-2 font-medium">Δ Fat</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading && (
                      <tr>
                        <td colSpan={6} className="py-6 text-muted">
                          Carregando…
                        </td>
                      </tr>
                    )}
                    {!loading &&
                      selectedRevenue.map(({ pro, older, newer }) => {
                        const delta = (newer?.revenue ?? 0) - (older?.revenue ?? 0)
                        return (
                          <tr key={pro.id} className="border-b border-border/60">
                            <td className="py-3 pr-3 font-medium">{pro.name}</td>
                            <td className="py-3 pr-3 tabular-nums">
                              {formatCurrency(older?.revenue)}
                            </td>
                            <td className="py-3 pr-3 tabular-nums">
                              {formatCurrency(older?.ticket_avg)}
                            </td>
                            <td className="py-3 pr-3 tabular-nums text-gold">
                              {formatCurrency(newer?.revenue)}
                            </td>
                            <td className="py-3 pr-3 tabular-nums">
                              {formatCurrency(newer?.ticket_avg)}
                            </td>
                            <td
                              className={`py-3 tabular-nums ${
                                delta < 0 ? 'text-danger' : 'text-success'
                              }`}
                            >
                              {formatCurrency(delta)}
                            </td>
                          </tr>
                        )
                      })}
                  </tbody>
                </table>
              ) : (
                <table className="w-full min-w-[560px] text-left text-sm">
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
                      selectedRevenue.map(({ pro, focus }) => (
                        <tr key={pro.id} className="border-b border-border/60">
                          <td className="py-3 pr-3 font-medium">{pro.name}</td>
                          <td className="py-3 pr-3 tabular-nums text-gold">
                            {formatCurrency(focus?.revenue)}
                          </td>
                          <td className="py-3 pr-3 tabular-nums">
                            {formatCurrency(focus?.ticket_avg)}
                          </td>
                          <td className="py-3 tabular-nums text-muted">
                            {focus?.attended ?? '—'}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              )}
            </div>
          </SectionCard>

          <PrimaryButton type="button" disabled={sending} onClick={() => sendStage('0021')}>
            {sending ? 'Enviando…' : 'Enviar etapa 2 (0021) por e-mail'}
          </PrimaryButton>
        </>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
        <PrimaryButton type="button" disabled={sending} onClick={() => sendStage('all')}>
          {sending ? 'Enviando…' : 'Enviar as 2 etapas'}
        </PrimaryButton>
        <p className="text-xs text-muted">
          Destino: contato.vinicaetano93@gmail.com · 2 e-mails (0011 e 0021) com data do período
        </p>
      </div>
    </main>
  )
}

function StageTabBtn({
  active,
  onClick,
  label,
  hint,
}: {
  active: boolean
  onClick: () => void
  label: string
  hint: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl border px-4 py-3 text-left transition-colors ${
        active
          ? 'border-gold/50 bg-gold/10 text-gold'
          : 'border-border bg-card text-muted hover:border-gold/30 hover:text-foreground'
      }`}
    >
      <p className="text-sm font-semibold">{label}</p>
      <p className="text-[0.65rem] opacity-80">{hint}</p>
    </button>
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
      <p className="mt-1 text-lg font-semibold tabular-nums leading-snug">{value}</p>
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
