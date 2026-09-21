'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertTriangle, ChevronRight, Clock, Search } from 'lucide-react'
import { IntranetPage } from '../_components/intranet/IntranetPage'
import { SectionCard } from '../_components/ui'
import { apiFetch } from '@/lib/api-client'
import { contactHref } from '@/lib/auth-redirect'
import { fmtScheduleParts } from '@/lib/salon/format'
import { countDistinctContactIds } from '@/lib/salon/headcount'

type PlaybookItem = {
  contact_id: string
  contact_name: string | null
  contact_phone: string | null
  overdue: number
  max_overdue_days: number
  due_soon: number
  scheduled_today: number
  recommendations: { type: string; title: string; detail: string }[]
}

type ScheduleItem = {
  id: string
  contact_id: string
  contact_name: string | null
  name: string
  scheduled_at: string
}

type HojePayload = {
  day: string
  playbook: PlaybookItem[]
  playbook_focus?: string
  scheduleToday: ScheduleItem[]
  schedule_heads?: number
  schedule_services?: number
  leads?: { novos: number }
  overdue_contacts?: number
  overdue_total?: number
}

export default function RecepcaoPage() {
  const router = useRouter()
  const [data, setData] = useState<HojePayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    apiFetch('/api/hoje', { cache: 'no-store' })
      .then(async (res) => {
        const json = await res.json()
        if (!res.ok) throw new Error(json.error ?? 'Falha ao carregar')
        if (!cancelled) setData(json.data as HojePayload)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Falha ao carregar')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const heads = useMemo(() => {
    if (!data) return null
    return data.schedule_heads ?? countDistinctContactIds(data.scheduleToday)
  }, [data])

  function onSearch(e: React.FormEvent) {
    e.preventDefault()
    const term = q.trim()
    if (!term) {
      router.push('/contatos')
      return
    }
    router.push(`/contatos?q=${encodeURIComponent(term)}`)
  }

  return (
    <IntranetPage
      kicker="Balcão"
      title="Recepção"
      subtitle="Chegada do cliente — agenda de hoje e fila para reagendar/confirmar. Sem ranking nem caixa."
    >
      <form onSubmit={onSearch} className="flex gap-2">
        <label className="relative flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar cliente (nome, telefone…)"
            className="w-full rounded-xl border border-border bg-background py-2.5 pl-9 pr-3 text-sm"
          />
        </label>
        <button
          type="submit"
          className="rounded-xl border border-foreground bg-foreground px-4 text-sm font-medium text-background"
        >
          Contatos
        </button>
      </form>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="grid gap-3 sm:grid-cols-3">
        <SectionCard title="Na agenda">
          <p className="text-2xl font-semibold tabular-nums">
            {loading && !data ? '…' : (heads ?? '—')}
          </p>
          <p className="mt-1 text-xs text-muted">pessoas hoje</p>
        </SectionCard>
        <SectionCard title="Fila playbook">
          <p className="text-2xl font-semibold tabular-nums">
            {loading && !data ? '…' : (data?.playbook.length ?? '—')}
          </p>
          <p className="mt-1 text-xs text-muted">{data?.playbook_focus ?? 'reagendar / confirmar'}</p>
        </SectionCard>
        <SectionCard title="Atrasados">
          <p className="text-2xl font-semibold tabular-nums">
            {loading && !data ? '…' : (data?.overdue_contacts ?? '—')}
          </p>
          <p className="mt-1 text-xs text-muted">
            {data?.overdue_total != null ? `${data.overdue_total} serviço(s)` : 'no playbook'}
          </p>
        </SectionCard>
      </div>

      <SectionCard
        title="Agenda de hoje"
        badge={
          <span className="text-xs text-muted">
            {loading && !data
              ? '…'
              : `${data?.schedule_services ?? data?.scheduleToday.length ?? 0} linha(s)`}
          </span>
        }
      >
        {loading && !data && <p className="text-sm text-muted">Carregando…</p>}
        {!loading && (data?.scheduleToday.length ?? 0) === 0 && (
          <p className="text-sm text-muted">Nenhum horário na agenda de hoje.</p>
        )}
        <ul className="divide-y divide-border">
          {data?.scheduleToday.map((s) => {
            const when = fmtScheduleParts(s.scheduled_at)
            return (
              <li key={s.id}>
                <Link
                  href={contactHref(s.contact_id, '/recepcao')}
                  className="flex items-center justify-between gap-3 py-2.5 hover:opacity-90"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {s.contact_name ?? 'Cliente'}
                      <span className="ml-2 text-xs font-normal text-muted">{when.time}</span>
                    </p>
                    <p className="truncate text-xs text-muted">{s.name}</p>
                  </div>
                  <ChevronRight size={16} className="shrink-0 text-muted" />
                </Link>
              </li>
            )
          })}
        </ul>
      </SectionCard>

      <SectionCard
        title="Playbook do balcão"
        badge={<span className="text-xs text-muted">{data?.playbook.length ?? 0}</span>}
      >
        {data?.playbook_focus && (
          <p className="mb-2 text-[0.65rem] text-muted">{data.playbook_focus}</p>
        )}
        {!loading && (data?.playbook.length ?? 0) === 0 && (
          <p className="text-sm text-muted">Nada na fila de reagendar/confirmar agora.</p>
        )}
        <ul className="divide-y divide-border">
          {data?.playbook.map((a) => (
            <li key={a.contact_id}>
              <Link
                href={contactHref(a.contact_id, '/recepcao')}
                className="flex items-center justify-between gap-3 py-2.5 hover:opacity-90"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="truncate text-sm font-medium">{a.contact_name ?? 'Cliente'}</p>
                    {a.max_overdue_days > 0 && (
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-danger/15 px-1.5 py-0.5 text-[0.6rem] font-semibold text-danger">
                        <AlertTriangle size={10} />
                        {a.max_overdue_days}d
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
                      <span className="text-gold-strong">{a.recommendations[0].title}</span>
                      {' · '}
                      {a.recommendations[0].detail}
                    </p>
                  )}
                </div>
                <ChevronRight size={16} className="shrink-0 text-muted" />
              </Link>
            </li>
          ))}
        </ul>
      </SectionCard>

      {(data?.leads?.novos ?? 0) > 0 && (
        <Link
          href="/contatos?queue=novos"
          className="flex items-center justify-between rounded-2xl border border-border bg-background px-4 py-3 text-sm"
        >
          <span>{data!.leads!.novos} contato(s) novo(s)</span>
          <ChevronRight size={16} className="text-muted" />
        </Link>
      )}

      <p className="text-xs text-muted">
        Visão completa com caixa/KPIs:{' '}
        <Link href="/hoje" className="text-gold-strong hover:underline">
          Operação do dia
        </Link>
        {' · '}
        <Link href="/pipeline" className="text-gold-strong hover:underline">
          Agenda do dia
        </Link>
      </p>
    </IntranetPage>
  )
}
