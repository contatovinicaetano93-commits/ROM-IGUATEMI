'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Columns3, RefreshCw } from 'lucide-react'
import { apiFetch, clearApiClientCache } from '@/lib/api-client'
import { useLiveRefresh } from '@/lib/use-live-refresh'
import { fmtScheduleParts } from '@/lib/salon/format'
import { contactHref } from '@/lib/auth-redirect'
import { CountBadge } from '../_components/ui'
import {
  CollapsibleBody,
  SectionToggleHeader,
  useSectionOpen,
} from '../_components/CollapsibleSection'

type NonBillableKind = 'teste' | 'cortesia'

interface PipelineCard {
  id: string
  contact_id: string
  contact_name: string | null
  name: string
  professional_name: string | null
  scheduled_at: string | null
  last_done_at: string | null
  non_billable_kind?: NonBillableKind
}

interface PipelineData {
  day: string
  scheduled: PipelineCard[]
  courtesy: PipelineCard[]
  completed: PipelineCard[]
  counts: {
    /** Badges = pessoas (cabeças). */
    scheduled: number
    courtesy: number
    completed: number
    total: number
    scheduled_services?: number
    courtesy_services?: number
    completed_services?: number
  }
}

function kindLabel(kind: NonBillableKind | undefined): string | null {
  if (kind == null) return null
  switch (kind) {
    case 'teste':
      return 'Teste'
    case 'cortesia':
      return 'Cortesia'
    default: {
      const _exhaustive: never = kind
      return _exhaustive
    }
  }
}

