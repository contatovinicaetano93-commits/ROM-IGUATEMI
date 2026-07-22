'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import {
  ChevronLeft,
  Phone,
  Mail,
  Sparkles,
  Check,
  Plus,
  X,
  Clock,
  AlertTriangle,
  CircleCheck,
  RefreshCw,
  MessageSquare,
  Wrench,
  UserPlus,
  Calendar,
  Copy,
  Pencil,
  Hand,
  Scissors,
  ShieldOff,
} from 'lucide-react'
import {
  StatusPill,
  PrimaryButton,
  SectionCard,
  CHANNEL_LABEL,
  STATUS_LABEL,
} from '../../_components/ui'
import { fmtSchedule, whatsAppUrl, formatCurrency } from '@/lib/salon/format'
import { CATEGORY_LABEL } from '@/lib/salon/constants'
import { apiFetch } from '@/lib/api-client'
import { buildClientWhatsAppMessage } from '@/lib/whatsapp/client-message'
import { LastVisitCard, type LastVisitData } from '../../_components/LastVisitCard'
import { contactReturnLabel, sanitizeContactReturnTo } from '@/lib/auth-redirect'

interface Service {
  id: string
  name: string
  category: string
  cadence_days: number | null
  product: string | null
  notes: string | null
  scheduled_at: string | null
  last_done_at: string | null
  professional_name: string | null
  last_price: number | null
  next_due_at: string | null
  days_until: number | null
  state: 'overdue' | 'due_soon' | 'ok' | 'no_cadence'
}
interface Recommendation {
  type: 'overdue' | 'due_soon' | 'scheduled' | 'upsell' | 'crosssell'
  title: string
  detail: string
}
interface Contact {
  id: string
  name: string | null
  phone: string | null
  email: string | null
  channel: string
  status: string
  notes: string | null
  preferred_manicurist: string | null
  preferred_hairstylist: string | null
  anonymized_at: string | null
}
interface ContactEvent {
  id: string
  channel: string
  direction: 'in' | 'out'
  handled_by: 'ai' | 'human' | 'system'
  payload: Record<string, unknown>
  error: string | null
  created_at: string
}
interface ClientStats {
  ticket_avg: number | null
  cadence_avg_days: number | null
  completed_services_count: number
  ltv_projection: number | null
}
interface Profile {
  contact: Contact
  services: Service[]
  recommendations: Recommendation[]
  events: ContactEvent[]
  last_visit: LastVisitData | null
  client_stats: ClientStats
}

const STATUS_FLOW = ['novo', 'em_atendimento', 'agendado', 'convertido', 'perdido']

const REC_TONE: Record<string, string> = {
  overdue: 'border-danger/40 bg-danger/10',
  due_soon: 'border-warning/40 bg-warning/10',
  scheduled: 'border-sky-500/40 bg-sky-500/10',
  upsell: 'border-gold/40 bg-gold/10',
  crosssell: 'border-sky-500/40 bg-sky-500/10',
}

function ServiceStateBadge({ state, days }: { state: Service['state']; days: number | null }) {
  if (state === 'overdue')
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-danger/15 px-2 py-0.5 text-[0.65rem] font-semibold text-danger">
        <AlertTriangle size={11} /> Atrasado {Math.abs(days ?? 0)}d
      </span>
    )
  if (state === 'due_soon')
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-[0.65rem] font-semibold text-warning">
        <Clock size={11} /> Vence em {days}d
      </span>
    )
  if (state === 'ok')
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[0.65rem] font-semibold text-success">
        <CircleCheck size={11} /> Em dia
      </span>
    )
  return <span className="rounded-full bg-border px-2 py-0.5 text-[0.65rem] font-semibold text-muted">Avulso</span>
}

const HANDLED_BY_LABEL: Record<string, string> = { ai: 'IA', human: 'Equipe', system: 'Sistema' }

function relTime(iso: string) {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `há ${h}h`
  const d = Math.floor(h / 24)
  if (d < 30) return `há ${d}d`
  return new Date(iso).toLocaleDateString('pt-BR')
}

