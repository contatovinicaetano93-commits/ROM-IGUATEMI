'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Plus,
  X,
  Phone,
  Search,
  AlertTriangle,
  Clock,
  Calendar,
  MessageSquare,
} from 'lucide-react'
import { Avatar, PrimaryButton } from '../_components/ui'
import { apiFetch } from '@/lib/api-client'
import { whatsAppUrl } from '@/lib/salon/format'
import { CATEGORY_LABEL, DUE_SOON_DAYS } from '@/lib/salon/constants'
import { buildClientWhatsAppMessage } from '@/lib/whatsapp/client-message'

interface Contact {
  id: string
  name: string | null
  phone: string | null
  channel: string
  status: string
  created_at: string
  overdue: number
  max_overdue_days: number
  due_soon: number
  scheduled_soon: number
  pending_actions: number
  urgency_score: number
  top_action: string | null
}

type ListMode = 'reactivate' | 'search'
type ReactivateQueue = 'overdue' | 'due_soon' | 'scheduled'

function contactQueue(c: Contact): ReactivateQueue | null {
  if (c.overdue > 0) return 'overdue'
  if (c.due_soon > 0) return 'due_soon'
  if (c.scheduled_soon > 0) return 'scheduled'
  return null
}

function serviceLine(c: Contact, queue: ReactivateQueue | null): string {
  const action = c.top_action?.trim()
  if (queue === 'overdue') {
    const days = c.max_overdue_days
    const base = action?.replace(/\s+atrasado$/i, '').trim() || 'Serviço'
    return days > 0 ? `${base} · há ${days} dia${days === 1 ? '' : 's'}` : `${base} atrasado`
  }
  if (queue === 'due_soon') {
    const base = action?.replace(/\s+vencendo$/i, '').trim() || 'Serviço'
    return `${base} · em até ${DUE_SOON_DAYS} dias`
  }
  if (queue === 'scheduled') {
    return action || 'Retorno agendado'
  }
  return action || 'Sem sinal de retorno'
}

function urgencyBadge(queue: ReactivateQueue | null) {
  if (queue === 'overdue') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-danger/15 px-2 py-0.5 text-[0.65rem] font-semibold text-danger">
        <AlertTriangle size={10} /> Atrasado
      </span>
    )
  }
  if (queue === 'due_soon') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-[0.65rem] font-semibold text-warning">
        <Clock size={10} /> Vencendo
      </span>
    )
  }
  if (queue === 'scheduled') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/15 px-2 py-0.5 text-[0.65rem] font-semibold text-sky-300">
        <Calendar size={10} /> Agendado
      </span>
    )
  }
  return null
}

function logOutreach(contactId: string) {
  void apiFetch('/api/reactivation/outreach', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contactId,
      surface: 'contact_list',
      lastDoneAtAtSend: null,
    }),
  }).catch(() => {})
}

function whatsappHrefFor(c: Contact): string | null {
  if (!c.phone) return null
  const text = buildClientWhatsAppMessage({
    contact: { name: c.name },
    daysSinceVisit: c.max_overdue_days > 0 ? c.max_overdue_days : null,
  })
  return whatsAppUrl(c.phone, text)
}

