'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Area, AreaChart, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import {
  Layers,
  TrendingUp,
  Users,
  Sparkles,
  Clock,
  Trophy,
  Percent,
  AlertTriangle,
  Download,
  FileText,
  Package,
} from 'lucide-react'
import { SectionCard, CountBadge, CHANNEL_LABEL } from '../_components/ui'
import { MonthYearField } from '../_components/MonthYearField'
import { VisaoSection } from '../_components/VisaoSection'
import { formatCurrency, formatPercent, formatPercentPoints, todayIso } from '@/lib/salon/format'
import { momCompareLine } from '@/lib/salon/mom-delta'
import { yearAgoMonthKey } from '@/lib/salon/month-window'

import { apiFetch } from '@/lib/api-client'
import { getBrand } from '@/lib/brand'
import { visaoSyncFastInfoMessage, visaoSyncStaleMessage } from '@/lib/avec/sync-meta-surface'
import type { PeriodAnalytics } from '@/lib/salon/period-analytics'
import { buildContactsPerDayChart, contactKpiWindow } from '@/lib/salon/contact-kpi-chart'
import { displayServiceName, serviceTicketAvg } from '@/lib/salon/service-display'
import {
  buildPeriodAnalyticsCsv,
  buildPeriodAnalyticsPrintHtml,
  downloadTextFile,
  openPrintHtml,
} from '@/lib/salon/month-overview-export'

interface KpiData {
  byDay: { day: string; channel: string; contacts_count: number }[]
  byStatus: { status: string; contacts_count: number }[]
  conversion: {
    conversion_rate: number
    total_contacts: number
    funnel_contacts?: number
    imported_contacts?: number
  } | null
  window?: { from: string; to: string; days: number }
}

function aggregateByChannel(rows: KpiData['byDay']) {
  const map = new Map<string, number>()
  for (const row of rows) map.set(row.channel, (map.get(row.channel) ?? 0) + row.contacts_count)
  return Array.from(map.entries()).sort((a, b) => b[1] - a[1])
}

interface TmBucket {
  key: string
  label: string
  avgMinutes: number | null
  sampleCount: number
}

interface TmComparison {
  month: { current: TmBucket; previous: TmBucket }
  quarter: { current: TmBucket; previous: TmBucket }
}

interface ProfessionalRanking {
  name: string
  revenue: number
  attended: number
  ticket_avg: number
  occupancy: number | null
  delta: { revenue: number; attended: number; occupancy: number | null } | null
}

interface PerformanceData {
  reference_day: string | null
  compare_day: string | null
  compare_label?: string | null
  compare_mtd_aligned?: boolean
  professionals: ProfessionalRanking[]
}

