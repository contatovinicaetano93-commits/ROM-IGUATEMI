'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Area, AreaChart, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { ShieldCheck, RefreshCw, Layers, TrendingUp, Users, Sparkles, ChevronRight, AlertTriangle, Clock } from 'lucide-react'
import {
  SectionCard,
  CountBadge,
  InfoBanner,
  HealthItem,
  StatusPill,
  CHANNEL_LABEL,
} from '../_components/ui'

interface ActionItem {
  contact_id: string
  contact_name: string | null
  overdue: number
  due_soon: number
  recommendations: { type: string; title: string; detail: string }[]
}

interface KpiData {
  byDay: { day: string; channel: string; contacts_count: number }[]
  byStatus: { status: string; contacts_count: number }[]
  conversion: { conversion_rate: number; total_contacts: number } | null
}

function aggregateByDay(rows: KpiData['byDay']) {
  const map = new Map<string, number>()
  for (const row of rows) {
    const key = row.day.slice(0, 10)
    map.set(key, (map.get(key) ?? 0) + row.contacts_count)
  }
  return Array.from(map.entries())
    .map(([day, total]) => ({ day: day.slice(5), total }))
    .sort((a, b) => a.day.localeCompare(b.day))
}

function aggregateByChannel(rows: KpiData['byDay']) {
  const map = new Map<string, number>()
  for (const row of rows) map.set(row.channel, (map.get(row.channel) ?? 0) + row.contacts_count)
  return Array.from(map.entries()).sort((a, b) => b[1] - a[1])
}