export default function ContatosPage() {
  const [mode, setMode] = useState<ListMode>('reactivate')
  const [queue, setQueue] = useState<ReactivateQueue>('overdue')
  const [contacts, setContacts] = useState<Contact[]>([])
  const [queueCounts, setQueueCounts] = useState<{
    overdue: number
    due_soon: number
    scheduled: number
  }>({ overdue: 0, due_soon: 0, scheduled: 0 })
  const [totalInBase, setTotalInBase] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQuery(query.trim()), 300)
    return () => window.clearTimeout(t)
  }, [query])

  async function load() {
    setLoading(true)
    try {
      if (mode === 'search' && !debouncedQuery) {
        setError(null)
        setContacts([])
        setTotalInBase(null)
        return
      }
      const params = new URLSearchParams({
        sort: 'urgency',
        limit: mode === 'reactivate' ? '250' : '100',
      })
      if (mode === 'reactivate') {
        params.set('pending', 'true')
        params.set('queue', queue)
      } else {
        params.set('q', debouncedQuery)
      }
      const res = await apiFetch(`/api/contacts?${params}`, { cache: 'no-store' })
      const json = await res.json()
      if (json.error) setError(json.error)
      else {
        setError(null)
        setContacts(json.data ?? [])
        const total = json.meta?.total
        setTotalInBase(typeof total === 'number' ? total : null)
        const q = json.meta?.queues
        if (q && typeof q.overdue === 'number') {
          setQueueCounts({
            overdue: q.overdue,
            due_soon: q.due_soon,
            scheduled: q.scheduled,
          })
        }
      }
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, debouncedQuery, queue])

  const visible = contacts

  const countLabel =
    mode === 'search'
      ? debouncedQuery
        ? `${visible.length} contato${visible.length === 1 ? '' : 's'}${
            totalInBase != null && totalInBase > visible.length ? ` de ${totalInBase}` : ''
          }`
        : 'busque na base'
      : `${visible.length} na fila${
          totalInBase != null && totalInBase > visible.length ? ` · ${totalInBase} no total` : ''
        }`

  const emptyCopy =
    mode === 'search'
      ? debouncedQuery
        ? 'Nenhum contato encontrado.'
        : 'Digite um nome ou telefone para buscar na base.'
      : queue === 'overdue'
        ? 'Nenhum atrasado (cadência vencida com visita registrada).'
        : queue === 'due_soon'
          ? `Nenhum vencendo nos próximos ${DUE_SOON_DAYS} dias.`
          : 'Nenhum agendado hoje.'

  return (
    <main className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-5 px-5 py-6 lg:gap-6 lg:px-8 lg:py-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[0.65rem] uppercase tracking-[0.25em] text-gold lg:hidden">Contatos</p>
          <h1 className="mt-1 text-xl font-semibold lg:mt-0 lg:text-2xl">Contatos</h1>
          <p className="mt-0.5 text-xs text-muted">
            {mode === 'reactivate'
              ? 'Reative quem está atrasado, vencendo ou agendado'
              : 'Busque por nome ou telefone em toda a base'}
            {' · '}
            {countLabel}
          </p>
        </div>
        <div className="shrink-0 lg:w-72">
          <PrimaryButton onClick={() => setFormOpen(true)}>
            <Plus size={20} strokeWidth={2.4} />
            Novo contato
          </PrimaryButton>
        </div>
      </div>

      <div
        role="tablist"
        aria-label="Modo da lista"
        className="grid grid-cols-2 rounded-2xl border border-border bg-card p-1"
      >
        {(
          [
            { id: 'reactivate' as const, label: 'Reativar' },
            { id: 'search' as const, label: 'Buscar' },
          ] as const
        ).map((tab) => {
          const active = mode === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setMode(tab.id)}
              className={`rounded-xl py-2.5 text-sm font-semibold transition-colors ${
                active ? 'bg-gold/15 text-gold' : 'text-muted active:text-foreground'
              }`}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      {mode === 'reactivate' && (
        <div className="flex flex-col gap-2">
          <div className="no-scrollbar flex gap-2 overflow-x-auto">
            {(
              [
                { id: 'overdue' as const, label: 'Atrasados', count: queueCounts.overdue },
                { id: 'due_soon' as const, label: 'Vencendo', count: queueCounts.due_soon },
                { id: 'scheduled' as const, label: 'Agendados', count: queueCounts.scheduled },
              ] as const
            ).map((q) => {
              const active = queue === q.id
              return (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => setQueue(q.id)}
                  aria-pressed={active}
                  className={`shrink-0 rounded-full border px-3.5 py-2 text-xs font-semibold transition-colors ${
                    active
                      ? 'border-gold bg-gold/15 text-gold'
                      : 'border-border bg-card text-muted active:text-foreground'
                  }`}
                >
                  {q.label}
                  <span className="ml-1.5 tabular-nums opacity-80">{q.count}</span>
                </button>
              )
            })}
          </div>
          <p className="px-0.5 text-[0.7rem] leading-snug text-muted/80">
            {queue === 'overdue'
              ? 'Atrasados: cadência já passou — visita registrada e sem retorno no prazo.'
              : queue === 'due_soon'
                ? `Vencendo: retorno previsto nos próximos ${DUE_SOON_DAYS} dias (ainda não atrasou).`
                : 'Agendados: pessoas com horário hoje (conta pessoa, não serviço). Pode coincidir com atrasado/vencendo.'}
          </p>
        </div>
      )}

      {mode === 'search' && (
        <div className="relative">
          <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            type="search"
            inputMode="search"
            enterKeyHint="search"
            autoFocus
            aria-label="Buscar por nome ou telefone"
            placeholder="Nome ou telefone"
            className="w-full rounded-2xl border border-border bg-card py-3.5 pl-12 pr-12 text-base outline-none focus:border-gold"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Limpar busca"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted active:text-foreground"
            >
              <X size={18} />
            </button>
          )}
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-border bg-card px-4 py-3 text-sm text-muted">
          Não foi possível carregar ({error}). Confirme se o banco está configurado.
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        {loading &&
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 border-b border-border px-4 py-3.5 last:border-0">
              <div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-border" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-32 animate-pulse rounded bg-border" />
                <div className="h-2.5 w-40 animate-pulse rounded bg-border" />
              </div>
            </div>
          ))}

        {!loading && !error && visible.length === 0 && (
          <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
            <p className="text-sm text-muted">{emptyCopy}</p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {mode === 'reactivate' && (
                <button
                  type="button"
                  onClick={() => setMode('search')}
                  className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-gold"
                >
                  Buscar contato
                </button>
              )}
              <button
                type="button"
                onClick={() => setFormOpen(true)}
                className="rounded-full border border-gold/40 bg-gold/10 px-3 py-1.5 text-xs font-semibold text-gold"
              >
                Novo contato
              </button>
            </div>
          </div>
        )}

        {!loading &&
          visible.map((c) => {
            const q = contactQueue(c)
            const wa = whatsappHrefFor(c)
            return (
              <div
                key={c.id}
                className="flex items-stretch gap-2 border-b border-border px-3 py-3 last:border-0 sm:px-4"
              >
                <Link
                  href={`/contatos/${c.id}?returnTo=${encodeURIComponent('/contatos')}`}
                  className="flex min-w-0 flex-1 items-center gap-3 active:opacity-90"
                >
                  <Avatar name={c.name || c.phone || '?'} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-medium">{c.name || c.phone || 'Sem nome'}</p>
                      {urgencyBadge(mode === 'reactivate' ? queue : q)}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted">
                      {c.phone ? (
                        <span className="inline-flex items-center gap-1">
                          <Phone size={11} />
                          {c.phone}
                        </span>
                      ) : (
                        'Sem telefone'
                      )}
                      <span aria-hidden> · </span>
                      <span className="text-foreground/80">
                        {serviceLine(c, mode === 'reactivate' ? queue : q)}
                      </span>
                    </p>
                  </div>
                </Link>
                {wa ? (
                  <a
                    href={wa}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => logOutreach(c.id)}
                    aria-label={`Reativar ${c.name || 'contato'} no WhatsApp`}
                    className="flex shrink-0 items-center justify-center gap-1.5 self-center rounded-xl border border-success/40 bg-success/10 px-3 py-2.5 text-xs font-semibold text-success active:scale-[0.98]"
                  >
                    <MessageSquare size={14} />
                    <span className="hidden sm:inline">Reativar</span>
                  </a>
                ) : (
                  <span className="flex shrink-0 items-center self-center px-2 text-[0.65rem] text-muted">
                    Sem WA
                  </span>
                )}
              </div>
            )
          })}
      </div>

      {formOpen && (
        <NewContactSheet
          onClose={() => setFormOpen(false)}
          onCreated={(createdName) => {
            setMode('search')
            setQuery(createdName)
            setDebouncedQuery(createdName.trim())
          }}
        />
      )}
    </main>
  )
}

