'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Sun,
  ChevronRight,
  AlertTriangle,
  Clock,
  Calendar,
  Sparkles,
  MessageCircle,
  TrendingUp,
  Users,
  DollarSign,
  GraduationCap,
} from 'lucide-react'
import { CountBadge } from '../_components/ui'
import { BriefSheet } from '../_components/BriefSheet'
import { UrgencyBadgeLegend } from '../_components/UrgencyBadgeLegend'
import { fmtSchedule, formatCurrency } from '@/lib/salon/format'
import { apiFetch } from '@/lib/api-client'
import { getBrand } from '@/lib/brand'

interface PlaybookItem {
  contact_id: string
  contact_name: string | null
  contact_phone: string | null
  overdue: number
  max_overdue_days: number
  due_soon: number
  scheduled_today: number
  recommendations: { type: string; title: string; detail: string }[]
}

interface ScheduleItem {
  id: string
  contact_id: string
  contact_name: string | null
  name: string
  scheduled_at: string
}

interface HojeData {
  day: string
  salon: {
    revenue: number | null
    appointments: number
    attended: number
    no_shows: number
    ticket_avg: number | null
    new_clients: number
  }
  tm_today: { avg_minutes: number | null; sample_count: number }
  can_view_revenue?: boolean
  role?: 'admin' | 'staff'
  playbook: PlaybookItem[]
  scheduleToday: ScheduleItem[]
  leads: { novos: number; whatsapp_sem_resposta: number }
  overdue_total: number
  reactivation?: {
    window_days: number
    contacted: number
    reactivated: number
    rate: number | null
  }
}