function PipelineColumn({
  title,
  hint,
  count,
  tone,
  items,
  timeFrom,
  emptyLabel,
  storageKey,
  showKind,
}: {
  title: string
  /** Uma linha sob o título — definição operacional da coluna. */
  hint?: string
  count: number
  tone: 'gold' | 'success' | 'sky'
  items: PipelineCard[]
  timeFrom: (item: PipelineCard) => string | null
  emptyLabel: string
  storageKey: string
  showKind?: boolean
}) {
  const [open, setOpen] = useSectionOpen(storageKey, true)
  return (
    <section
      className={`flex min-w-0 flex-1 flex-col rounded-2xl border border-border bg-card ${
        open ? 'min-h-[24rem]' : ''
      }`}
    >
      <header className="border-b border-border px-4 py-3">
        <SectionToggleHeader
          title={title}
          badge={<CountBadge value={String(count)} tone={tone} />}
          open={open}
          onToggle={() => setOpen((v) => !v)}
        />
        {hint ? <p className="mt-1.5 text-[0.7rem] leading-snug text-muted">{hint}</p> : null}
      </header>
      <CollapsibleBody open={open} className="flex flex-1 flex-col gap-2 p-3">
        {items.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-muted">{emptyLabel}</p>
        ) : (
          items.map((item) => {
            const iso = timeFrom(item)
            const when = iso ? fmtScheduleParts(iso) : null
            const kind = showKind ? kindLabel(item.non_billable_kind) : null
            return (
              <Link
                key={item.id}
                href={contactHref(item.contact_id, '/pipeline')}
                className="block rounded-xl border border-border bg-surface px-3 py-3 transition-colors hover:border-gold/40 hover:bg-background"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <p className="truncate text-sm font-medium text-foreground">
                        {item.contact_name ?? 'Cliente'}
                      </p>
                      {kind ? (
                        <span className="shrink-0 text-[0.65rem] uppercase tracking-wide text-sky-300">
                          {kind}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted">{item.name}</p>
                    {item.professional_name && (
                      <p className="mt-1 truncate text-[0.7rem] text-muted/80">{item.professional_name}</p>
                    )}
                  </div>
                  {when && (
                    <div className="shrink-0 text-right">
                      <p
                        className={`text-base font-semibold tabular-nums ${
                          tone === 'sky' ? 'text-sky-300' : 'text-gold'
                        }`}
                      >
                        {when.time}
                      </p>
                      <p className="text-[0.65rem] uppercase tracking-wide text-muted">{when.day}</p>
                    </div>
                  )}
                </div>
              </Link>
            )
          })
        )}
      </CollapsibleBody>
    </section>
  )
}

export default function PipelinePage() {
  const [data, setData] = useState<PipelineData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (opts?: { fresh?: boolean; silent?: boolean }) => {
    const silent = opts?.silent === true
    if (opts?.fresh) {
      setLoading(true)
      setError(null)
    }
    try {
      if (opts?.fresh || silent) clearApiClientCache('/api/pipeline')
      const res = await apiFetch('/api/pipeline', {
        cache: 'no-store',
        clientCache: opts?.fresh || silent ? false : undefined,
      })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      setData(json.data)
      setError(null)
    } catch (e) {
      if (!silent) setError(e instanceof Error ? e.message : String(e))
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await apiFetch('/api/pipeline', { cache: 'no-store' })
        const json = await res.json()
        if (cancelled) return
        if (json.error) throw new Error(json.error)
        setData(json.data)
        setError(null)
      } catch (e) {
        if (cancelled) return
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useLiveRefresh(() => {
    void (async () => {
      try {
        clearApiClientCache('/api/pipeline')
        const res = await apiFetch('/api/pipeline', { cache: 'no-store', clientCache: false })
        const json = await res.json()
        if (json.error) throw new Error(json.error)
        setData(json.data)
      } catch {
        // silent refresh — keep last good snapshot
      }
    })()
  }, 60_000)

  const dayLabel = data
    ? new Date(data.day + 'T12:00:00').toLocaleDateString('pt-BR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      })
    : ''

  return (
    <main className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-5 px-5 py-6 lg:gap-6 lg:px-8 lg:py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-[0.65rem] uppercase tracking-[0.25em] text-gold">
            <Columns3 size={12} /> Pipeline
          </p>
          <h1 className="mt-1 text-xl font-semibold capitalize lg:text-2xl">
            {dayLabel || 'Agenda do dia'}
          </h1>
          <p className="mt-1 text-sm text-muted">
            Badges contam pessoas. Cards = linhas de serviço. Agendados = abertos do dia · Teste /
            Cortesia = isolados do fluxo · Concluídos = pagos/fechados do dia.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load({ fresh: true })}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-full border border-border px-3 py-2 text-xs font-medium text-foreground/90 transition-colors hover:bg-card disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : undefined} />
          Atualizar
        </button>
      </div>

      {error && (
        <div className="rounded-2xl border border-border bg-card px-4 py-3 text-sm text-muted">
          Não foi possível carregar o pipeline ({error}).
        </div>
      )}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <PipelineColumn
          title="Agendados"
          hint="Abertos do dia (agenda e encaixe), sem teste/cortesia."
          storageKey="pipeline.section.agendados.open"
          count={loading ? 0 : (data?.counts.scheduled ?? 0)}
          tone="gold"
          items={loading ? [] : (data?.scheduled ?? [])}
          timeFrom={(item) => item.scheduled_at}
          emptyLabel={loading ? 'Carregando…' : 'Nenhum atendimento aberto hoje.'}
        />
        <PipelineColumn
          title="Teste / Cortesia"
          hint="Heurística por nome/serviço/notes ou preço zero já pago."
          storageKey="pipeline.section.cortesia.open"
          count={loading ? 0 : (data?.counts.courtesy ?? 0)}
          tone="sky"
          items={loading ? [] : (data?.courtesy ?? [])}
          timeFrom={(item) => item.last_done_at ?? item.scheduled_at}
          emptyLabel={loading ? 'Carregando…' : 'Nenhum teste ou cortesia hoje.'}
          showKind
        />
        <PipelineColumn
          title="Concluídos"
          hint="Pagos/fechados do dia, sem teste/cortesia."
          storageKey="pipeline.section.concluidos.open"
          count={loading ? 0 : (data?.counts.completed ?? 0)}
          tone="success"
          items={loading ? [] : (data?.completed ?? [])}
          timeFrom={(item) => item.last_done_at}
          emptyLabel={loading ? 'Carregando…' : 'Nenhum atendimento concluído hoje.'}
        />
      </div>
    </main>
  )
}