function NewContactSheet({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (name: string) => void
}) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [notes, setNotes] = useState('')
  const [serviceName, setServiceName] = useState('')
  const [serviceCategory, setServiceCategory] = useState('corte')
  const [cadence, setCadence] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setFormError(null)
    const digits = phone.replace(/\D/g, '')
    if (digits.length < 8) {
      setFormError('Telefone com pelo menos 8 dígitos')
      setSubmitting(false)
      return
    }
    try {
      const services =
        serviceName.trim().length > 0
          ? [
              {
                name: serviceName.trim(),
                category: serviceCategory,
                cadenceDays: cadence ? Number(cadence) : undefined,
              },
            ]
          : undefined

      const res = await apiFetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone, notes: notes || undefined, services }),
      })
      const json = await res.json()
      if (!res.ok || json.error) {
        setFormError(json.error ?? 'Erro ao salvar')
        return
      }
      onCreated(name.trim())
      onClose()
    } catch (err) {
      setFormError(String(err))
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
          <h2 className="text-base font-semibold">Novo contato</h2>
          <button type="button" onClick={onClose} aria-label="Fechar" className="text-muted active:text-foreground">
            <X size={22} />
          </button>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-4">
          <Field label="Nome">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
              className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-base outline-none focus:border-gold"
              placeholder="Nome do cliente"
            />
          </Field>
          <Field label="Telefone (mín. 8 dígitos)">
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              type="tel"
              inputMode="tel"
              className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-base outline-none focus:border-gold"
              placeholder="(11) 90000-0000"
            />
          </Field>
          <Field label="Observações (opcional)">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full resize-none rounded-xl border border-border bg-surface px-4 py-3 text-base outline-none focus:border-gold"
              placeholder="Ex.: quer agendar coloração"
            />
          </Field>

          <div className="rounded-xl border border-border bg-surface/50 p-4">
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted">Serviço inicial (opcional)</p>
            <div className="flex flex-col gap-3">
              <input
                value={serviceName}
                onChange={(e) => setServiceName(e.target.value)}
                placeholder="Ex.: Corte feminino"
                className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-base outline-none focus:border-gold"
              />
              <div className="grid grid-cols-2 gap-3">
                <select
                  value={serviceCategory}
                  onChange={(e) => setServiceCategory(e.target.value)}
                  className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-base outline-none focus:border-gold"
                >
                  {Object.entries(CATEGORY_LABEL).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
                <input
                  value={cadence}
                  onChange={(e) => setCadence(e.target.value)}
                  type="number"
                  placeholder="Cadência (dias)"
                  className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-base outline-none focus:border-gold"
                />
              </div>
            </div>
          </div>

          {formError && <p className="text-sm text-danger">{formError}</p>}

          <PrimaryButton type="submit" disabled={submitting}>
            {submitting ? 'Salvando…' : 'Salvar contato'}
          </PrimaryButton>
        </form>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs uppercase tracking-wide text-muted">{label}</span>
      {children}
    </label>
  )
}