export default function DashboardPage() {
  const brand = getBrand()
  const [month, setMonth] = useState(() => todayIso().slice(0, 7))
  const [compareMonth, setCompareMonth] = useState('')
  const [data, setData] = useState<KpiData | null>(null)
  const [tm, setTm] = useState<TmComparison | null>(null)
  const [performance, setPerformance] = useState<PerformanceData | null>(null)
  const [period, setPeriod] = useState<(PeriodAnalytics & {
    sync?: {
      status: string | null
      created_at: string | null
      stale: boolean
      hint: string | null
      fast_stale?: boolean
      ops_stale?: boolean
      never_synced?: boolean
    }
  }) | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [warn, setWarn] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function loadDashboard() {
      try {
        setLoading(true)
        // Evita KPIs do mês anterior com rótulos do mês novo enquanto as requests resolvem.
        setTm(null)
        setPerformance(null)
        setPeriod(null)
        // Um lambda: evita waterfall de 4 rotas × pooler max:1.
        const q = new URLSearchParams({ month })
        if (compareMonth) q.set('compare', compareMonth)
        const dashRes = await apiFetch(`/api/kpis/dashboard?${q}`, {
          cache: 'no-store',
          timeoutMs: 100_000,
        })
        const raw = await dashRes.text()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let dashJson: { error?: string; data?: any }
        try {
          dashJson = raw ? (JSON.parse(raw) as typeof dashJson) : {}
        } catch {
          if (cancelled) return
          setError(
            dashRes.status === 504 || dashRes.status === 503
              ? 'Timeout ao carregar (banco/sync ocupado). Atualize em alguns segundos.'
              : `Resposta inválida da API (${dashRes.status || 'rede'}). Confirme se o banco está configurado.`,
          )
          setWarn(null)
          return
        }
        if (cancelled) return
        if (dashJson.error) {
          setError(dashJson.error)
          setWarn(null)
          return
        }

        const bundle = dashJson.data ?? {}
        setData(bundle.kpis ?? null)
        setTm(bundle.tm ?? null)
        setPerformance(bundle.performance ?? null)
        setPeriod(bundle.period ?? null)
        setError(null)

        const warnings: string[] = []
        const sync = bundle.period?.sync
        const visaoStaleMsg = sync ? visaoSyncStaleMessage(sync) : null
        const fastInfoMsg = sync ? visaoSyncFastInfoMessage(sync) : null
        if (visaoStaleMsg) {
          warnings.push(visaoStaleMsg)
        } else if (fastInfoMsg) {
          warnings.push(fastInfoMsg)
        } else if (sync?.status === 'partial') warnings.push('Último sync Avec parcial — confira Admin')
        else if (sync?.status === 'error') {
          const errMsg = typeof sync.error === 'string' ? sync.error.toLowerCase() : ''
          warnings.push(
            errMsg.includes('timeout') || errMsg.includes('abandoned') || errMsg.includes('interrompido')
              ? 'Último sync Avec interrompido por timeout (Vercel) — confira Admin / rode sync de novo'
              : 'Último sync Avec com erro — confira Admin',
          )
        }

        if (warnings.length) setWarn(warnings.join(' · '))
        else setWarn(null)
      } catch (e) {
        if (!cancelled) setError(String(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadDashboard()
    return () => {
      cancelled = true
    }
  }, [month, compareMonth])

  function exportPeriodCsv() {
    if (!period) return
    downloadTextFile(
      `visao_analitica_${period.month}_${brand.panel}.csv`,
      buildPeriodAnalyticsCsv(period, brand.displayName),
    )
  }

  function exportPeriodPdf() {
    if (!period) return
    const ok = openPrintHtml(buildPeriodAnalyticsPrintHtml(period, brand.displayName))
    if (!ok) setWarn('Permita pop-ups para gerar o PDF (imprimir / salvar como PDF).')
  }

  const funnelContacts = data?.conversion?.funnel_contacts ?? 0
  const importedContacts = data?.conversion?.imported_contacts ?? 0
  const totalContacts = data?.conversion?.total_contacts ?? 0
  const conversionRate = data?.conversion?.conversion_rate ?? 0
  const crmWindow = data?.window ?? contactKpiWindow(30)
  const chartData = data
    ? buildContactsPerDayChart(data.byDay, crmWindow.from, crmWindow.to).map((p) => ({
        day: p.label,
        total: p.total,
      }))
    : []
  const channelData = data ? aggregateByChannel(data.byDay) : []
  const activeChannels = new Set(data?.byDay.map((d) => d.channel)).size
  const channelTotal = channelData.reduce((s, [, v]) => s + v, 0)
  const leadsEntraramMes =
    data?.byDay.reduce((s, r) => s + (Number(r.contacts_count) || 0), 0) ?? 0
  const filaNovo = data?.byStatus.find((s) => s.status === 'novo')?.contacts_count ?? 0
  const topChannel = channelData[0]
  const snapshotHint = period?.snapshot_day
    ? `Snapshot do mês · Avec ${period.snapshot_day}`
    : 'Snapshot Avec do mês selecionado'

  return (
    <main className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-6 px-5 py-6 lg:gap-8 lg:px-8 lg:py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[0.65rem] uppercase tracking-[0.25em] text-gold">Visão analítica</p>
          <h1 className="mt-1 text-xl font-semibold lg:text-2xl">{brand.dashboardTitle}</h1>
          <p className="mt-1 text-xs text-muted">
            Salão no mês, clientes, mix, equipe e funil CRM. Comparativo padrão: mesmo mês do ano
            passado (mesmo dia se o mês estiver aberto). Operação do dia em Hoje · dinheiro em
            Financeiro · fechamento em Relatórios.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[0.65rem] uppercase tracking-wide text-muted">Mês</span>
            <MonthYearField value={month} onChange={setMonth} aria-label="Mês da visão analítica" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[0.65rem] uppercase tracking-wide text-muted">Comparar com</span>
            <MonthYearField
              value={compareMonth}
              onChange={setCompareMonth}
              allowEmpty
              emptyLabel="Automático (ano passado)"
              pickMonth={yearAgoMonthKey(month)}
              maxMonth={month}
              aria-label="Comparar com"
            />
          </label>
          <button
            type="button"
            onClick={exportPeriodCsv}
            disabled={!period}
            className="inline-flex items-center gap-2 rounded-xl border border-gold/40 bg-gold/10 px-3 py-2 text-sm text-gold disabled:opacity-50"
          >
            <Download size={14} /> CSV
          </button>
          <button
            type="button"
            onClick={exportPeriodPdf}
            disabled={!period}
            className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm disabled:opacity-50"
          >
            <FileText size={14} /> PDF
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-border bg-card px-4 py-3 text-sm text-muted">
          Não foi possível carregar os dados ({error}). Confirme se o banco está configurado.
        </div>
      )}

      {warn && !error && (
        <div className="rounded-2xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning">
          {warn}
        </div>
      )}

      {!loading && period?.previous ? (
        <p className="text-xs text-muted">
          Verde = melhor · laranja = pior · vs {period.previous.label}
          {period.mtd ? ` (recorte até dia ${Number(period.to.slice(8, 10))})` : ''}.
        </p>
      ) : period && !loading && period.revenue == null && period.mtd ? (
        <p className="text-xs text-muted">
          Aguardando faturamento pago no Avec neste mês — o comparativo aparece quando houver caixa.
        </p>
      ) : null}

      <VisaoSection
        title="Salão no mês"
        hint="Receita, atendidos e ticket acumulados no mês. Se o mês ainda está aberto, conta só até hoje."
      >
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">
          <InsightCard
            icon={<TrendingUp size={15} />}
            label={`Receita · ${period?.label ?? '—'}`}
            value={
              loading || !period
                ? '—'
                : period.revenue != null && period.revenue > 0
                  ? formatCurrency(period.revenue)
                  : period.revenue === 0
                    ? 'sem receita'
                    : period.mtd
                      ? 'aguardando caixa'
                      : 'sem dado'
            }
            compare={
              period?.previous?.label
                ? momCompareLine(period.revenue, period.previous.revenue, period.previous.label)
                : null
            }
          />
          <InsightCard
            icon={<Users size={15} />}
            label="Atendidos"
            value={
              loading || !period
                ? '—'
                : period.attended != null
                  ? String(period.attended)
                  : period.mtd
                    ? 'aguardando'
                    : 'sem dado'
            }
            compare={
              period?.previous?.label
                ? momCompareLine(period.attended, period.previous.attended, period.previous.label, {
                    kind: 'number',
                  })
                : null
            }
          />
          <InsightCard
            icon={<TrendingUp size={15} />}
            label="Ticket médio"
            value={
              loading || !period
                ? '—'
                : period.ticket_avg != null
                  ? formatCurrency(period.ticket_avg)
                  : 'sem ticket'
            }
            compare={
              period?.previous?.label
                ? momCompareLine(period.ticket_avg, period.previous.ticket_avg, period.previous.label)
                : null
            }
          />
          <InsightCard
            icon={<Users size={15} />}
            label="Cancel. + no-show"
            value={
              loading || !period ? '—' : String((period.cancelled ?? 0) + (period.no_shows ?? 0))
            }
            compare={
              period?.previous?.label
                ? momCompareLine(
                    (period.cancelled ?? 0) + (period.no_shows ?? 0),
                    period.previous.cancelled + period.previous.no_shows,
                    period.previous.label,
                    { kind: 'number', invertGood: true },
                  )
                : null
            }
          />
          <InsightCard
            icon={<AlertTriangle size={15} />}
            label="Receita perdida"
            value={
              loading || !period
                ? '—'
                : period.lost_revenue == null
                  ? period.ticket_avg == null
                    ? 'sem ticket'
                    : '—'
                  : formatCurrency(period.lost_revenue)
            }
            compare={
              period?.previous?.label
                ? momCompareLine(
                    period.lost_revenue,
                    period.previous.lost_revenue,
                    period.previous.label,
                    { invertGood: true },
                  )
                : null
            }
          />
        </div>
      </VisaoSection>

      <VisaoSection
        title="Clientes do salão"
        hint="Quem veio pela 1ª vez e quantos % dos clientes do período já tinham vindo antes. Não é lead do CRM. Tempo médio = da entrada no salão até o pagamento."
      >
        <div className="grid grid-cols-2 gap-3">
          <InsightCard
            icon={<Sparkles size={15} />}
            label="1ª visita no salão"
            value={
              loading || !period
                ? '—'
                : period.new_clients_period != null
                  ? String(period.new_clients_period)
                  : period.snapshot_missing
                    ? 'sem snapshot'
                    : '—'
            }
            compare={
              period?.previous?.label
                ? momCompareLine(
                    period.new_clients_period,
                    period.previous.new_clients_period,
                    period.previous.label,
                    { kind: 'number' },
                  )
                : null
            }
          />
          <InsightCard
            icon={<TrendingUp size={15} />}
            label="Taxa de retorno"
            value={
              loading || !period
                ? '—'
                : period.return_rate != null
                  ? formatPercentPoints(period.return_rate * 100, 0)
                  : period.snapshot_missing
                    ? 'sem snapshot'
                    : '—'
            }
            compare={
              period?.previous?.return_rate != null && period.return_rate != null && period.previous.label
                ? momCompareLine(
                    period.return_rate * 100,
                    period.previous.return_rate * 100,
                    period.previous.label,
                    { kind: 'points' },
                  )
                : null
            }
          />
        </div>
        <SectionCard title="Tempo médio de atendimento (TM)" badge={<Clock size={15} className="text-muted" />}>
          {loading ? (
            <div className="h-16 animate-pulse rounded-2xl bg-card" />
          ) : tm ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <TmCompareCol title="Mês" current={tm.month.current} previous={tm.month.previous} />
              <TmCompareCol
                title="Trimestre (vs mesmo tri ano passado)"
                current={tm.quarter.current}
                previous={tm.quarter.previous}
              />
            </div>
          ) : (
            <p className="text-xs text-muted">TM indisponível neste carregamento.</p>
          )}
          {!loading && tm && tm.month.current.sampleCount === 0 && tm.month.previous.sampleCount === 0 && (
            <p className="mt-4 text-xs text-muted">
              TM começa a acumular quando o sync vê a pessoa no salão (Em Atendimento /
              comanda / hora marcada já passou) e depois o 0051 só mostra Pago. Se ainda
              estiver aberta + um Pago antigo no mesmo dia, não fecha. Granularidade = intervalo
              do sync. Meses passados ficam em —.
            </p>
          )}
        </SectionCard>
      </VisaoSection>

      <VisaoSection
        title="Mix comercial"
        hint={`${snapshotHint} · Pacotes vendidos, serviços mais feitos, como o cliente conheceu o salão e canais de agenda.`}
      >
        <div className="max-w-sm">
          <InsightCard
            icon={<Package size={15} />}
            label="Pacotes vendidos"
            value={
              loading || !period
                ? '—'
                : period.packages_revenue != null
                  ? formatCurrency(period.packages_revenue)
                  : period.snapshot_missing
                    ? 'sem snapshot'
                    : '—'
            }
            compare={
              period?.previous?.label
                ? momCompareLine(
                    period.packages_revenue,
                    period.previous.packages_revenue,
                    period.previous.label,
                  )
                : null
            }
          />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <SectionCard title={`Pacotes · ${period?.label ?? '—'}`}>
            <p className="mb-2 text-xs text-muted">
              {period?.packages_sold != null ? `${period.packages_sold} vendidos` : '—'} ·{' '}
              {period ? formatCurrency(period.packages_revenue) : '—'}
            </p>
            {(period?.packages.length ?? 0) === 0 ? (
              <p className="text-xs text-muted">Sem pacotes no snapshot.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {period!.packages.map((pkg) => (
                  <li key={pkg.name} className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="truncate font-medium">{pkg.name}</span>
                    <span className="shrink-0 tabular-nums text-muted">
                      {formatCurrency(pkg.revenue)} · {pkg.quantity}×
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
          <SectionCard title="Top serviços">
            <p className="mb-2 text-xs text-muted">Faturamento real ÷ qtd (ticket), não preço de tabela.</p>
            {(period?.top_services.length ?? 0) === 0 ? (
              <p className="text-xs text-muted">Sem ranking sincronizado.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {period!.top_services.map((s) => {
                  const ticket = serviceTicketAvg(s.revenue, s.quantity)
                  return (
                    <li key={s.name} className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="truncate font-medium">{displayServiceName(s.name)}</span>
                      <span className="shrink-0 tabular-nums text-muted">
                        {formatCurrency(s.revenue)} · {s.quantity}×
                        {ticket != null ? ` · ticket ${formatCurrency(ticket)}` : ''}
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
          </SectionCard>
          <SectionCard title="Como nos conheceram">
            {(period?.acquisition.length ?? 0) === 0 ? (
              <p className="text-xs text-muted">Sem dados de aquisição.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {period!.acquisition.map((a) => (
                  <li key={a.channel} className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="truncate font-medium">{a.channel}</span>
                    <span className="shrink-0 tabular-nums text-muted">{a.clients}</span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
          <SectionCard title={`Canais de agenda · ${period?.label ?? '—'}`}>
            {(period?.booking_channels.length ?? 0) === 0 ? (
              <p className="text-xs text-muted">Sem canais sincronizados.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {period!.booking_channels.map((c) => (
                  <li key={c.channel} className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="truncate font-medium">{c.channel}</span>
                    <span className="shrink-0 tabular-nums text-muted">{c.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>
      </VisaoSection>

      <VisaoSection
        title="Equipe"
        hint="Lotação média da agenda por profissional e ranking de faturamento. Comparativo vs o mês escolhido no topo."
      >
        <div className="max-w-sm">
          <InsightCard
            icon={<Percent size={15} />}
            label={`Lotação da agenda · ${period?.label ?? '—'}`}
            hint="Média de quanto da agenda de cada profissional está preenchida no período."
            value={
              loading || !period
                ? '—'
                : period.occupancy_avg != null
                  ? formatPercentPoints(period.occupancy_avg * 100)
                  : '—'
            }
            compare={
              period?.previous?.occupancy_avg != null &&
              period.occupancy_avg != null &&
              period.previous.label
                ? momCompareLine(
                    (period.occupancy_avg ?? 0) * 100,
                    (period.previous.occupancy_avg ?? 0) * 100,
                    period.previous.label,
                    { kind: 'points' },
                  )
                : null
            }
          />
        </div>
        <SectionCard
          title={`Ranking de profissionais · ${period?.label ?? month}`}
          badge={<Trophy size={15} className="text-muted" />}
        >
          {!performance || performance.professionals.length === 0 ? (
            <p className="text-xs text-muted">
              Sem dado ainda — ranking e lotação da equipe vêm do sync Avec do mês. Detalhe em Relatórios.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <p className="mb-3 text-xs text-muted">
                Escopo: {period?.from ?? '—'} → {period?.to ?? '—'}
                {period?.mtd ? ' (mês em aberto · MTD)' : ' (mês fechado)'}
                {performance.reference_day ? ` · snapshot ${performance.reference_day}` : ''}
                {performance.compare_label ? ` · vs ${performance.compare_label}` : ''}
              </p>
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="text-left text-[0.65rem] uppercase tracking-wide text-muted">
                    <th className="pb-2 font-medium">#</th>
                    <th className="pb-2 font-medium">Profissional</th>
                    <th className="pb-2 font-medium">Faturamento</th>
                    <th className="pb-2 font-medium">Atendimentos</th>
                    <th className="pb-2 font-medium">Ticket médio</th>
                    <th className="pb-2 font-medium">Lotação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {performance.professionals.slice(0, 10).map((pro, i) => (
                    <tr key={pro.name}>
                      <td className="py-2 tabular-nums text-muted">{i + 1}</td>
                      <td className="py-2 font-medium text-foreground/90">{pro.name}</td>
                      <td className="py-2 tabular-nums">
                        <div className="flex flex-col gap-0.5">
                          <span>{formatCurrency(pro.revenue)}</span>
                          {pro.delta && <DeltaUnder value={pro.delta.revenue} suffix="" isCurrency />}
                        </div>
                      </td>
                      <td className="py-2 tabular-nums">
                        <div className="flex flex-col gap-0.5">
                          <span>{pro.attended}</span>
                          {pro.delta && <DeltaUnder value={pro.delta.attended} suffix="" />}
                        </div>
                      </td>
                      <td className="py-2 tabular-nums">{formatCurrency(pro.ticket_avg)}</td>
                      <td className="py-2 tabular-nums">
                        <div className="flex flex-col gap-0.5">
                          <span>{pro.occupancy != null ? formatPercent(pro.occupancy) : '—'}</span>
                          {pro.delta?.occupancy != null && (
                            <DeltaUnder value={Math.round(pro.delta.occupancy * 100)} suffix="pp" />
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </VisaoSection>

      <VisaoSection
        title="Funil CRM"
        hint="Leads novos que o ROM registrou (WhatsApp/manual) — não é cliente novo no salão nem importação em massa da Avec. O número grande = leads que entraram no mês. Fila Novo = ainda não puxado."
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="animate-rise rounded-2xl border border-gold/25 bg-gradient-to-b from-gold/10 to-card p-5">
            <p className="text-xs text-muted">Leads novos · entraram no CRM · {month}</p>
            {loading ? (
              <div className="mt-2 h-10 w-32 animate-pulse rounded-lg bg-border" />
            ) : (
              <p className="mt-1 text-4xl font-semibold tabular-nums">{leadsEntraramMes}</p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
              <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-xs font-semibold text-success">
                <TrendingUp size={13} />
                {(conversionRate * 100).toFixed(1)}%
              </span>
              <span className="text-xs text-muted">conversão no funil do mês (CRM)</span>
            </div>
            {!loading && (
              <p className="mt-2 text-[0.7rem] text-muted">
                Entrada no mês (funil CRM): {funnelContacts.toLocaleString('pt-BR')} ·
                importados Avec: {importedContacts.toLocaleString('pt-BR')} · total cadastrado:{' '}
                {totalContacts.toLocaleString('pt-BR')}
              </p>
            )}
          </div>
          <InsightCard
            icon={<Users size={15} />}
            label="Fila CRM · status Novo"
            value={loading ? '—' : String(filaNovo)}
            compare={
              !loading && filaNovo === 0
                ? {
                    text: 'Ninguém parado em Novo — leads do mês já foram puxados (agendado/convertido).',
                    positive: true,
                    muted: true,
                  }
                : null
            }
          />
          <InsightCard
            icon={<Layers size={15} />}
            label="Canais do funil CRM"
            value={loading ? '—' : String(activeChannels)}
          />
        </div>
        <SectionCard title={`Contatos por dia · ${month}`}>
          <p className="mb-2 text-xs text-muted">
            {crmWindow.from} → {crmWindow.to}. Exclui dump Avec / status importado.
          </p>
          <div className="h-52 lg:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 6, right: 6, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--gold)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--gold)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="day" stroke="var(--muted)" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis
                  stroke="var(--muted)"
                  fontSize={11}
                  allowDecimals={false}
                  tickLine={false}
                  axisLine={false}
                  width={28}
                />
                <Tooltip
                  contentStyle={{
                    background: 'var(--card-elevated)',
                    border: '1px solid var(--border)',
                    borderRadius: 12,
                    color: 'var(--foreground)',
                    fontSize: 12,
                  }}
                />
                <Area type="monotone" dataKey="total" stroke="var(--gold)" strokeWidth={2.5} fill="url(#gold)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>
        <SectionCard title={`Contatos por canal · ${month}`} badge={<CountBadge value={`${channelTotal}`} />}>
          {!loading && topChannel && channelTotal > 0 ? (
            <p className="mb-3 text-xs text-muted">
              <span className="font-semibold text-gold">{CHANNEL_LABEL[topChannel[0]] ?? topChannel[0]}</span>{' '}
              lidera entradas ({topChannel[1]} de {channelTotal}).
            </p>
          ) : null}
          <div className="divide-y divide-border">
            {channelData.map(([channel, count]) => (
              <div key={channel} className="flex items-center justify-between py-3 text-sm">
                <span className="text-foreground/90">{CHANNEL_LABEL[channel] ?? channel}</span>
                <span className="font-semibold tabular-nums text-gold">{count}</span>
              </div>
            ))}
            {channelData.length === 0 && (
              <p className="py-6 text-center text-sm text-muted">Nenhuma entrada de funil neste mês.</p>
            )}
          </div>
        </SectionCard>
        <p className="text-xs text-muted">
          Operação do dia:{' '}
          <Link href="/hoje" className="text-gold hover:underline">
            Hoje
          </Link>
          {' · '}
          Caixa:{' '}
          <Link href="/financeiro" className="text-gold hover:underline">
            Financeiro
          </Link>
          {' · '}
          Fechamento:{' '}
          <Link href="/relatorios" className="text-gold hover:underline">
            Relatórios
          </Link>
        </p>
      </VisaoSection>
    </main>
  )
}
function InsightCard({
  icon,
  label,
  value,
  compare,
  emphasize,
  hint,
}: {
  icon: React.ReactNode
  label: string
  value: string
  compare?: { text: string; positive: boolean; muted?: boolean } | null
  emphasize?: boolean
  hint?: string
}) {
  return (
    <div
      className={`min-w-0 overflow-hidden rounded-2xl border p-4 ${
        emphasize ? 'border-gold/30 bg-gradient-to-b from-gold/10 to-card' : 'border-border bg-card'
      }`}
    >
      <div className="mb-2 flex min-w-0 items-center gap-1.5 text-muted">
        <span className="shrink-0">{icon}</span>
        <span className="truncate text-[0.65rem] uppercase tracking-wide">{label}</span>
      </div>
      <p className="break-words text-[clamp(1rem,2.8vw,1.5rem)] font-semibold leading-tight tabular-nums">
        {value}
      </p>
      {hint ? <p className="mt-1 text-[0.65rem] leading-snug text-muted">{hint}</p> : null}
      {compare ? (
        <p
          className={`mt-1.5 break-words text-[0.7rem] leading-snug ${
            compare.muted
              ? 'text-muted'
              : compare.positive
                ? 'font-medium text-success'
                : 'font-medium text-warning'
          }`}
        >
          {compare.text}
        </p>
      ) : null}
    </div>
  )
}

function DeltaUnder({
  value,
  suffix,
  isCurrency,
}: {
  value: number | null | undefined
  suffix: string
  isCurrency?: boolean
}) {
  if (value == null || value === 0) return null
  const positive = value > 0
  const formatted = isCurrency ? formatCurrency(Math.abs(value)) : `${Math.abs(value)}${suffix}`
  return (
    <span className={`text-[0.65rem] font-semibold ${positive ? 'text-success' : 'text-warning'}`}>
      {positive ? '+' : '−'}
      {formatted}
    </span>
  )
}

function TmCompareCol({
  title,
  current,
  previous,
}: {
  title: string
  current: TmBucket
  previous: TmBucket
}) {
  const delta =
    current.avgMinutes != null && previous.avgMinutes != null
      ? Math.round((current.avgMinutes - previous.avgMinutes) * 10) / 10
      : null
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-[0.65rem] uppercase tracking-wide text-muted">{title}</p>
      <div className="mt-2 flex items-baseline gap-2">
        <p className="text-2xl font-semibold tabular-nums">
          {current.avgMinutes != null ? `${current.avgMinutes} min` : '—'}
        </p>
        <span className="text-xs text-muted">{current.label}</span>
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-muted">
        <span>
          vs {previous.label}: {previous.avgMinutes != null ? `${previous.avgMinutes} min` : '—'}
        </span>
        {delta != null && (
          <span className={delta <= 0 ? 'font-semibold text-success' : 'font-semibold text-warning'}>
            {delta > 0 ? '+' : ''}
            {delta} min
          </span>
        )}
      </div>
    </div>
  )
}
