'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { IntranetPage } from '../_components/intranet/IntranetPage'
import { SectionCard } from '../_components/ui'
import { useClientSession } from '../_components/SessionProvider'

type Payload = {
  mode: 'unit' | 'professional'
  title: string
  day: string
  revenue: number | null
  scheduled: number | null
  attended: number | null
  no_shows: number | null
  cancelled: number | null
  ticket_avg: number | null
  courtesy: number | null
  professional_name: string | null
  can_view_money: boolean
  link_to_agenda: string
  link_to_month: string
}

function formatMoney(value: number | null): string {
  if (value == null) return '—'
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatNum(value: number | null): string {
  if (value == null) return '—'
  return value.toLocaleString('pt-BR')
}

export default function ResumoDoDiaPage() {
  const { session } = useClientSession()
  const [data, setData] = useState<Payload | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/kpis/resumo-do-dia', { credentials: 'include', cache: 'no-store' })
      .then(async (res) => {
        const json = await res.json()
        if (!res.ok) throw new Error(json.error ?? 'Falha ao carregar')
        if (!cancelled) setData(json.data as Payload)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Falha ao carregar')
      })
    return () => {
      cancelled = true
    }
  }, [])

  const isPro = data?.mode === 'professional'
  const title = data?.title ?? 'Resumo do dia'
  const subtitle = isPro
    ? `${data?.professional_name ?? session?.displayName ?? 'Você'} — só o que é seu hoje. Agenda e mês ficam nas outras seções.`
    : 'Unidade ao vivo — faturamento, agenda e no-shows do dia. Diferente da Agenda (cards) e do Meu faturamento (mês).'

  return (
    <IntranetPage kicker="Operação" title={title} subtitle={subtitle}>
      {error && <p className="text-sm text-danger">{error}</p>}

      <p className="text-xs text-muted">
        {data?.day ? `Dia ${data.day}` : 'Carregando…'}
        {isPro ? ' · visão profissional' : ' · visão da unidade'}
      </p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <SectionCard title={isPro ? 'Produção do dia' : 'Faturamento do dia'}>
          <p className="text-2xl font-semibold">{formatMoney(data?.revenue ?? null)}</p>
          <p className="mt-1 text-xs text-muted">
            {isPro
              ? 'Soma dos serviços concluídos com preço (estimativa local).'
              : data?.can_view_money
                ? 'Caixa Avec do dia (sync rápido).'
                : 'Sem permissão de ver R$ da unidade.'}
          </p>
        </SectionCard>
        <SectionCard title="Agendados">
          <p className="text-2xl font-semibold">{formatNum(data?.scheduled ?? null)}</p>
          <p className="mt-1 text-xs text-muted">Pessoas ainda na fila de hoje</p>
        </SectionCard>
        <SectionCard title="Atendidos">
          <p className="text-2xl font-semibold">{formatNum(data?.attended ?? null)}</p>
          <p className="mt-1 text-xs text-muted">Concluídos hoje</p>
        </SectionCard>
        <SectionCard title="No-show">
          <p className="text-2xl font-semibold">{formatNum(data?.no_shows ?? null)}</p>
          <p className="mt-1 text-xs text-muted">
            {isPro ? 'Ainda sem fonte por profissional (Avec unidade).' : 'Report Avec do dia'}
          </p>
        </SectionCard>
        <SectionCard title="Cancelados">
          <p className="text-2xl font-semibold">{formatNum(data?.cancelled ?? null)}</p>
        </SectionCard>
        <SectionCard title="Ticket médio">
          <p className="text-2xl font-semibold">{formatMoney(data?.ticket_avg ?? null)}</p>
        </SectionCard>
      </div>

      <SectionCard title="Atalhos">
        <div className="flex flex-wrap gap-3 text-sm">
          <Link href={data?.link_to_agenda ?? '/pipeline'} className="text-gold-strong hover:underline">
            Agenda do dia →
          </Link>
          <Link
            href={data?.link_to_month ?? '/meu-faturamento'}
            className="text-gold-strong hover:underline"
          >
            Meu faturamento (mês) →
          </Link>
        </div>
      </SectionCard>
    </IntranetPage>
  )
}