export default function HojePage() {
  const brand = getBrand()
  const [data, setData] = useState<HojeData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [briefFor, setBriefFor] = useState<{ id: string; name: string | null } | null>(null)

  useEffect(() => {
    apiFetch('/api/hoje', { cache: 'no-store' })
      .then((r) => r.json())
      .then((json) => {
        if (json.error) setError(json.error)
        else setData(json.data)
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
  }, [])

  const salon = data?.salon
  // Só mostra faturamento depois da API confirmar (staff nunca vê)
  const canViewRevenue = Boolean(data?.can_view_revenue)
  const dayLabel = data
    ? new Date(data.day + 'T12:00:00').toLocaleDateString('pt-BR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      })
    : ''

  return (
    <main className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-5 px-5 py-6 lg:gap-6 lg:px-8 lg:py-8">
      <div>
        <p className="text-[0.65rem] uppercase tracking-[0.25em] text-gold">Playbook do dia</p>
        <h1 className="mt-1 flex items-center gap-2 text-xl font-semibold capitalize lg:text-2xl">
          <Sun size={22} className="text-gold" />
          Hoje no {brand.displayName}
        </h1>
        {!loading && data && <p className="mt-0.5 text-xs text-muted capitalize">{dayLabel}</p>}
      </div>

      {error && (
        <div className="rounded-2xl border border-border bg-card px-4 py-3 text-sm text-muted">
          Não foi possível carregar ({error}). Confirme se o banco está configurado.
        </div>
      )}

      {/* KPIs do salão — faturamento só para admin */}
      <div className={`grid grid-cols-2 gap-3 ${canViewRevenue ? 'sm:grid-cols-5' : 'sm:grid-cols-4'}`}>
        {canViewRevenue && (
          <KpiCard
            icon={<DollarSign size={16} />}
            label="Faturamento"
            value={loading ? '—' : formatCurrency(salon?.revenue ?? 0)}
            loading={loading}
          />
        )}
        <KpiCard
          icon={<Calendar size={16} />}
          label="Agendados"
          value={loading ? '—' : String(salon?.appointments ?? 0)}
          loading={loading}
        />
        <KpiCard
          icon={<TrendingUp size={16} />}
          label="Atendidos"
          value={loading ? '—' : String(salon?.attended ?? 0)}
          loading={loading}
        />
        <KpiCard
          icon={<AlertTriangle size={16} />}
          label="No-shows"
          value={loading ? '—' : String(salon?.no_shows ?? 0)}
          loading={loading}
          warn={(salon?.no_shows ?? 0) > 0}
        />
        <KpiCard
          icon={<Clock size={16} />}
          label="TM atendimento"
          value={
            loading
              ? '—'
              : data?.tm_today.avg_minutes != null
                ? `${data.tm_today.avg_minutes} min`
                : '—'
          }
          loading={loading}
        />
      </div>

      {!loading && data && data.tm_today.avg_minutes == null && (
        <p className="-mt-2 text-[0.7rem] text-muted">
          TM aguardando início/fim real do atendimento pela Avec (Sprint 1 — AVEC_API_TOKEN pendente).
        </p>
      )}

      {!loading && data?.reactivation && (
        <div className="flex items-start gap-3 rounded-2xl border border-success/25 bg-success/5 p-4">
          <MessageCircle size={18} className="mt-0.5 shrink-0 text-success" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground/90">
              Reativação via WhatsApp
              <span className="ml-1.5 text-xs font-normal text-muted">
                · {data.reactivation.window_days} dias
              </span>
            </p>
            <p className="mt-0.5 text-xs text-muted">
              <span className="font-semibold text-success tabular-nums">
                {data.reactivation.reactivated}
              </span>{' '}
              reativados de{' '}
              <span className="tabular-nums">{data.reactivation.contacted}</span> contatados
              {data.reactivation.rate != null ? ` · ${data.reactivation.rate}%` : ''}
              {data.reactivation.contacted === 0
                ? ' — use o botão WhatsApp no contato ou no relatório 0011 para começar a medir'
                : ''}
            </p>
          </div>
        </div>
      )}

      {!loading && (data?.overdue_total ?? 0) > 0 && (
        <div className="flex items-start gap-3 rounded-2xl border border-danger/30 bg-danger/10 p-4">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-danger" />
          <p className="text-sm">
            <span className="font-semibold text-danger">{data!.overdue_total} serviço(s) atrasado(s)</span>
            {' — '}priorize reagendar hoje.
          </p>
        </div>
      )}

      {!loading && (data?.leads.whatsapp_sem_resposta ?? 0) > 0 && (
        <div className="flex items-start gap-3 rounded-2xl border border-warning/30 bg-warning/10 p-4">
          <MessageCircle size={18} className="mt-0.5 shrink-0 text-warning" />
          <p className="text-sm">
            <span className="font-semibold text-warning">{data!.leads.whatsapp_sem_resposta} lead(s) WhatsApp</span>
            {' '}aguardando resposta da equipe.
          </p>
        </div>
      )}

      <Link
        href="/onboarding"
        className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 active:bg-surface"
      >
        <GraduationCap size={18} className="shrink-0 text-gold" />
        <p className="flex-1 text-sm text-foreground/90">Central de treinamento — vídeos de onboarding</p>
        <ChevronRight size={16} className="shrink-0 text-muted" />
      </Link>

      {/* Agenda — hoje e próximos, por data/hora */}
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 text-sm font-medium">
            <Calendar size={15} className="text-sky-300" /> Agendamentos
          </h2>
          <CountBadge value={loading ? '—' : String(data?.scheduleToday.length ?? 0)} tone="gold" />
        </div>
        <p className="text-[0.65rem] text-muted/70">Hoje primeiro, depois os próximos · ordem de data e horário</p>

        {loading &&
          Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-2xl bg-card" />
          ))}

        {!loading && data?.scheduleToday.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border bg-card/50 p-4 text-sm text-muted">
            Nenhum agendamento próximo.
          </div>
        )}

        {!loading &&
          data?.scheduleToday.map((s) => (
            <Link
              key={s.id}
              href={`/contatos/${s.contact_id}`}
              className="flex items-center gap-3 rounded-2xl border border-sky-500/25 bg-sky-500/5 p-4 active:bg-surface"
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

      {/* Playbook — ações prioritárias */}
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 text-sm font-medium">
            <Sparkles size={15} className="text-gold" /> O que fazer agora
          </h2>
          <CountBadge value={loading ? '—' : String(data?.playbook.length ?? 0)} />
        </div>
        {!loading && (data?.playbook.length ?? 0) > 0 && (
          <UrgencyBadgeLegend showScheduled={false} />
        )}

        {loading &&
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-2xl bg-card" />
          ))}

        {!loading && data?.playbook.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border bg-card/50 p-4 text-sm text-muted">
            <p className="font-medium text-foreground/90">Tudo em dia 🎉</p>
            <p className="mt-1 text-xs">Sem ações urgentes. Confira os contatos novos ou a visão analítica.</p>
          </div>
        )}

        {!loading &&
          data?.playbook.map((a) => (
            <div
              key={a.contact_id}
              className="flex items-center gap-2 rounded-2xl border border-border bg-card p-4"
            >
              <Link
                href={`/contatos/${a.contact_id}`}
                className="flex min-w-0 flex-1 items-center gap-3 active:opacity-80"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium">{a.contact_name ?? 'Sem nome'}</p>
                    {a.max_overdue_days > 0 && (
                      <span
                        title={`${a.max_overdue_days} dia(s) sem retorno · ${a.overdue} serviço(s) atrasado(s)`}
                        className="inline-flex items-center gap-0.5 rounded-full bg-danger/15 px-1.5 py-0.5 text-[0.6rem] font-semibold text-danger"
                      >
                        <AlertTriangle size={10} />
                        {a.max_overdue_days}
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
              <button
                type="button"
                onClick={() => setBriefFor({ id: a.contact_id, name: a.contact_name })}
                aria-label={`Gerar briefing de ${a.contact_name ?? 'cliente'}`}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-gold/40 bg-gold/10 text-gold active:scale-95"
              >
                <Sparkles size={16} />
              </button>
            </div>
          ))}
      </section>

      {briefFor && (
        <BriefSheet
          contactId={briefFor.id}
          contactName={briefFor.name}
          onClose={() => setBriefFor(null)}
        />
      )}

      {!loading && (data?.leads.novos ?? 0) > 0 && (
        <Link
          href="/contatos"
          className="flex items-center justify-between rounded-2xl border border-border bg-card p-4 active:bg-surface"
        >
          <div className="flex items-center gap-3">
            <Users size={18} className="text-gold" />
            <div>
              <p className="text-sm font-medium">{data!.leads.novos} contato(s) novo(s)</p>
              <p className="text-xs text-muted">Ver lista completa</p>
            </div>
          </div>
          <ChevronRight size={16} className="text-muted" />
        </Link>
      )}
    </main>
  )
}

function KpiCard({
  icon,
  label,
  value,
  loading,
  warn,
}: {
  icon: React.ReactNode
  label: string
  value: string
  loading: boolean
  warn?: boolean
}) {
  return (
    <div
      className={`rounded-2xl border p-4 ${warn ? 'border-warning/40 bg-warning/10' : 'border-border bg-card'}`}
    >
      <div className="mb-2 flex items-center gap-1.5 text-muted">
        {icon}
        <span className="text-[0.6rem] uppercase tracking-wide">{label}</span>
      </div>
      {loading ? (
        <div className="h-7 w-16 animate-pulse rounded bg-border" />
      ) : (
        <p className={`text-lg font-semibold tabular-nums ${warn ? 'text-warning' : ''}`}>{value}</p>
      )}
    </div>
  )
}
