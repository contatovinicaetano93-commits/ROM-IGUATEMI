'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { IntranetPage } from '../_components/intranet/IntranetPage'
import { SectionCard } from '../_components/ui'
import { useClientSession } from '../_components/SessionProvider'

type DiscountLine = {
  category: string | null
  description: string | null
  amount: number | null
  day: string | null
}

type Payload = {
  month: string | null
  reference_day: string | null
  commission_reference_day: string | null
  discount_reference_day: string | null
  avec_pro_id: string | null
  link_name: string | null
  linked: boolean
  matched_name: string | null
  revenue: number | null
  attended: number | null
  ticket_avg: number | null
  occupancy: number | null
  commission_matched_name: string | null
  charged: number | null
  service_share: number | null
  product_share: number | null
  other_share: number | null
  assistant_discount: number | null
  product_spend: number | null
  other_discounts: number | null
  card_fee: number | null
  admin_fee: number | null
  tip: number | null
  net_payable: number | null
  house_share: number | null
  discount_lines: DiscountLine[]
}

function formatMoney(value: number | null): string {
  if (value == null) return '—'
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatNum(value: number | null, digits = 0): string {
  if (value == null) return '—'
  return value.toLocaleString('pt-BR', {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  })
}

function formatPct(value: number | null): string {
  if (value == null) return '—'
  return `${(value * 100).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%`
}

function DeductionRow({ label, value }: { label: string; value: number | null }) {
  if (value == null) return null
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/60 py-2 text-sm last:border-0">
      <span className="text-muted">{label}</span>
      <span className="font-medium tabular-nums">{formatMoney(value)}</span>
    </div>
  )
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
  const hasCommission =
    data?.net_payable != null ||
    data?.charged != null ||
    data?.assistant_discount != null ||
    data?.product_spend != null ||
    data?.other_discounts != null ||
    data?.card_fee != null ||
    data?.admin_fee != null ||
    data?.tip != null
  const hasDynamics =
    data?.charged != null ||
    data?.service_share != null ||
    data?.product_share != null ||
    data?.other_share != null ||
    data?.house_share != null
  const lines = data?.discount_lines ?? []

  return (
    <IntranetPage
      kicker="Performance"
      title="Meu faturamento"
      subtitle={`${name} — produção bruta e comissão líquida (espelho Avec). Sem ranking de colegas.`}
    >
      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SectionCard title="Produção bruta">
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

      <SectionCard title="Comissão (Avec)">
        <p className="text-xs text-muted">
          Espelho 8123 (fechamento) + 0029 (lançamentos). Não recalculamos %. Ausente = —.
          {data?.commission_reference_day
            ? ` · ref. 8123 ${data.commission_reference_day}`
            : null}
        </p>
        <div className="mt-4 rounded-xl border border-border bg-background/60 px-4 py-4">
          <p className="text-xs uppercase tracking-wide text-muted">A pagar / líquido</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums text-foreground">
            {formatMoney(data?.net_payable ?? null)}
          </p>
        </div>

        {hasDynamics ? (
          <div className="mt-4">
            <p className="mb-1 text-xs uppercase tracking-wide text-muted">Dinâmica do mês</p>
            <DeductionRow label="Valor cobrado" value={data?.charged ?? null} />
            <DeductionRow label="Rateio serviços" value={data?.service_share ?? null} />
            <DeductionRow label="Rateio produtos" value={data?.product_share ?? null} />
            <DeductionRow label="Rateio outros" value={data?.other_share ?? null} />
            <DeductionRow label="Valor casa" value={data?.house_share ?? null} />
          </div>
        ) : null}

        {hasCommission ? (
          <div className="mt-4">
            <p className="mb-1 text-xs uppercase tracking-wide text-muted">Abatimentos (totais)</p>
            <DeductionRow label="Desconto assistente" value={data?.assistant_discount ?? null} />
            <DeductionRow label="Gasto com produtos" value={data?.product_spend ?? null} />
            <DeductionRow label="Outros descontos" value={data?.other_discounts ?? null} />
            <DeductionRow label="Taxa cartão" value={data?.card_fee ?? null} />
            <DeductionRow label="Taxa administrativa" value={data?.admin_fee ?? null} />
            <DeductionRow label="Caixinha" value={data?.tip ?? null} />
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted">
            Ainda sem snapshot de comissão (8123) para o seu nome neste mês.
          </p>
        )}

        <div className="mt-6">
          <p className="mb-1 text-xs uppercase tracking-wide text-muted">
            Lançamentos (por quê)
            {data?.discount_reference_day ? ` · ref. ${data.discount_reference_day}` : ''}
          </p>
          {lines.length > 0 ? (
            <ul className="divide-y divide-border/60">
              {lines.map((line, idx) => (
                <li
                  key={`${line.day ?? ''}-${line.category ?? ''}-${line.description ?? ''}-${idx}`}
                  className="flex items-start justify-between gap-3 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">
                      {line.category ?? 'Lançamento'}
                    </p>
                    {line.description ? (
                      <p className="text-muted truncate">{line.description}</p>
                    ) : null}
                    {line.day ? <p className="text-xs text-muted">{line.day}</p> : null}
                  </div>
                  <span className="shrink-0 font-medium tabular-nums">
                    {formatMoney(line.amount)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">
              {data?.avec_pro_id
                ? 'Sem lançamentos 0029 neste período (ou ainda sincronizando).'
                : 'Sem id Avec no elenco para este nome — não dá para puxar o detalhe linha a linha.'}
            </p>
          )}
        </div>
      </SectionCard>

      <SectionCard title="Vínculo Avec">
        {data?.matched_name || data?.commission_matched_name ? (
          <p className="text-sm">
            Casado com{' '}
            <span className="font-medium">
              {data.commission_matched_name ?? data.matched_name}
            </span>
            {data.link_name &&
            data.link_name !== (data.commission_matched_name ?? data.matched_name) ? (
              <span className="text-muted"> (busca: {data.link_name})</span>
            ) : null}
            {data.avec_pro_id ? (
              <span className="text-muted"> · id {data.avec_pro_id}</span>
            ) : null}
          </p>
        ) : (
          <p className="text-sm text-muted">
            Ainda não encontramos seu nome no snapshot Avec deste mês.
            {session?.role === 'admin' ? (
              <>
                {' '}
                Em{' '}
                <Link href="/pessoas" className="text-gold-strong hover:underline">
                  Gestão de usuário
                </Link>
                , preencha o campo <span className="font-medium">Nome no Avec</span> igual ao
                relatório 0021/8123.
              </>
            ) : (
              <>
                {' '}
                Peça ao admin para vincular seu{' '}
                <span className="font-medium">Nome no Avec</span> em Gestão de usuário.
              </>
            )}
          </p>
        )}
      </SectionCard>
    </IntranetPage>
  )
}
