'use client'

import { useCallback, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, Download, FileText, RefreshCw } from 'lucide-react'
import { MonthYearField } from '../_components/MonthYearField'
import { SectionCard } from '../_components/ui'
import { apiFetch } from '@/lib/api-client'
import { useClientLoader } from '@/lib/use-client-loader'
import { getBrand } from '@/lib/brand'
import { formatCurrency, formatPercentPoints, todayIso } from '@/lib/salon/format'
import { momCompareLine } from '@/lib/salon/mom-delta'
import {
  buildMonthOverviewCsv,
  buildMonthOverviewPrintHtml,
  downloadTextFile,
  openPrintHtml,
} from '@/lib/salon/month-overview-export'
import type { MonthOverview } from '@/lib/salon/month-overview'
import type { AvecSyncMeta } from '@/lib/avec/sync-meta-surface'
import { isRelatoriosStale, relatoriosSyncStaleMessage } from '@/lib/avec/sync-meta-surface'

function currentMonthKey() {
  return todayIso().slice(0, 7)
}

type OverviewPayload = MonthOverview & { sync?: AvecSyncMeta }

export default function RelatoriosOverviewPage() {
  const brand = getBrand()
  const [month, setMonth] = useState(currentMonthKey)
  const [data, setData] = useState<OverviewPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [exporting, setExporting] = useState<'csv' | 'pdf' | null>(null)

  const load = useCallback(async (opts?: { materialize?: boolean; reset?: boolean }) => {
    if (opts?.reset || opts?.materialize) {
      setLoading(true)
      setError(null)
    }
    try {
      const q = new URLSearchParams({ month })
      // Leitura rápida por padrão; "Atualizar fechamento" rematerializa o mês.
      if (opts?.materialize) q.set('materialize', '1')
      // Leitura rápida (~45s); "Atualizar fechamento" pode chegar perto do maxDuration 300s.
      const res = await apiFetch(`/api/relatorios/overview?${q}`, {
        cache: 'no-store',
        timeoutMs: opts?.materialize ? 280_000 : 45_000,
      })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      setData(json.data as OverviewPayload)
    } catch (e) {
      setData(null)
      const msg = e instanceof Error ? e.message : String(e)
      setError(
        msg === 'Timeout' || (e instanceof DOMException && e.name === 'AbortError')
          ? opts?.materialize
            ? 'Atualizar fechamento demorou demais — tente de novo em 1–2 min.'
            : 'Overview demorou demais — tente Atualizar fechamento ou outro mês.'
          : msg,
      )
    } finally {
      setLoading(false)
    }
  }, [month])

  useClientLoader(() => void load(), [load])

  function exportCsv() {
    if (!data) return
    setExporting('csv')
    try {
      downloadTextFile(`overview_${data.month}_${data.panel}.csv`, buildMonthOverviewCsv(data))
    } finally {
      setExporting(null)
    }
  }

  function exportPdf() {
    if (!data) return
    setExporting('pdf')
    try {
      const ok = openPrintHtml(buildMonthOverviewPrintHtml(data))
      if (!ok) setError('Permita pop-ups para gerar o PDF (imprimir / salvar como PDF).')
    } finally {
      setExporting(null)
    }
  }

  const incomplete = data?.completeness.status === 'incomplete'
  const inProgress = data?.completeness.status === 'in_progress'

  return (
    <main className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-6 px-5 py-6 lg:px-8 lg:py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[0.65rem] uppercase tracking-[0.25em] text-gold">Relatórios</p>
          <h1 className="mt-1 text-xl font-semibold lg:text-2xl">Overview do mês</h1>
          <p className="mt-1 max-w-xl text-sm text-muted">
            Fechamento oficial {brand.displayName} — dados acumulados no ROM (não Avec ao vivo).
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[0.65rem] uppercase tracking-wide text-muted">Mês</span>
            <MonthYearField
              value={month}
              onChange={(m) => {
                setLoading(true)
                setError(null)
                setMonth(m)
              }}
              aria-label="Mês do overview"
            />
          </label>
          <button
            type="button"
            onClick={() => void load({ materialize: true })}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm text-muted hover:bg-card disabled:opacity-50"
          >
            <RefreshCw size={14} /> Atualizar fechamento
          </button>
          <button
            type="button"
            onClick={exportCsv}
            disabled={!data || exporting !== null}
            className="inline-flex items-center gap-2 rounded-xl border border-gold/40 bg-gold/10 px-3 py-2 text-sm text-gold disabled:opacity-50"
          >
            <Download size={14} /> CSV
          </button>
          <button
            type="button"
            onClick={exportPdf}
            disabled={!data || exporting !== null}
            className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm disabled:opacity-50"
          >
            <FileText size={14} /> PDF
          </button>
        </div>
      </div>

      {error && (
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </p>
      )}

      {data?.sync && (isRelatoriosStale(data.sync) || data.sync.status === 'partial' || data.sync.status === 'error') && (
        <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          {isRelatoriosStale(data.sync)
            ? relatoriosSyncStaleMessage(data.sync)
            : data.sync.status === 'partial'
              ? 'Último sync Avec parcial — confira Admin.'
              : 'Último sync Avec com erro — confira Admin.'}
        </p>
      )}

      {data && data.analytics.mtd && (data.closing.revenue == null || data.closing.revenue <= 0) && (
        <p className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted">
          Aguardando faturamento pago no Avec neste mês — receita, fluxo e MoM aparecem quando houver
          caixa conhecido. Não é falha de sync de agenda.
        </p>
      )}

      {loading && !data ? (
        <p className="text-sm text-muted">Carregando overview…</p>
      ) : data ? (
        <>
          <div
            className={`flex flex-wrap items-start gap-3 rounded-xl border px-4 py-3 text-sm ${
              incomplete
                ? 'border-amber-500/40 bg-amber-500/10 text-amber-100'
                : inProgress
                  ? 'border-border bg-card text-muted'
                  : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100'
            }`}
          >
            {incomplete && <AlertTriangle size={18} className="mt-0.5 shrink-0" />}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-foreground">Status: {data.status_label}</span>
                <span className="rounded-full border border-border px-2.5 py-1 text-[0.65rem] font-semibold text-muted">
                  {data.completeness.days_present}/{data.completeness.days_expected} dias
                </span>
              </div>
              <p className="mt-1 text-xs opacity-90">
                Checado até {data.completeness.check_through}.{' '}
                {incomplete
                  ? `Faltam métricas em: ${data.completeness.days_missing.slice(0, 12).join(', ')}${
                      data.completeness.days_missing.length > 12 ? '…' : ''
                    }`
                  : inProgress
                    ? 'Mês em andamento — o fechamento completa no último dia.'
                    : 'Mês sem buracos no acumulado diário ROM.'}
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {([
              {
                label: 'Receita',
                value:
                  data.closing.revenue != null && data.closing.revenue > 0
                    ? formatCurrency(data.closing.revenue)
                    : data.closing.revenue === 0
                      ? data.analytics.mtd
                        ? 'aguardando caixa'
                        : 'sem receita'
                      : data.analytics.mtd
                        ? 'aguardando caixa'
                        : '—',
                compare: momCompareLine(
                  data.closing.revenue > 0 ? data.closing.revenue : null,
                  data.previous_closing.revenue > 0 ? data.previous_closing.revenue : null,
                  data.previous_label,
                ),
              },
              {
                label: 'Atendidos',
                value:
                  data.closing.attended != null && data.closing.attended > 0
                    ? String(data.closing.attended)
                    : data.analytics.mtd && data.closing.revenue <= 0
                      ? 'aguardando caixa'
                      : String(data.closing.attended ?? '—'),
                compare: momCompareLine(
                  data.closing.attended,
                  data.previous_closing.attended,
                  data.previous_label,
                  { kind: 'number' },
                ),
              },
              {
                label: 'Ticket',
                value:
                  data.closing.ticket_avg != null
                    ? formatCurrency(data.closing.ticket_avg)
                    : '—',
                compare:
                  data.closing.ticket_avg != null && data.previous_closing.ticket_avg != null
                    ? momCompareLine(
                        data.closing.ticket_avg,
                        data.previous_closing.ticket_avg,
                        data.previous_label,
                      )
                    : null,
              },
              {
                label: 'Fluxo',
                value:
                  data.closing.cash_flow != null && data.closing.revenue > 0
                    ? formatCurrency(data.closing.cash_flow)
                    : data.analytics.mtd && data.closing.revenue <= 0
                      ? 'aguardando caixa'
                      : data.closing.cash_flow != null
                        ? formatCurrency(data.closing.cash_flow)
                        : '—',
                compare: momCompareLine(
                  data.closing.revenue > 0 ? data.closing.cash_flow : null,
                  data.previous_closing.revenue > 0 ? data.previous_closing.cash_flow : null,
                  data.previous_label,
                ),
              },
              {
                label: 'Despesas',
                value: formatCurrency(data.closing.expenses),
                compare: momCompareLine(
                  data.closing.expenses,
                  data.previous_closing.expenses,
                  data.previous_label,
                  { invertGood: true },
                ),
              },
              {
                label: 'CMV',
                value: formatCurrency(data.closing.cmv),
                compare: momCompareLine(
                  data.closing.cmv,
                  data.previous_closing.cmv,
                  data.previous_label,
                  { invertGood: true },
                ),
              },
              {
                label: 'Cancelamentos',
                value: String(data.closing.cancelled),
                compare: momCompareLine(
                  data.closing.cancelled,
                  data.previous_closing.cancelled,
                  data.previous_label,
                  { kind: 'number', invertGood: true },
                ),
              },
              {
                label: 'No-shows',
                value: String(data.closing.no_shows),
                compare: momCompareLine(
                  data.closing.no_shows,
                  data.previous_closing.no_shows,
                  data.previous_label,
                  { kind: 'number', invertGood: true },
                ),
              },
            ] as const).map((kpi) => (
              <div key={kpi.label} className="rounded-xl border border-border bg-card px-4 py-3">
                <p className="text-[0.65rem] uppercase tracking-wide text-muted">{kpi.label}</p>
                <p className="mt-1 text-lg font-semibold tabular-nums leading-tight">{kpi.value}</p>
                {kpi.compare ? (
                  <p
                    className={`mt-1.5 text-[0.7rem] font-medium leading-snug ${
                      kpi.compare.positive ? 'text-success' : 'text-warning'
                    }`}
                  >
                    {kpi.compare.text}
                  </p>
                ) : null}
              </div>
            ))}
          </div>

          <p className="text-xs text-muted">
            Comparativo vs {data.previous_label} (mesmo recorte MTD quando o mês atual está em
            andamento). Verde = melhor · laranja = pior (em despesas/CMV/cancel/no-show, cair é
            melhor).
          </p>

          <div className="grid gap-4 lg:grid-cols-2">
            <SectionCard title="Operação (Visão analítica)">
              <ul className="flex flex-col gap-2 text-sm">
                <li className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-muted">Ocupação média</span>
                  <span className="text-right">
                    <span className="tabular-nums">
                      {data.analytics.occupancy_avg != null
                        ? formatPercentPoints(data.analytics.occupancy_avg * 100)
                        : '—'}
                    </span>
                    {data.analytics.occupancy_avg != null &&
                    data.previous_closing.occupancy_avg != null ? (
                      <span
                        className={`ml-2 text-[0.7rem] font-medium ${
                          data.analytics.occupancy_avg - data.previous_closing.occupancy_avg >= 0
                            ? 'text-success'
                            : 'text-warning'
                        }`}
                      >
                        {
                          momCompareLine(
                            data.analytics.occupancy_avg * 100,
                            data.previous_closing.occupancy_avg * 100,
                            data.previous_label,
                            { kind: 'points' },
                          )?.text
                        }
                      </span>
                    ) : null}
                  </span>
                </li>
                <li className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-muted">Receita perdida (est.)</span>
                  <span className="text-right">
                    <span className="tabular-nums">{formatCurrency(data.analytics.lost_revenue)}</span>
                    {(() => {
                      const c = momCompareLine(
                        data.analytics.lost_revenue,
                        data.previous_closing.lost_revenue,
                        data.previous_label,
                        { invertGood: true },
                      )
                      return c ? (
                        <span
                          className={`ml-2 text-[0.7rem] font-medium ${
                            c.positive ? 'text-success' : 'text-warning'
                          }`}
                        >
                          {c.text}
                        </span>
                      ) : null
                    })()}
                  </span>
                </li>
                <li className="flex justify-between gap-3">
                  <span className="text-muted">Pacotes / receita</span>
                  <span className="tabular-nums">
                    {data.analytics.packages_sold} · {formatCurrency(data.analytics.packages_revenue)}
                  </span>
                </li>
                <li className="flex justify-between gap-3">
                  <span className="text-muted">Retorno / 1ª visita</span>
                  <span className="tabular-nums">
                    {data.analytics.return_rate != null
                      ? formatPercentPoints(data.analytics.return_rate * 100, 0)
                      : '—'}{' '}
                    · {data.analytics.new_clients_period}
                  </span>
                </li>
                <li className="text-xs text-muted">
                  Snapshot ops: {data.analytics.snapshot_day ?? '—'} (Avec P1–P3 do mês, não soma
                  diária). Retorno — = sem cohort confiável no ROM para o mês. Pacotes/retorno/1ª visita
                  sem delta MoM (janela Avec, não acumulado mensal ROM).
                </li>
              </ul>
            </SectionCard>

            <SectionCard title="Fontes">
              <ul className="flex flex-col gap-2 text-xs text-muted">
                {data.source_notes.map((n) => (
                  <li key={n.field}>
                    <span className="font-medium text-foreground">{n.field}</span>
                    <span className="mx-1 text-gold">{n.source}</span>
                    — {n.note}
                  </li>
                ))}
              </ul>
            </SectionCard>
          </div>

          <p className="text-xs text-muted">
            Caixa detalhado:{' '}
            <Link href="/financeiro" className="text-gold hover:underline">
              Financeiro
            </Link>
            {' · '}
            Relatório gerência (Avec 0011 / 0021):{' '}
            <Link href="/admin/relatorio-diretoria" className="text-gold hover:underline">
              abrir
            </Link>
          </p>
        </>
      ) : null}
    </main>
  )
}
