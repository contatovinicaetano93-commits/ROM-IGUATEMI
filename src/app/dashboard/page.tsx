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
  Package,
  AlertTriangle,
  Download,
  FileText,
} from 'lucide-react'
import { SectionCard, CountBadge, StatusPill, CHANNEL_LABEL } from '../_components/ui'
import { MonthYearField } from '../_components/MonthYearField'
import { formatCurrency, formatPercent, formatPercentPoints, todayIso } from '@/lib/salon/format'

import { apiFetch } from '@/lib/api-client'
import { getBrand } from '@/lib/brand'
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
  professionals: ProfessionalRanking[]
}

export default function DashboardPage() {
  const brand = getBrand()
  const [month, setMonth] = useState(() => todayIso().slice(0, 7))
  const [data, setData] = useState<KpiData | null>(null)
  const [tm, setTm] = useState<TmComparison | null>(null)
  const [performance, setPerformance] = useState<PerformanceData | null>(null)
  const [period, setPeriod] = useState<PeriodAnalytics | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [warn, setWarn] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function loadDashboard() {
      try {
        setLoading(true)
        const kpisRes = await apiFetch('/api/kpis', { cache: 'no-store' })
        const kpisJson = await kpisRes.json()
        if (cancelled) return
        if (kpisJson.error) setError(kpisJson.error)
        else setData(kpisJson.data)

        const [tmRes, perfRes, periodRes] = await Promise.all([
          apiFetch('/api/kpis/tempo-medio', { cache: 'no-store' }),
          apiFetch('/api/kpis/performance', { cache: 'no-store' }),
          apiFetch(`/api/kpis/periodo?month=${month}`, { cache: 'no-store' }),
        ])
        if (cancelled) return

        const warnings: string[] = []

        try {
          const tmJson = await tmRes.json()
          if (tmJson.data) setTm(tmJson.data)
        } catch {
          // opcional
        }

        try {
          const perfJson = await perfRes.json()
          if (perfJson.data) setPerformance(perfJson.data)
        } catch {
          // opcional
        }

        try {
          const periodJson = await periodRes.json()
          if (periodJson.error) warnings.push(`Período: ${periodJson.error}`)
          else if (periodJson.data) setPeriod(periodJson.data)
        } catch {
          warnings.push('Analytics de período indisponível')
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
  }, [month])

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
  const statusTotal = data?.byStatus.reduce((s, r) => s + r.contacts_count, 0) ?? 0
  const channelTotal = channelData.reduce((s, [, v]) => s + v, 0)
  const novos = data?.byStatus.find((s) => s.status === 'novo')?.contacts_count ?? 0
  const topChannel = channelData[0]
  const snapshotHint = period?.snapshot_day
    ? `Avec snapshot ${period.snapshot_day} · janela ~30 dias`
    : 'Avec · janela ~30 dias'

  return (
    <main className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-6 px-5 py-6 lg:gap-8 lg:px-8 lg:py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[0.65rem] uppercase tracking-[0.25em] text-gold">Visão analítica</p>
          <h1 className="mt-1 text-xl font-semibold lg:text-2xl">{brand.dashboardTitle}</h1>
          <p className="mt-1 text-xs text-muted">
            Funil CRM real (sem dump Avec) + mês acumulado local + snapshots Avec ~30 dias. Operação do
            dia em Hoje · dinheiro em Financeiro · fechamento em Relatórios.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[0.65rem] uppercase tracking-wide text-muted">Mês</span>
            <MonthYearField value={month} onChange={setMonth} aria-label="Mês da visão analítica" />
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

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <MiniStat
          icon={<Percent size={15} />}
          label={`Ocupação · Avec 30d · ${period?.label ?? '—'}`}
          value={
            loading || !period
              ? '—'
              : period.occupancy_avg != null
                ? formatPercentPoints(period.occupancy_avg * 100)
                : '—'
          }
        />
        <MiniStat
          icon={<AlertTriangle size={15} />}
          label="Receita perdida · mês acum."
          value={loading || !period ? '—' : formatCurrency(period.lost_revenue)}
        />
        <MiniStat
          icon={<Users size={15} />}
          label="Cancel. + no-show · mês acum."
          value={
            loading || !period
              ? '—'
              : String((period.cancelled ?? 0) + (period.no_shows ?? 0))
          }
        />
        <MiniStat
          icon={<Package size={15} />}
          label="Pacotes · Avec 30d"
          value={loading || !period ? '—' : formatCurrency(period.packages_revenue)}
        />
        <MiniStat
          icon={<Sparkles size={15} />}
          label="Novos · Avec 30d"
          value={loading || !period ? '—' : String(period.new_clients_period)}
        />
        <MiniStat
          icon={<TrendingUp size={15} />}
          label="Retorno · Avec 30d"
          value={
            loading || !period
              ? '—'
              : period.return_rate != null
                ? formatPercentPoints(period.return_rate * 100, 0)
                : '—'
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-8">
        <div className="flex flex-col gap-6 lg:col-span-8 lg:gap-8">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="animate-rise rounded-2xl border border-gold/25 bg-gradient-to-b from-gold/10 to-card p-5 sm:col-span-2 lg:col-span-1">
              <p className="text-xs text-muted">Funil ativo (CRM · sem importado)</p>
              {loading ? (
                <div className="mt-2 h-10 w-32 animate-pulse rounded-lg bg-border" />
              ) : (
                <p className="mt-1 text-4xl font-semibold tabular-nums">{funnelContacts}</p>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-xs font-semibold text-success">
                  <TrendingUp size={13} />
                  {(conversionRate * 100).toFixed(1)}%
                </span>
                <span className="text-xs text-muted">conversão no funil</span>
              </div>
              {!loading && (
                <p className="mt-2 text-[0.7rem] text-muted">
                  Base Avec importada: {importedContacts.toLocaleString('pt-BR')} · total na base:{' '}
                  {totalContacts.toLocaleString('pt-BR')}
                </p>
              )}
            </div>
            <MiniStat
              icon={<Users size={15} />}
              label="Novos aguardando · funil"
              value={loading ? '—' : String(novos)}
            />
            <MiniStat
              icon={<Layers size={15} />}
              label="Canais ativos · funil 30d"
              value={loading ? '—' : String(activeChannels)}
            />
          </div>

          <SectionCard title="Contatos por dia (funil · 30 dias)">
            <p className="mb-2 text-xs text-muted">
              Entradas reais no funil (exclui dump Avec / status importado) · {crmWindow.from} →{' '}
              {crmWindow.to}
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

          <SectionCard title="Tempo Médio de atendimento (TM)" badge={<Clock size={15} className="text-muted" />}>
            {tm ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <TmCompareCol title="Mês" current={tm.month.current} previous={tm.month.previous} />
                <TmCompareCol title="Trimestre" current={tm.quarter.current} previous={tm.quarter.previous} />
              </div>
            ) : (
              <div className="h-16 animate-pulse rounded-2xl bg-card" />
            )}
            {tm && tm.month.current.sampleCount === 0 && tm.month.previous.sampleCount === 0 && (
              <p className="mt-4 text-xs text-muted">
                Sem duração na Avec para esta unidade (início/fim no 0002). Top serviços mostra
                faturamento — não inventamos TM a partir do catálogo 0223.
              </p>
            )}
          </SectionCard>

          {!loading && topChannel && channelTotal > 0 && (
            <div className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4">
              <Sparkles size={17} className="mt-0.5 shrink-0 text-gold" />
              <p className="text-sm leading-relaxed text-foreground/90">
                <span className="font-semibold text-gold">
                  {CHANNEL_LABEL[topChannel[0]] ?? topChannel[0]}
                </span>{' '}
                lidera entradas no funil nos últimos 30 dias ({topChannel[1]} de {channelTotal}) —
                dump Avec importado não entra nesta conta.
              </p>
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-2">
            <SectionCard
              title="Contatos por canal (funil · 30 dias)"
              badge={<CountBadge value={`${channelTotal}`} />}
            >
              <div className="divide-y divide-border">
                {channelData.map(([channel, count]) => (
                  <div key={channel} className="flex items-center justify-between py-3 text-sm">
                    <span className="text-foreground/90">{CHANNEL_LABEL[channel] ?? channel}</span>
                    <span className="font-semibold tabular-nums text-gold">{count}</span>
                  </div>
                ))}
                {channelData.length === 0 && (
                  <p className="py-6 text-center text-sm text-muted">
                    Nenhuma entrada de funil nos últimos 30 dias.
                  </p>
                )}
              </div>
            </SectionCard>

            <SectionCard title="Status na base (inventário)" badge={<CountBadge value={`${statusTotal}`} />}>
              <p className="mb-2 text-xs text-muted">
                Inclui importado (base Avec 0004) — não é volume de aquisição do mês.
              </p>
              <div className="flex flex-col gap-2.5">
                {[...(data?.byStatus ?? [])]
                  .sort(
                    (a, b) =>
                      b.contacts_count - a.contacts_count ||
                      a.status.localeCompare(b.status, 'pt-BR'),
                  )
                  .map((row) => (
                    <div key={row.status} className="flex items-center justify-between">
                      <StatusPill status={row.status} />
                      <span className="text-sm font-semibold tabular-nums text-foreground/90">
                        {row.contacts_count}
                      </span>
                    </div>
                  ))}
                {data && data.byStatus.length === 0 && (
                  <p className="py-6 text-center text-sm text-muted">Nenhum contato registrado ainda.</p>
                )}
              </div>
            </SectionCard>
          </div>
        </div>

        <div className="flex flex-col gap-6 lg:col-span-4">
          <SectionCard title={`Canais de agenda · ${period?.label ?? '—'}`}>
            <p className="mb-2 text-xs text-muted">{snapshotHint} · 0056.</p>
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

          <SectionCard title="Como nos conheceram">
            <p className="mb-2 text-xs text-muted">{snapshotHint} · 0003.</p>
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

          <SectionCard title={`Pacotes · ${period?.label ?? '—'}`}>
            <p className="mb-2 text-xs text-muted">
              {snapshotHint} · 0061 · {period?.packages_sold ?? 0} vendidos ·{' '}
              {period ? formatCurrency(period.packages_revenue) : '—'}
            </p>
            {(period?.packages.length ?? 0) === 0 ? (
              <p className="text-xs text-muted">Sem pacotes no snapshot.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {period!.packages.map((p) => (
                  <li key={p.name} className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="truncate font-medium">{p.name}</span>
                    <span className="shrink-0 tabular-nums text-muted">
                      {formatCurrency(p.revenue)} · {p.quantity}×
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard title="Top serviços">
            <p className="mb-2 text-xs text-muted">
              {snapshotHint} · 0032 · faturamento real ÷ qtd (ticket médio), não preço de tabela no
              nome.
            </p>
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
            Ranking completo:{' '}
            <Link href="/relatorios" className="text-gold hover:underline">
              Relatórios
            </Link>
          </p>
        </div>
      </div>

      <SectionCard
        title="Ranking de profissionais (snapshot · 30 dias)"
        badge={<Trophy size={15} className="text-muted" />}
      >
        {!performance || performance.professionals.length === 0 ? (
          <p className="text-xs text-muted">
            Sem dado ainda — depende da Avec (0021 + 0126). Detalhe em Relatórios.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="text-left text-[0.65rem] uppercase tracking-wide text-muted">
                  <th className="pb-2 font-medium">#</th>
                  <th className="pb-2 font-medium">Profissional</th>
                  <th className="pb-2 font-medium">Faturamento</th>
                  <th className="pb-2 font-medium">Atendimentos</th>
                  <th className="pb-2 font-medium">Ticket médio</th>
                  <th className="pb-2 font-medium">Ocupação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {performance.professionals.slice(0, 10).map((p, i) => (
                  <tr key={p.name}>
                    <td className="py-2 tabular-nums text-muted">{i + 1}</td>
                    <td className="py-2 font-medium text-foreground/90">{p.name}</td>
                    <td className="py-2 tabular-nums">
                      {formatCurrency(p.revenue)}
                      {p.delta && <DeltaTag value={p.delta.revenue} suffix="" isCurrency />}
                    </td>
                    <td className="py-2 tabular-nums">
                      {p.attended}
                      {p.delta && <DeltaTag value={p.delta.attended} suffix="" />}
                    </td>
                    <td className="py-2 tabular-nums">{formatCurrency(p.ticket_avg)}</td>
                    <td className="py-2 tabular-nums">
                      {p.occupancy != null ? formatPercent(p.occupancy) : '—'}
                      {p.delta?.occupancy != null && (
                        <DeltaTag value={Math.round(p.delta.occupancy * 100)} suffix="pp" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {performance.compare_day && (
              <p className="mt-3 text-[0.65rem] text-muted">
                Comparação: janela de 30 dias até {performance.reference_day} vs até{' '}
                {performance.compare_day}
              </p>
            )}
          </div>
        )}
      </SectionCard>
    </main>
  )
}

function MiniStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-2 flex items-center gap-1.5 text-muted">
        {icon}
        <span className="text-[0.65rem] uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  )
}

function DeltaTag({
  value,
  suffix,
  isCurrency,
}: {
  value: number
  suffix: string
  isCurrency?: boolean
}) {
  if (value === 0) return null
  const positive = value > 0
  const formatted = isCurrency ? formatCurrency(Math.abs(value)) : `${Math.abs(value)}${suffix}`
  return (
    <span
      className={`ml-1.5 text-[0.65rem] font-semibold ${positive ? 'text-success' : 'text-warning'}`}
    >
      {positive ? '+' : '-'}
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
