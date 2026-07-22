'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Plus, X, Phone, Search, ChevronRight, AlertTriangle, Clock, Calendar } from 'lucide-react'
import {
  Avatar,
  StatusPill,
  PrimaryButton,
  CHANNEL_LABEL,
  STATUS_LABEL,
} from '../_components/ui'
import { apiFetch } from '@/lib/api-client'
import { timeAgo } from '@/lib/salon/format'
import { CATEGORY_LABEL } from '@/lib/salon/constants'

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

export default function ContatosPage() {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [pendingOnly, setPendingOnly] = useState(false)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [channelFilter, setChannelFilter] = useState<string>('all')
  const [query, setQuery] = useState('')

  async function load() {
    setLoading(true)
    try {
      const params = new URLSearchParams({ sort: 'urgency' })
      if (pendingOnly) params.set('pending', 'true')
      const res = await apiFetch(`/api/contacts?${params}`, { cache: 'no-store' })
      const json = await res.json()
      if (json.error) setError(json.error)
      else setContacts(json.data ?? [])
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingOnly])

  const statusOptions = Array.from(new Set(contacts.map((c) => c.status)))
  const channelOptions = Array.from(new Set(contacts.map((c) => c.channel)))
  const hasFilters = statusOptions.length > 0 || channelOptions.length > 0

  const q = query.trim().toLowerCase()
  const qDigits = q.replace(/\D/g, '')
  const filtered = contacts.filter((c) => {
    if (statusFilter !== 'all' && c.status !== statusFilter) return false
    if (channelFilter !== 'all' && c.channel !== channelFilter) return false
    if (!q) return true
    const nameMatch = c.name?.toLowerCase().includes(q) ?? false
    const phoneMatch = qDigits.length > 0 && (c.phone?.replace(/\D/g, '').includes(qDigits) ?? false)
    return nameMatch || phoneMatch
  })

  return (
    <main className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-5 px-5 py-6 lg:gap-6 lg:px-8 lg:py-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[0.65rem] uppercase tracking-[0.25em] text-gold lg:hidden">Contatos</p>
          <h1 className="mt-1 text-xl font-semibold lg:mt-0 lg:text-2xl">Clientes & leads</h1>
        <p className="mt-0.5 text-xs text-muted">
          {loading
            ? 'Todos os canais, em um só lugar'
            : `${filtered.length} de ${contacts.length} ${contacts.length === 1 ? 'contato' : 'contatos'}`}
        </p>
        </div>
        <div className="shrink-0 lg:w-72">
          <PrimaryButton onClick={() => setFormOpen(true)}>
            <Plus size={20} strokeWidth={2.4} />
            Novo contato
          </PrimaryButton>
        </div>
      </div>

      {contacts.length > 0 && (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setPendingOnly((v) => !v)}
            aria-pressed={pendingOnly}
            className={`flex items-center justify-center gap-2 rounded-2xl border py-2.5 text-sm font-medium transition-colors ${
              pendingOnly
                ? 'border-gold bg-gold/15 text-gold'
                : 'border-border bg-card text-muted active:text-foreground'
            }`}
          >
            <AlertTriangle size={15} />
            {pendingOnly ? 'Mostrando só pendentes' : 'Só ações pendentes'}
          </button>
        </div>
      )}

      {contacts.length > 0 && (
        <div className="relative">
          <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            type="search"
            inputMode="search"
            enterKeyHint="search"
            aria-label="Buscar por nome ou telefone"
            placeholder="Buscar por nome ou telefone"
            className="w-full rounded-2xl border border-border bg-card py-2.5 pl-10 pr-10 text-base outline-none focus:border-gold"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Limpar busca"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted active:text-foreground"
            >
              <X size={18} />
            </button>
          )}
        </div>
      )}

      {hasFilters && (
        <div className="flex flex-col gap-2">
          <FilterRow
            label="Status"
            options={statusOptions.map((s) => ({ value: s, label: STATUS_LABEL[s] ?? s }))}
            active={statusFilter}
            onSelect={setStatusFilter}
          />
          <FilterRow
            label="Canal"
            options={channelOptions.map((c) => ({ value: c, label: CHANNEL_LABEL[c] ?? c }))}
            active={channelFilter}
            onSelect={setChannelFilter}
          />
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
                <div className="h-2.5 w-20 animate-pulse rounded bg-border" />
              </div>
            </div>
          ))}

        {!loading && contacts.length === 0 && !error && (
          <p className="px-4 py-12 text-center text-sm text-muted">Nenhum contato ainda. Toque em “Novo contato”.</p>
        )}

        {!loading && contacts.length > 0 && filtered.length === 0 && (
          <p className="px-4 py-12 text-center text-sm text-muted">Nenhum contato encontrado.</p>
        )}

        {!loading &&
          filtered.map((c) => (
            <Link
              key={c.id}
              href={`/contatos/${c.id}`}
              className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-0 active:bg-surface"
            >
              <Avatar name={c.name || c.phone || '?'} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{c.name || c.phone || 'Sem nome'}</p>
                <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-muted">
                  <span>{CHANNEL_LABEL[c.channel] ?? c.channel}</span>
                  <span aria-hidden>·</span>
                  <span>{timeAgo(c.created_at)}</span>
                  {c.top_action && (
                    <>
                      <span aria-hidden>·</span>
                      <span className="truncate text-gold">{c.top_action}</span>
                    </>
                  )}
                  {c.phone && (
                    <>
                      <span aria-hidden>·</span>
                      <span className="inline-flex items-center gap-1">
                        <Phone size={11} />
                        {c.phone}
                      </span>
                    </>
                  )}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                {(c.max_overdue_days > 0 || c.due_soon > 0 || c.scheduled_soon > 0) && (
                  <div className="flex items-center gap-1">
                    {c.max_overdue_days > 0 && (
                      <span
                        title={`${c.max_overdue_days} dia(s) sem retorno · ${c.overdue} serviço(s) atrasado(s)`}
                        className="inline-flex items-center gap-0.5 rounded-full bg-danger/15 px-1.5 py-0.5 text-[0.6rem] font-semibold text-danger"
                      >
                        <AlertTriangle size={10} />
                        {c.max_overdue_days}
                      </span>
                    )}
                    {c.due_soon > 0 && (
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-warning/15 px-1.5 py-0.5 text-[0.6rem] font-semibold text-warning">
                        <Clock size={10} />
                        {c.due_soon}
                      </span>
                    )}
                    {c.scheduled_soon > 0 && (
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-sky-500/15 px-1.5 py-0.5 text-[0.6rem] font-semibold text-sky-300">
                        <Calendar size={10} />
                        {c.scheduled_soon}
                      </span>
                    )}
                  </div>
                )}
                <StatusPill status={c.status} />
              </div>
              <ChevronRight size={16} className="shrink-0 text-muted" />
            </Link>
          ))}
      </div>

      {formOpen && <NewContactSheet onClose={() => setFormOpen(false)} onCreated={load} />}
    </main>
  )
}

function FilterRow({
  label,
  options,
  active,
  onSelect,
}: {
  label: string
  options: { value: string; label: string }[]
  active: string
  onSelect: (value: string) => void
}) {
  const chips = [{ value: 'all', label: 'Todos' }, ...options]
  return (
    <div className="flex items-center gap-2">
      <span className="w-12 shrink-0 text-[0.6rem] uppercase tracking-wide text-muted">{label}</span>
      <div className="no-scrollbar flex gap-2 overflow-x-auto">
        {chips.map((chip) => {
          const isActive = active === chip.value
          return (
            <button
              key={chip.value}
              type="button"
              onClick={() => onSelect(chip.value)}
              aria-pressed={isActive}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-xs transition-colors ${
                isActive
                  ? 'border-gold bg-gold/15 text-gold'
                  : 'border-border bg-card text-muted active:text-foreground'
              }`}
            >
              {chip.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function NewContactSheet({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
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
      onCreated()
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
          <Field label="Telefone">
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
