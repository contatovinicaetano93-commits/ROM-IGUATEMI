'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Columns3, RefreshCw } from 'lucide-react'
import { apiFetch } from '@/lib/api-client'
import { fmtScheduleParts } from '@/lib/salon/format'
import { CountBadge } from '../_components/ui'

interface PipelineCard {
  id: string
  contact_id: string
  contact_name: string | null
  name: string
  professional_name: string | null
  scheduled_at: string | null
  last_done_at: string | null
}

interface PipelineData {
  day: string
  scheduled: PipelineCard[]
  completed: PipelineCard[]
  counts: { scheduled: number; completed: number; total: number }
}

function PipelineColumn({
  title,
  count,
  tone,
  items,
  timeFrom,
  emptyLabel,
}: {
  title: string
  count: number
  tone: 'gold' | 'success'
  items: PipelineCard[]
  timeFrom: (item: PipelineCard) => string | null
  emptyLabel: string
}) {
  return (
    <section className="flex min-h-[24rem] min-w-0 flex-1 flex-col rounded-2xl border border-border bg-card">
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <h2 className="text-sm font-medium">{title}</h2>
        <CountBadge value={String(count)} tone={tone} />
      </header>
      <div className="flex flex-1 flex-col gap-2 p-3">
        {items.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-muted">{emptyLabel}</p>
        ) : (
          items.map((item) => {
            const iso = timeFrom(item)
            const when = iso ? fmtScheduleParts(iso) : null
            return (
              <Link
                key={item.id}
                href={`/contatos/${item.contact_id}`}
                className="block rounded-xl border border-border bg-surface px-3 py-3 transition-colors hover:border-gold/40 hover:bg-background"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {item.contact_name ?? 'Cliente'}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted">{item.name}</p>
                    {item.professional_name && (
                      <p className="mt-1 truncate text-[0.7rem] text-muted/80">{item.professional_name}</p>
                    )}
                  </div>
                  {when && (
                    <div className="shrink-0 text-right">
                      <p className="text-base font-semibold tabular-nums text-gold">{when.time}</p>
                      <p className="text-[0.65rem] uppercase tracking-wide text-muted">{when.day}</p>
                    </div>
                  )}
                </div>
              </Link>
            )
          })
        )}
      </div>
    </section>
  )
}

export default function PipelinePage() {
  const [data, setData] = useState<PipelineData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiFetch('/api/pipeline', { cache: 'no-store' })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      setData(json.data)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

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
            Colunas com o que já temos da Avec: agendados e concluídos.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
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

      <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch">
        <PipelineColumn
          title="Agendados"
          count={loading ? 0 : (data?.counts.scheduled ?? 0)}
          tone="gold"
          items={loading ? [] : (data?.scheduled ?? [])}
          timeFrom={(item) => item.scheduled_at}
          emptyLabel={loading ? 'Carregando…' : 'Nenhum agendamento aberto hoje.'}
        />
        <PipelineColumn
          title="Concluídos"
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