function eventMeta(e: ContactEvent): { icon: React.ReactNode; title: string; detail: string; danger?: boolean } {
  const p = e.payload ?? {}
  const asStr = (v: unknown) => (typeof v === 'string' ? v : undefined)

  if (e.error) return { icon: <AlertTriangle size={14} />, title: 'Erro registrado', detail: e.error, danger: true }

  const update = p.update as Record<string, unknown> | undefined
  if (update?.status) return { icon: <RefreshCw size={14} />, title: `Status → ${STATUS_LABEL[String(update.status)] ?? update.status}`, detail: '' }
  if (update) return { icon: <RefreshCw size={14} />, title: 'Cadastro atualizado', detail: Object.keys(update).join(', ') }

  if (asStr(p.service_added)) return { icon: <Wrench size={14} />, title: 'Serviço adicionado', detail: String(p.service_added) }
  if (asStr(p.service_done)) return { icon: <Check size={14} />, title: 'Serviço realizado', detail: String(p.service_done) }
  if (asStr(p.service_scheduled)) {
    const when = asStr(p.scheduled_at)
    return {
      icon: <Calendar size={14} />,
      title: 'Agendamento definido',
      detail: `${p.service_scheduled}${when ? ` · ${fmtSchedule(when)}` : ''}`,
    }
  }
  if (asStr(p.service_unscheduled)) return { icon: <Calendar size={14} />, title: 'Agendamento removido', detail: String(p.service_unscheduled) }
  if (Array.isArray(p.conversion_auto_done) && p.conversion_auto_done.length > 0) {
    return {
      icon: <Check size={14} />,
      title: 'Conversão — serviços registrados',
      detail: (p.conversion_auto_done as string[]).join(', '),
    }
  }
  if (asStr(p.brief)) return { icon: <Sparkles size={14} />, title: 'Briefing gerado', detail: p.source === 'ai' ? 'via IA' : 'via regras' }
  if (asStr(p.text)) return { icon: <MessageSquare size={14} />, title: e.direction === 'in' ? 'Mensagem recebida' : 'Mensagem enviada', detail: String(p.text) }
  if (asStr(p.notes)) return { icon: <MessageSquare size={14} />, title: 'Observação', detail: String(p.notes) }
  if ('services' in p) return { icon: <UserPlus size={14} />, title: 'Contato cadastrado', detail: '' }

  return { icon: <MessageSquare size={14} />, title: `${e.channel} · ${e.direction === 'in' ? 'entrada' : 'saída'}`, detail: '' }
}

