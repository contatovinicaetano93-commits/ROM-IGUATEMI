'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronRight, Search } from 'lucide-react'
import { IntranetPage } from '../_components/intranet/IntranetPage'
import { SectionCard } from '../_components/ui'
import { apiFetch } from '@/lib/api-client'

type QueueCounts = {
  overdue: number | null
  due_soon: number | null
  scheduled: number | null
  novos: number | null
  sem_servicos: number | null
  ativados: number | null
}

type ReactivationKpi = {
  window_days: number
  contacted: number
  reactivated: number
  rate: number | null
}

type HojeSlice = {
  reactivation?: ReactivationKpi
  overdue_contacts?: number
  overdue_total?: number
  leads?: { novos: number }
}

function fmtCount(n: number | null | undefined, loading: boolean, hasData: boolean): string {
  if (loading && !hasData) return '…'
  if (n == null) return '—'
  return String(n)
}

export default function PosVendaPage() {
  const router = useRouter()
  const [queues, setQueues] = useState<QueueCounts | null>(null)
  const [hoje, setHoje] = useState<HojeSlice | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([
      apiFetch('/api/contacts?counts=1', { cache: 'no-store' }).then(async (res) => {
        const json = await res.json()
        if (!res.ok) throw new Error(json.error ?? 'Falha ao carregar filas')
        return json.meta?.queues as Partial<QueueCounts> | undefined
      }),
      apiFetch('/api/hoje', { cache: 'no-store' }).then(async (res) => {
        const json = await res.json()
        if (!res.ok) throw new Error(json.error ?? 'Falha ao carregar KPI')
        return json.data as HojeSlice
      }),
    ])
      .then(([qCounts, hojeData]) => {
        if (cancelled) return
        setQueues({
          overdue: typeof qCounts?.overdue === 'number' ? qCounts.overdue : null,
          due_soon: typeof qCounts?.due_soon === 'number' ? qCounts.due_soon : null,
          scheduled: typeof qCounts?.scheduled === 'number' ? qCounts.scheduled : null,
          novos: typeof qCounts?.novos === 'number' ? qCounts.novos : null,
          sem_servicos: typeof qCounts?.sem_servicos === 'number' ? qCounts.sem_servicos : null,
          ativados: typeof qCounts?.ativados === 'number' ? qCounts.ativados : null,
        })
        setHoje(hojeData)
        setError(null)
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

  function onSearch(e: React.FormEvent) {
    e.preventDefault()
    const term = q.trim()
    if (!term) {
      router.push('/contatos')
      return
    }
    router.push(`/contatos?q=${encodeURIComponent(term)}`)
  }

  const reactivation = hoje?.reactivation ?? null

  return (
    <IntranetPage
      kicker="Retorno"
      title="Pós-venda"
      subtitle="Filas de reativar, ativados e KPI de WhatsApp — sem caixa nem ranking."
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
        <SectionCard title="Contatados">
          <p className="text-2xl font-semibold tabular-nums">
            {fmtCount(reactivation?.contacted, loading, Boolean(hoje))}
          </p>
          <p className="mt-1 text-xs text-muted">
            {reactivation?.window_days != null
              ? `WA · ${reactivation.window_days} dias`
              : 'reativação WA'}
          </p>
        </SectionCard>
        <SectionCard title="Reativados">
          <p className="text-2xl font-semibold tabular-nums">
            {fmtCount(reactivation?.reactivated, loading, Boolean(hoje))}
          </p>
          <p className="mt-1 text-xs text-muted">
            {reactivation?.rate != null ? `${reactivation.rate}% da janela` : 'voltaram na janela'}
          </p>
        </SectionCard>
        <SectionCard title="Atrasados hoje">
          <p className="text-2xl font-semibold tabular-nums">
            {fmtCount(hoje?.overdue_contacts, loading, Boolean(hoje))}
          </p>
          <p className="mt-1 text-xs text-muted">
            {hoje?.overdue_total != null ? `${hoje.overdue_total} serviço(s)` : 'no playbook'}
          </p>
        </SectionCard>
      </div>

      <SectionCard title="Filas de retorno">
        <ul className="divide-y divide-border">
          {(
            [
              {
                href: '/contatos?queue=overdue',
                label: 'Atrasados',
                detail: 'retorno vencido — prioridade de ligação/WA',
                count: queues?.overdue,
              },
              {
                href: '/contatos?queue=due_soon',
                label: 'Vencendo',
                detail: 'próximos a vencer o ciclo',
                count: queues?.due_soon,
              },
              {
                href: '/contatos?queue=ativados',
                label: 'Ativados',
                detail: 'já contatados — aguardando retorno na Avec',
                count: queues?.ativados,
              },
              {
                href: '/contatos?queue=novos',
                label: 'Novos',
                detail: 'ainda sem vínculo no salão',
                count: queues?.novos,
              },
            ] as const
          ).map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="flex items-center justify-between gap-3 py-2.5 hover:opacity-90"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{item.label}</p>
                  <p className="truncate text-xs text-muted">{item.detail}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-sm font-semibold tabular-nums">
                    {fmtCount(item.count, loading, Boolean(queues))}
                  </span>
                  <ChevronRight size={16} className="text-muted" />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </SectionCard>

      <p className="text-xs text-muted">
        Lista completa e ficha do cliente:{' '}
        <Link href="/contatos" className="text-gold-strong hover:underline">
          Contatos
        </Link>
        {' · '}
        KPI no dia:{' '}
        <Link href="/hoje" className="text-gold-strong hover:underline">
          Operação do dia
        </Link>
      </p>
    </IntranetPage>
  )
}
