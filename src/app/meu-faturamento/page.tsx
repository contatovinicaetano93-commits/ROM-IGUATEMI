'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { IntranetPage } from '../_components/intranet/IntranetPage'
import { SectionCard } from '../_components/ui'
import { useClientSession } from '../_components/SessionProvider'

type Payload = {
  month: string | null
  reference_day: string | null
  link_name: string | null
  linked: boolean
  matched_name: string | null
  revenue: number | null
  attended: number | null
  ticket_avg: number | null
  occupancy: number | null
}

function formatMoney(value: number | null): string {
  if (value == null) return '—'
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatNum(value: number | null, digits = 0): string {
  if (value == null) return '—'
  return value.toLocaleString('pt-BR', { maximumFractionDigits: digits, minimumFractionDigits: digits })
}

function formatPct(value: number | null): string {
  if (value == null) return '—'
  return `${(value * 100).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%`
}

export default function MeuFaturamentoPage() {
  const { session } = useClientSession()
  const [data, setData] = useState<Payload | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/kpis/meu-faturamento', { credentials: 'include', cache: 'no-store' })
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

  const name = session?.displayName || session?.user || 'Você'

  return (
    <IntranetPage
      kicker="Performance"
      title="Meu faturamento"
      subtitle={`${name} — só o seu mês no salão (Avec). Sem ranking de colegas.`}
    >
      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SectionCard title="Receita no mês">
          <p className="text-2xl font-semibold">{formatMoney(data?.revenue ?? null)}</p>
          <p className="mt-1 text-xs text-muted">
            {data?.month ? `Mês ${data.month}` : 'Aguardando mês'}
            {data?.reference_day ? ` · ref. ${data.reference_day}` : ''}
          </p>
        </SectionCard>
        <SectionCard title="Atendidos">
          <p className="text-2xl font-semibold">{formatNum(data?.attended ?? null)}</p>
        </SectionCard>
        <SectionCard title="Ticket médio">
          <p className="text-2xl font-semibold">{formatMoney(data?.ticket_avg ?? null)}</p>
        </SectionCard>
        <SectionCard title="Ocupação">
          <p className="text-2xl font-semibold">{formatPct(data?.occupancy ?? null)}</p>
        </SectionCard>
      </div>

      <SectionCard title="Vínculo Avec">
        {data?.matched_name ? (
          <p className="text-sm">
            Casado com <span className="font-medium">{data.matched_name}</span>
            {data.link_name && data.link_name !== data.matched_name ? (
              <span className="text-muted"> (busca: {data.link_name})</span>
            ) : null}
          </p>
        ) : (
          <p className="text-sm text-muted">
            Ainda não encontramos seu nome no snapshot Avec deste mês.
            {session?.role === 'admin' ? (
              <>
                {' '}
                Em <Link href="/pessoas" className="text-gold-strong hover:underline">Gestão de usuário</Link>,
                preencha o campo <span className="font-medium">Nome no Avec</span> igual ao relatório 0021.
              </>
            ) : (
              <> Peça ao admin para vincular seu <span className="font-medium">Nome no Avec</span> em Gestão de usuário.</>
            )}
          </p>
        )}
      </SectionCard>
    </IntranetPage>
  )
}