export default function ContactDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const searchParams = useSearchParams()
  const returnTo = sanitizeContactReturnTo(searchParams.get('returnTo'), '/contatos')
  const backLabel = contactReturnLabel(returnTo)
  const goBack = () => router.push(returnTo)
  const [data, setData] = useState<Profile | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [brief, setBrief] = useState<{ text: string; source: string } | null>(null)
  const [briefLoading, setBriefLoading] = useState(false)
  const [briefError, setBriefError] = useState<string | null>(null)
  const [briefCopied, setBriefCopied] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [scheduleFor, setScheduleFor] = useState<Service | null>(null)
  const [mutationError, setMutationError] = useState<string | null>(null)
  const [mutationOk, setMutationOk] = useState<string | null>(null)
  const [showDetails, setShowDetails] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)

  const load = useCallback(async () => {
    const res = await apiFetch(`/api/contacts/${id}`, { cache: 'no-store' })
    const json = await res.json()
    if (json.error) setError(json.error)
    else setData(json.data)
  }, [id])

  async function mutate(
    url: string,
    init: RequestInit,
    okMessage?: string
  ): Promise<boolean> {
    setMutationError(null)
    setMutationOk(null)
    try {
      const res = await apiFetch(url, init)
      const json = await res.json()
      if (!res.ok || json.error) {
        setMutationError(json.error ?? 'Não foi possível salvar')
        return false
      }
      if (okMessage) setMutationOk(okMessage)
      await load()
      return true
    } catch (e) {
      setMutationError(String(e))
      return false
    }
  }

  useEffect(() => {
    apiFetch(`/api/contacts/${id}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((json) => {
        if (json.error) setError(json.error)
        else setData(json.data)
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))

    apiFetch('/api/auth/session', { cache: 'no-store' })
      .then((r) => r.json())
      .then((json) => setIsAdmin(Boolean(json.data?.can_view_revenue)))
      .catch(() => setIsAdmin(false))
  }, [id])

  async function anonymize() {
    if (
      !confirm(
        'Excluir os dados pessoais deste contato (LGPD)? Nome, telefone, e-mail e observações são apagados de forma permanente. Não pode ser desfeito.'
      )
    )
      return
    await mutate(`/api/contacts/${id}/anonymize`, { method: 'POST' }, 'Dados pessoais removidos.')
  }

  async function resolveHandoff() {
    await mutate(
      `/api/contacts/${id}/resolve-handoff`,
      { method: 'POST' },
      'Conversa assumida — a IA volta a responder normal quando você quiser.'
    )
  }

  useEffect(() => {
    if (!id || loading || error) return
    setBriefLoading(true)
    setBriefError(null)
    apiFetch(`/api/contacts/${id}/brief`, { cache: 'no-store' })
      .then(async (r) => {
        const json = await r.json()
        if (!r.ok || json.error) {
          setBriefError(json.error ?? 'Não foi possível carregar o briefing')
          return
        }
        if (json.data?.brief) setBrief({ text: json.data.brief, source: json.data.source })
      })
      .catch((e) => setBriefError(String(e)))
      .finally(() => setBriefLoading(false))
  }, [id, loading, error])

  async function changeStatus(status: string) {
    await mutate(
      `/api/contacts/${id}`,
      { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) },
      'Status atualizado'
    )
  }

  async function markDone(serviceId: string) {
    await mutate(
      `/api/services/${serviceId}`,
      { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'done' }) },
      'Serviço marcado como feito'
    )
  }

  async function unschedule(serviceId: string) {
    await mutate(
      `/api/services/${serviceId}`,
      { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'unschedule' }) },
      'Agendamento removido'
    )
  }

  async function generateBrief() {
    setBriefLoading(true)
    setBriefError(null)
    try {
      const res = await apiFetch(`/api/contacts/${id}/brief`, { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok || json.error) {
        setBriefError(json.error ?? 'Não foi possível gerar o briefing')
        return
      }
      if (json.data?.brief) setBrief({ text: json.data.brief, source: json.data.source })
      else setBriefError('Resposta vazia do servidor')
    } catch (e) {
      setBriefError(String(e))
    } finally {
      setBriefLoading(false)
    }
  }

  async function copyBrief() {
    if (!brief?.text) return
    try {
      await navigator.clipboard.writeText(brief.text)
      setBriefCopied(true)
      window.setTimeout(() => setBriefCopied(false), 2000)
    } catch {
      setMutationError('Não foi possível copiar o briefing.')
    }
  }

  if (loading) {
    return (
      <main className="flex flex-1 flex-col gap-4 px-5 py-6">
        <div className="h-6 w-24 animate-pulse rounded bg-border" />
        <div className="h-28 animate-pulse rounded-2xl bg-card" />
        <div className="h-40 animate-pulse rounded-2xl bg-card" />
      </main>
    )
  }

  if (error || !data) {
    return (
      <main className="flex flex-1 flex-col gap-4 px-5 py-6">
        <button onClick={goBack} className="flex items-center gap-1 text-sm text-muted">
          <ChevronLeft size={18} /> {backLabel}
        </button>
        <p className="rounded-2xl border border-border bg-card p-4 text-sm text-muted">
          {error ?? 'Contato não encontrado.'}
        </p>
      </main>
    )
  }

  const { contact, services, recommendations, events, last_visit, client_stats } = data
  const isAwaitingHuman = (() => {
    for (const e of events) {
      if (e.payload?.handoff_resolved === true) return false
      if (e.payload?.needs_human === true) return true
    }
    return false
  })()
  const clientWhatsAppText = buildClientWhatsAppMessage({
    contact,
    services,
    recommendations,
  })
  const clientWhatsAppHref = contact.phone
    ? whatsAppUrl(contact.phone, clientWhatsAppText)
    : null

  return (
    <main className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-5 px-5 py-6 lg:gap-8 lg:px-8 lg:py-8">
      <button onClick={goBack} className="flex items-center gap-1 text-sm text-muted active:text-foreground lg:hover:text-foreground">
        <ChevronLeft size={18} /> {backLabel}
      </button>

      {(mutationError || mutationOk) && (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm ${
            mutationError ? 'border-danger/40 bg-danger/10 text-danger' : 'border-success/40 bg-success/10 text-success'
          }`}
        >
          {mutationError ?? mutationOk}
        </div>
      )}

      {isAwaitingHuman && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning">
          <div className="flex items-center gap-2">
            <MessageSquare size={16} className="shrink-0" />
            <span>Cliente aguardando atendimento humano — a IA parou de responder.</span>
          </div>
          <button
            type="button"
            onClick={resolveHandoff}
            className="shrink-0 rounded-full border border-warning/40 bg-warning/15 px-3 py-1.5 text-xs font-semibold text-warning active:bg-warning/25 lg:hover:bg-warning/25"
          >
            Assumir conversa
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 lg:gap-8">
        <div className="flex flex-col gap-5 lg:col-span-5 lg:gap-6">
      {/* Perfil */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold">
              {contact.anonymized_at ? 'Cliente anônimo (LGPD)' : contact.name ?? 'Sem nome'}
            </h1>
            <p className="mt-0.5 text-xs text-muted">{CHANNEL_LABEL[contact.channel] ?? contact.channel}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {!contact.anonymized_at && (
              <button
                type="button"
                onClick={() => setEditOpen(true)}
                className="rounded-full border border-border p-2 text-muted active:bg-surface lg:hover:text-foreground"
                aria-label="Editar contato"
              >
                <Pencil size={15} />
              </button>
            )}
            {isAdmin && !contact.anonymized_at && (
              <button
                type="button"
                onClick={anonymize}
                className="rounded-full border border-danger/40 p-2 text-danger active:bg-danger/10 lg:hover:bg-danger/10"
                aria-label="Excluir dados pessoais (LGPD)"
                title="Excluir dados pessoais (LGPD)"
              >
                <ShieldOff size={15} />
              </button>
            )}
            <StatusPill status={contact.status} />
          </div>
        </div>
        <div className="mt-4 flex flex-col gap-2 text-sm">
          {contact.phone && (
            <a href={`tel:${contact.phone}`} className="flex items-center gap-2 text-foreground/90">
              <Phone size={15} className="text-muted" /> {contact.phone}
            </a>
          )}
          {contact.email && (
            <a href={`mailto:${contact.email}`} className="flex items-center gap-2 truncate text-foreground/90">
              <Mail size={15} className="text-muted" /> {contact.email}
            </a>
          )}
          {contact.notes && <p className="mt-1 text-xs leading-relaxed text-muted">{contact.notes}</p>}
        </div>
        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="rounded-xl border border-border bg-surface/80 px-3 py-2.5">
            <p className="text-[0.65rem] uppercase tracking-wide text-muted">Manicure preferida</p>
            <p className="mt-1 flex items-center gap-1.5 text-sm font-medium">
              <Hand size={14} className="shrink-0 text-gold" />
              {contact.preferred_manicurist?.trim() || 'Ainda não informada'}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-surface/80 px-3 py-2.5">
            <p className="text-[0.65rem] uppercase tracking-wide text-muted">Cabeleireiro preferido</p>
            <p className="mt-1 flex items-center gap-1.5 text-sm font-medium">
              <Scissors size={14} className="shrink-0 text-gold" />
              {contact.preferred_hairstylist?.trim() || 'Ainda não informado'}
            </p>
          </div>
        </div>
      </div>

      <LastVisitCard visit={last_visit} />

      {/* Ficha do cliente (Sprint 3) */}
      {(client_stats.ticket_avg != null ||
        client_stats.cadence_avg_days != null ||
        client_stats.completed_services_count > 0) && (
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-border bg-surface/80 px-3 py-2.5">
            <p className="text-[0.65rem] uppercase tracking-wide text-muted">Ticket médio</p>
            <p className="mt-1 text-sm font-semibold tabular-nums">
              {client_stats.ticket_avg != null ? formatCurrency(client_stats.ticket_avg) : '—'}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-surface/80 px-3 py-2.5">
            <p className="text-[0.65rem] uppercase tracking-wide text-muted">Cadência esperada</p>
            <p className="mt-1 text-sm font-semibold tabular-nums">
              {client_stats.cadence_avg_days != null ? `${client_stats.cadence_avg_days}d` : '—'}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-surface/80 px-3 py-2.5">
            <p className="text-[0.65rem] uppercase tracking-wide text-muted">Serviços realizados</p>
            <p className="mt-1 text-sm font-semibold tabular-nums">{client_stats.completed_services_count}</p>
          </div>
          <div className="rounded-xl border border-border bg-surface/80 px-3 py-2.5">
            <p className="text-[0.65rem] uppercase tracking-wide text-muted">
              LTV projetado (2a)
            </p>
            <p className="mt-1 text-sm font-semibold tabular-nums">
              {client_stats.ltv_projection != null ? formatCurrency(client_stats.ltv_projection) : '—'}
            </p>
          </div>
        </div>
      )}
      {client_stats.ltv_projection != null && (
        <p className="-mt-3 text-[0.65rem] text-muted">
          LTV é projeção (ticket médio × frequência × 2 anos), não histórico real de gasto.
        </p>
      )}

      {/* Status guiado */}
      <SectionCard title="Status do atendimento">
        <div className="no-scrollbar flex gap-2 overflow-x-auto">
          {STATUS_FLOW.map((s) => {
            const active = contact.status === s
            return (
              <button
                key={s}
                onClick={() => changeStatus(s)}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-xs transition-colors ${
                  active ? 'border-gold bg-gold/15 text-gold' : 'border-border text-muted active:text-foreground'
                }`}
              >
                {STATUS_LABEL[s] ?? s}
              </button>
            )
          })}
        </div>
      </SectionCard>

      {/* Briefing IA pro backstaff */}
      <SectionCard title="Briefing do backstaff">
        {briefError && (
          <p className="mb-3 rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
            {briefError}
          </p>
        )}
        {brief ? (
          <div className="flex flex-col gap-3">
            <p className="whitespace-pre-line text-sm leading-relaxed text-foreground/90">{brief.text}</p>
            <span className="text-[0.65rem] uppercase tracking-wide text-muted">
              {brief.source === 'ai' ? 'Gerado por Claude' : 'Gerado por regras (Claude não configurado)'}
            </span>
          </div>
        ) : (
          <p className="mb-3 text-sm text-muted">
            Gere um resumo com as ações de cross-sell e up-sell recomendadas para este cliente.
          </p>
        )}
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          {brief && (
            <button
              type="button"
              onClick={copyBrief}
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-border bg-surface py-3 text-sm font-semibold text-foreground active:scale-[0.99] transition-transform"
            >
              {briefCopied ? <Check size={16} className="text-success" /> : <Copy size={16} />}
              {briefCopied ? 'Copiado!' : 'Copiar briefing'}
            </button>
          )}
          {clientWhatsAppHref && (
            <a
              href={clientWhatsAppHref}
              target="_blank"
              rel="noopener noreferrer"
              title="Abrir WhatsApp com mensagem pessoal de reativação"
              onClick={() => {
                void apiFetch('/api/reactivation/outreach', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    contactId: contact.id,
                    surface: 'contact_detail',
                    lastDoneAtAtSend: last_visit?.last_done_at ?? null,
                  }),
                }).catch(() => {})
              }}
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-success/40 bg-success/10 py-3 text-sm font-semibold text-success"
            >
              <MessageSquare size={16} />
              WhatsApp
            </a>
          )}
          <button
            onClick={generateBrief}
            disabled={briefLoading}
            className={`flex flex-1 items-center justify-center gap-2 rounded-2xl border border-gold/40 bg-gold/10 py-3 text-sm font-semibold text-gold active:scale-[0.99] transition-transform disabled:opacity-60 ${brief && clientWhatsAppHref ? '' : brief ? '' : 'w-full'}`}
          >
            <Sparkles size={16} />
            {briefLoading ? 'Gerando…' : brief ? 'Atualizar' : 'Gerar briefing'}
          </button>
        </div>
      </SectionCard>

      {/* Recomendações — só a principal no modo recepção */}
      {recommendations.length > 0 && (
        <div className={`rounded-2xl border p-4 ${REC_TONE[recommendations[0].type] ?? 'border-border bg-card'}`}>
          <p className="text-sm font-semibold">{recommendations[0].title}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-foreground/80">{recommendations[0].detail}</p>
        </div>
      )}

      <button
        type="button"
        onClick={() => setShowDetails((v) => !v)}
        className="rounded-2xl border border-border bg-card py-3 text-sm font-medium text-muted active:text-foreground"
      >
        {showDetails ? 'Ocultar serviços e histórico' : 'Ver serviços e histórico'}
      </button>
        </div>

        {showDetails && (
        <div className="flex flex-col gap-5 lg:col-span-7 lg:gap-6">
      {/* Serviços */}
      <SectionCard
        title="Serviços & recorrência"
        badge={
          <button onClick={() => setAddOpen(true)} className="flex items-center gap-1 text-xs font-semibold text-gold">
            <Plus size={14} /> Adicionar
          </button>
        }
      >
        <div className="flex flex-col gap-3">
          {services.length === 0 && <p className="py-4 text-center text-sm text-muted">Nenhum serviço cadastrado.</p>}
          {services.map((s) => (
            <div key={s.id} className="rounded-xl border border-border bg-surface p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{s.name}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    {CATEGORY_LABEL[s.category] ?? s.category}
                    {s.product ? ` · ${s.product}` : ''}
                    {s.cadence_days ? ` · a cada ${s.cadence_days}d` : ''}
                    {s.scheduled_at ? ` · ${fmtSchedule(s.scheduled_at)}` : ''}
                  </p>
                </div>
                <ServiceStateBadge state={s.state} days={s.days_until} />
              </div>
              {s.scheduled_at && (
                <p className="mt-2 inline-flex items-center gap-1 rounded-lg bg-sky-500/10 px-2 py-1 text-[0.65rem] font-medium text-sky-300">
                  <Calendar size={11} /> Agendado: {fmtSchedule(s.scheduled_at)}
                </p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={() => markDone(s.id)}
                  className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-foreground/90 active:bg-card"
                >
                  <Check size={13} /> Feito hoje
                </button>
                <button
                  onClick={() => setScheduleFor(s)}
                  className="flex items-center gap-1.5 rounded-lg border border-gold/30 bg-gold/10 px-3 py-1.5 text-xs text-gold active:bg-gold/20"
                >
                  <Calendar size={13} /> {s.scheduled_at ? 'Reagendar' : 'Agendar'}
                </button>
                {s.scheduled_at && (
                  <button
                    onClick={() => unschedule(s.id)}
                    className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted active:bg-card"
                  >
                    <X size={13} /> Limpar
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Histórico de atendimento (timeline) */}
      <SectionCard title="Histórico de atendimento">
        {events.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted">Nenhum evento registrado ainda.</p>
        ) : (
          <ol className="relative flex flex-col gap-4 pl-5">
            <span className="absolute left-[7px] top-1 bottom-1 w-px bg-border" aria-hidden />
            {events.map((e) => {
              const meta = eventMeta(e)
              return (
                <li key={e.id} className="relative">
                  <span
                    className={`absolute -left-5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full border ${
                      meta.danger ? 'border-danger/50 bg-danger/15 text-danger' : 'border-gold/40 bg-gold/10 text-gold'
                    }`}
                  >
                    <span className="scale-[0.6]">{meta.icon}</span>
                  </span>
                  <div className="flex items-baseline justify-between gap-2">
                    <p className={`text-sm font-medium ${meta.danger ? 'text-danger' : ''}`}>{meta.title}</p>
                    <span className="shrink-0 text-[0.65rem] text-muted">{relTime(e.created_at)}</span>
                  </div>
                  {meta.detail && <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted">{meta.detail}</p>}
                  <span className="mt-1 inline-block text-[0.6rem] uppercase tracking-wide text-muted/70">
                    {HANDLED_BY_LABEL[e.handled_by] ?? e.handled_by}
                  </span>
                </li>
              )
            })}
          </ol>
        )}
      </SectionCard>
        </div>
        )}
      </div>

      {addOpen && (
        <AddServiceSheet
          contactId={id}
          onClose={() => setAddOpen(false)}
          onAdded={() => {
            setAddOpen(false)
            load()
          }}
        />
      )}

      {scheduleFor && (
        <ScheduleSheet
          service={scheduleFor}
          onClose={() => setScheduleFor(null)}
          onScheduled={() => {
            setScheduleFor(null)
            load()
            setMutationOk('Agendamento confirmado')
          }}
        />
      )}

      {editOpen && (
        <EditContactSheet
          contact={contact}
          onClose={() => setEditOpen(false)}
          onSaved={() => {
            setEditOpen(false)
            load()
            setMutationOk('Cadastro atualizado')
          }}
        />
      )}
    </main>
  )
}

function ScheduleSheet({
  service,
  onClose,
  onScheduled,
}: {
  service: Service
  onClose: () => void
  onScheduled: () => void
}) {
  const defaultWhen = service.scheduled_at
    ? new Date(service.scheduled_at).toISOString().slice(0, 16)
    : (() => {
        const d = new Date()
        d.setDate(d.getDate() + 1)
        d.setHours(10, 0, 0, 0)
        return d.toISOString().slice(0, 16)
      })()
  const [when, setWhen] = useState(defaultWhen)
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setErr(null)
    try {
      const res = await apiFetch(`/api/services/${service.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'schedule', scheduledAt: new Date(when).toISOString() }),
      })
      const json = await res.json()
      if (!res.ok || json.error) {
        setErr(json.error ?? 'Erro ao agendar')
        return
      }
      onScheduled()
    } catch (e) {
      setErr(String(e))
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
          <h2 className="text-base font-semibold">Agendar {service.name}</h2>
          <button type="button" onClick={onClose} aria-label="Fechar" className="text-muted active:text-foreground">
            <X size={22} />
          </button>
        </div>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs uppercase tracking-wide text-muted">Data e hora</span>
            <input
              type="datetime-local"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              required
              className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-base outline-none focus:border-gold"
            />
          </label>
          {err && <p className="text-sm text-danger">{err}</p>}
          <PrimaryButton type="submit" disabled={submitting}>
            {submitting ? 'Salvando…' : 'Confirmar agendamento'}
          </PrimaryButton>
        </form>
      </div>
    </div>
  )
}

function AddServiceSheet({
  contactId,
  onClose,
  onAdded,
}: {
  contactId: string
  onClose: () => void
  onAdded: () => void
}) {
  const [name, setName] = useState('')
  const [category, setCategory] = useState('corte')
  const [cadence, setCadence] = useState('')
  const [product, setProduct] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setErr(null)
    try {
      const res = await apiFetch(`/api/contacts/${contactId}/services`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          category,
          cadenceDays: cadence ? Number(cadence) : undefined,
          product: product || undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok || json.error) {
        setErr(json.error ?? 'Erro ao salvar')
        return
      }
      onAdded()
    } catch (e) {
      setErr(String(e))
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
          <h2 className="text-base font-semibold">Novo serviço</h2>
          <button type="button" onClick={onClose} aria-label="Fechar" className="text-muted active:text-foreground">
            <X size={22} />
          </button>
        </div>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs uppercase tracking-wide text-muted">Serviço</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
              placeholder="Ex.: Corte de cabelo"
              className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-base outline-none focus:border-gold"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs uppercase tracking-wide text-muted">Categoria</span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-base outline-none focus:border-gold"
            >
              {Object.entries(CATEGORY_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs uppercase tracking-wide text-muted">Cadência (dias)</span>
              <input
                value={cadence}
                onChange={(e) => setCadence(e.target.value)}
                type="number"
                inputMode="numeric"
                placeholder="30"
                className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-base outline-none focus:border-gold"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs uppercase tracking-wide text-muted">Produto</span>
              <input
                value={product}
                onChange={(e) => setProduct(e.target.value)}
                placeholder="Opcional"
                className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-base outline-none focus:border-gold"
              />
            </label>
          </div>
          {err && <p className="text-sm text-danger">{err}</p>}
          <PrimaryButton type="submit" disabled={submitting}>
            {submitting ? 'Salvando…' : 'Adicionar serviço'}
          </PrimaryButton>
        </form>
      </div>
    </div>
  )
}

function EditContactSheet({
  contact,
  onClose,
  onSaved,
}: {
  contact: Contact
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(contact.name ?? '')
  const [phone, setPhone] = useState(contact.phone ?? '')
  const [email, setEmail] = useState(contact.email ?? '')
  const [notes, setNotes] = useState(contact.notes ?? '')
  const [manicurist, setManicurist] = useState(contact.preferred_manicurist ?? '')
  const [hairstylist, setHairstylist] = useState(contact.preferred_hairstylist ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setErr(null)
    try {
      const res = await apiFetch(`/api/contacts/${contact.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          phone,
          email: email || undefined,
          notes,
          preferred_manicurist: manicurist.trim() || null,
          preferred_hairstylist: hairstylist.trim() || null,
        }),
      })
      const json = await res.json()
      if (!res.ok || json.error) {
        setErr(json.error ?? 'Erro ao salvar')
        return
      }
      onSaved()
    } catch (e) {
      setErr(String(e))
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
          <h2 className="text-base font-semibold">Editar contato</h2>
          <button type="button" onClick={onClose} aria-label="Fechar" className="text-muted active:text-foreground">
            <X size={22} />
          </button>
        </div>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs uppercase tracking-wide text-muted">Nome</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-base outline-none focus:border-gold"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs uppercase tracking-wide text-muted">Telefone</span>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              type="tel"
              className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-base outline-none focus:border-gold"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs uppercase tracking-wide text-muted">E-mail (opcional)</span>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-base outline-none focus:border-gold"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs uppercase tracking-wide text-muted">Manicure preferida</span>
            <input
              value={manicurist}
              onChange={(e) => setManicurist(e.target.value)}
              placeholder="Nome da manicure"
              className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-base outline-none focus:border-gold"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs uppercase tracking-wide text-muted">Cabeleireiro preferido</span>
            <input
              value={hairstylist}
              onChange={(e) => setHairstylist(e.target.value)}
              placeholder="Nome do cabeleireiro"
              className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-base outline-none focus:border-gold"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs uppercase tracking-wide text-muted">Observações</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full resize-none rounded-xl border border-border bg-surface px-4 py-3 text-base outline-none focus:border-gold"
            />
          </label>
          {err && <p className="text-sm text-danger">{err}</p>}
          <PrimaryButton type="submit" disabled={submitting}>
            {submitting ? 'Salvando…' : 'Salvar alterações'}
          </PrimaryButton>
        </form>
      </div>
    </div>
  )
}
