'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Area, AreaChart, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { ShieldCheck, RefreshCw, Layers, TrendingUp, Users, Sparkles, ChevronRight, AlertTriangle, Clock, Calendar } from 'lucide-react'
import {
  SectionCard,
  CountBadge,
  InfoBanner,
  HealthItem,
  StatusPill,
  CHANNEL_LABEL,
} from '../_components/ui'
import { fmtSchedule } from '@/lib/salon/format'

interface ScheduleItem {
  id: string
  contact_id: string
  contact_name: string | null
  name: string
  scheduled_at: string
  category: string
}

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

interface AvecStatus {
  configured: boolean
  last: {
    status: string
    created_at: string
    stats: { clients_upserted?: number; appointments_synced?: number; attendances_synced?: number }
    error: string | null
  } | null
}

export default function DashboardPage() {
  const [data, setData] = useState<KpiData | null>(null)
  const [actions, setActions] = useState<ActionItem[]>([])
  const [schedule, setSchedule] = useState<ScheduleItem[]>([])
  const [avec, setAvec] = useState<AvecStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [warn, setWarn] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function loadDashboard() {
      try {
        const kpisRes = await fetch('/api/kpis', { cache: 'no-store' })
        const kpisJson = await kpisRes.json()
        if (cancelled) return
        if (kpisJson.error) setError(kpisJson.error)
        else setData(kpisJson.data)

        const [recRes, schedRes, avecRes] = await Promise.all([
          fetch('/api/recommendations', { cache: 'no-store' }),
          fetch('/api/schedule', { cache: 'no-store' }),
          fetch('/api/avec/sync', { cache: 'no-store' }),
        ])
        if (cancelled) return

        const warnings: string[] = []

        try {
          const recJson = await recRes.json()
          if (recJson.error) warnings.push(`Recomendações: ${recJson.error}`)
          else if (recJson.data) setActions(recJson.data)
        } catch {
          warnings.push('Recomendações indisponíveis')
        }

        try {
          const schedJson = await schedRes.json()
          if (schedJson.error) warnings.push(`Agenda: ${schedJson.error}`)
          else if (schedJson.data) setSchedule(schedJson.data)
        } catch {
          warnings.push('Agenda indisponível')
        }

        try {
          const avecJson = await avecRes.json()
          if (avecJson.data) setAvec(avecJson.data)
        } catch {
          // opcional
        }

        if (warnings.length) setWarn(warnings.join(' · '))
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
    <main className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-6 px-5 py-6 lg:gap-8 lg:px-8 lg:py-8">
      <div className="lg:hidden">
        <p className="text-[0.65rem] uppercase tracking-[0.25em] text-gold">Visão geral</p>
        <h1 className="mt-1 text-xl font-semibold">Atendimento · ROM Iguatemi</h1>
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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-8">
        <div className="flex flex-col gap-6 lg:col-span-8 lg:gap-8">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="animate-rise rounded-2xl border border-gold/25 bg-gradient-to-b from-gold/10 to-card p-5 sm:col-span-2 lg:col-span-1">
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
                <span className="text-xs text-muted">conversão</span>
              </div>
            </div>
            <MiniStat icon={<Users size={15} />} label="Novos aguardando" value={loading ? '—' : String(novos)} />
            <MiniStat icon={<Layers size={15} />} label="Canais ativos" value={loading ? '—' : String(activeChannels)} />
          </div>

          <SectionCard title="Contatos por dia">
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

          {!loading && topChannel && (
            <div className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4">
              <Sparkles size={17} className="mt-0.5 shrink-0 text-gold" />
              <p className="text-sm leading-relaxed text-foreground/90">
                <span className="font-semibold text-gold">{CHANNEL_LABEL[topChannel[0]] ?? topChannel[0]}</span> é o canal
                que mais traz contatos ({topChannel[1]} de {channelTotal}). Priorize a agilidade por lá.
              </p>
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-2">
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
          </div>
        </div>

        <div className="flex flex-col gap-6 lg:col-span-4 lg:gap-6">
          {!loading && schedule.length === 0 && (
            <div className="rounded-2xl border border-dashed border-border bg-card/50 p-4 text-sm text-muted">
              <p className="font-medium text-foreground/90">Nenhum agendamento próximo</p>
              <p className="mt-1 text-xs">Abra um contato e use &quot;Agendar&quot; em um serviço para aparecer aqui.</p>
            </div>
          )}

          {schedule.length > 0 && (
            <section className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <h2 className="flex items-center gap-1.5 text-sm font-medium">
                  <Calendar size={15} className="text-sky-300" /> Próximos agendamentos
                </h2>
                <CountBadge value={`${schedule.length}`} tone="gold" />
              </div>
              {schedule.slice(0, 5).map((s) => (
                <Link
                  key={s.id}
                  href={`/contatos/${s.contact_id}`}
                  className="flex items-center gap-3 rounded-2xl border border-sky-500/25 bg-sky-500/5 p-4 active:bg-surface lg:hover:bg-sky-500/10"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{s.contact_name ?? 'Cliente'}</p>
                    <p className="mt-0.5 truncate text-xs text-muted">
                      <span className="text-sky-300">{s.name}</span> · {fmtSchedule(s.scheduled_at)}
                    </p>
                  </div>
                  <ChevronRight size={16} className="shrink-0 text-muted" />
                </Link>
              ))}
            </section>
          )}

          {!loading && actions.length === 0 && !error && (
            <div className="rounded-2xl border border-dashed border-border bg-card/50 p-4 text-sm text-muted">
              <p className="font-medium text-foreground/90">Sem ações pendentes</p>
              <p className="mt-1 text-xs">
                Cadastre serviços com cadência nos contatos — recomendações de retorno e cross-sell aparecem aqui.
              </p>
            </div>
          )}

          {actions.length > 0 && (
            <section className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <h2 className="flex items-center gap-1.5 text-sm font-medium">
                  <Sparkles size={15} className="text-gold" /> Ações recomendadas
                </h2>
                <CountBadge value={`${actions.length}`} />
              </div>
              {actions.slice(0, 6).map((a) => (
                <Link
                  key={a.contact_id}
                  href={`/contatos/${a.contact_id}`}
                  className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 active:bg-surface lg:hover:bg-surface"
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
                label="Banco de dados"
                value={loading ? 'Carregando…' : error ? 'Sem conexão com o banco' : 'Conectado'}
                tone={error ? 'warning' : 'gold'}
              />
              <HealthItem
                icon={<RefreshCw size={17} />}
                label="Sync Avec"
                value={
                  !avec
                    ? 'Carregando…'
                    : !avec.configured
                      ? 'Configure AVEC_API_TOKEN'
                      : avec.last
                        ? `${avec.last.status === 'ok' ? 'OK' : avec.last.status} · ${new Date(avec.last.created_at).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}`
                        : 'Nunca sincronizado — aguardando cron'
                }
                tone={avec?.last?.status === 'error' ? 'warning' : avec?.configured ? 'success' : 'warning'}
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
        </div>
      </div>
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