export default function DashboardPage() {
  const [data, setData] = useState<KpiData | null>(null)
  const [actions, setActions] = useState<ActionItem[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/kpis', { cache: 'no-store' })
      .then((r) => r.json())
      .then((json) => {
        if (json.error) setError(json.error)
        else setData(json.data)
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))

    fetch('/api/recommendations', { cache: 'no-store' })
      .then((r) => r.json())
      .then((json) => {
        if (json.data) setActions(json.data)
      })
      .catch(() => {})
  }, [])

  const totalContacts = data?.conversion?.total_contacts ?? 0
  const conversionRate = data?.conversion?.conversion_rate ?? 0
  const chartData = data ? aggregateByDay(data.byDay) : []
  const channelData = data ? aggregateByChannel(data.byDay) : []
  const activeChannels = new Set(data?.byDay.map((d) => d.channel)).size
  const statusTotal = data?.byStatus.reduce((s, r) => s + r.contacts_count, 0) ?? 0
  const channelTotal = channelData.reduce((s, [, v]) => s + v, 0)
  const novos = data?.byStatus.find((s) => s.status === 'novo')?.contacts_count ?? 0
  const topChannel = channelData[0]

  return (
    <main className="flex flex-1 flex-col gap-6 px-5 py-6">
      <div>
        <p className="text-[0.65rem] uppercase tracking-[0.25em] text-gold">Visão geral</p>
        <h1 className="mt-1 text-xl font-semibold">Atendimento do ROM Club</h1>
      </div>

      {error && (
        <div className="rounded-2xl border border-border bg-card px-4 py-3 text-sm text-muted">
          Não foi possível carregar os dados ({error}). Confirme se o banco está configurado.
        </div>
      )}

      {/* Hero KPI */}
      <div className="animate-rise rounded-2xl border border-gold/25 bg-gradient-to-b from-gold/10 to-card p-5">
        <p className="text-xs text-muted">Contatos totais</p>
        {loading ? (
          <div className="mt-2 h-10 w-32 animate-pulse rounded-lg bg-border" />
        ) : (
          <p className="mt-1 text-4xl font-semibold tabular-nums">{totalContacts}</p>
        )}
        <div className="mt-3 flex items-center gap-2 text-sm">
          <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-xs font-semibold text-success">
            <TrendingUp size={13} />
            {(conversionRate * 100).toFixed(1)}%
          </span>
          <span className="text-xs text-muted">taxa de conversão</span>
        </div>
      </div>

      {/* Mini stats */}
      <div className="grid grid-cols-2 gap-3">
        <MiniStat icon={<Users size={15} />} label="Novos aguardando" value={loading ? '—' : String(novos)} />
        <MiniStat icon={<Layers size={15} />} label="Canais ativos" value={loading ? '—' : String(activeChannels)} />
      </div>

      {/* Ações recomendadas — guia o front no cross/up-sell */}
      {actions.length > 0 && (
        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-1.5 text-sm font-medium">
              <Sparkles size={15} className="text-gold" /> Ações recomendadas
            </h2>
            <CountBadge value={`${actions.length}`} />
          </div>
          {actions.slice(0, 5).map((a) => (
            <Link
              key={a.contact_id}
              href={`/contatos/${a.contact_id}`}
              className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 active:bg-surface"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-medium">{a.contact_name ?? 'Sem nome'}</p>
                  {a.overdue > 0 && (
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-danger/15 px-1.5 py-0.5 text-[0.6rem] font-semibold text-danger">
                      <AlertTriangle size={10} />
                      {a.overdue}
                    </span>
                  )}
                  {a.due_soon > 0 && (
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-warning/15 px-1.5 py-0.5 text-[0.6rem] font-semibold text-warning">
                      <Clock size={10} />
                      {a.due_soon}
                    </span>
                  )}
                </div>
                {a.recommendations[0] && (
                  <p className="mt-0.5 truncate text-xs text-muted">
                    <span className="text-gold">{a.recommendations[0].title}</span> · {a.recommendations[0].detail}
                  </p>
                )}
              </div>
              <ChevronRight size={16} className="shrink-0 text-muted" />
            </Link>
          ))}
        </section>
      )}

      {/* Saúde do sistema — resiliência visível */}
      <SectionCard title="Saúde do sistema">
        <div className="divide-y divide-border">
          <HealthItem
            icon={<ShieldCheck size={17} />}
            label="Dados protegidos"
            value="Tudo registrado em contact_events"
            tone="success"
          />
          <HealthItem
            icon={<RefreshCw size={17} />}
            label="Sincronização"
            value={loading ? 'Carregando…' : error ? 'Sem conexão com o banco' : 'Atualizado agora'}
            tone={error ? 'warning' : 'gold'}
          />
          <HealthItem
            icon={<ShieldCheck size={17} />}
            label="Resiliência"
            value="Eventos rastreáveis e reprocessáveis"
            tone="success"
          />
        </div>
      </SectionCard>

      <InfoBanner
        title="Mantenha o atendimento em dia"
        text="Responda os contatos novos rápido — a IA faz o primeiro atendimento, mas a conversão sobe quando a equipe assume na sequência."
      />

      {/* Gráfico */}
      <SectionCard title="Contatos por dia">
        <div className="h-52">
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
              <YAxis stroke="var(--muted)" fontSize={11} allowDecimals={false} tickLine={false} axisLine={false} width={28} />
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

      {/* Insight inteligente */}
      {!loading && topChannel && (
        <div className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4">
          <Sparkles size={17} className="mt-0.5 shrink-0 text-gold" />
          <p className="text-sm leading-relaxed text-foreground/90">
            <span className="font-semibold text-gold">{CHANNEL_LABEL[topChannel[0]] ?? topChannel[0]}</span> é o canal
            que mais traz contatos ({topChannel[1]} de {channelTotal}). Priorize a agilidade por lá.
          </p>
        </div>
      )}

      {/* Contatos por canal */}
      <SectionCard title="Contatos por canal" badge={<CountBadge value={`${channelTotal}`} />}>
        <div className="divide-y divide-border">
          {channelData.map(([channel, count]) => (
            <div key={channel} className="flex items-center justify-between py-3 text-sm">
              <span className="text-foreground/90">{CHANNEL_LABEL[channel] ?? channel}</span>
              <span className="font-semibold tabular-nums text-gold">{count}</span>
            </div>
          ))}
          {channelData.length === 0 && (
            <p className="py-6 text-center text-sm text-muted">Nenhum contato registrado ainda.</p>
          )}
        </div>
      </SectionCard>

      {/* Status dos contatos */}
      <SectionCard title="Status dos contatos" badge={<CountBadge value={`${statusTotal}`} />}>
        <div className="flex flex-col gap-2.5">
          {(data?.byStatus ?? []).map((row) => (
            <div key={row.status} className="flex items-center justify-between">
              <StatusPill status={row.status} />
              <span className="text-sm font-semibold tabular-nums text-foreground/90">{row.contacts_count}</span>
            </div>
          ))}
          {data && data.byStatus.length === 0 && (
            <p className="py-6 text-center text-sm text-muted">Nenhum contato registrado ainda.</p>
          )}
        </div>
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
