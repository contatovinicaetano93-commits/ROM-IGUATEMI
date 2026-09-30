'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { IntranetPage } from '../_components/intranet/IntranetPage'
import { MonthYearField } from '../_components/MonthYearField'
import { SectionCard } from '../_components/ui'
import { useClientSession } from '../_components/SessionProvider'
import {
  commissionTotalForReconcileKey,
  groupCommissionDiscountLines,
  type MeuComissaoMetrics,
} from '@/lib/intranet/meu-faturamento'
import { todayIso } from '@/lib/salon/format'

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

function currentMonthKey() {
  return todayIso().slice(0, 7)
}

function parseMonthParam(raw: string | null): string {
  return raw && /^\d{4}-\d{2}$/.test(raw) ? raw : currentMonthKey()
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

function moneyClose(a: number | null, b: number | null): boolean | null {
  if (a == null || b == null) return null
  return Math.abs(a - b) < 0.02
}

export default function MeuFaturamentoPage() {
  return (
    <Suspense
      fallback={
        <IntranetPage kicker="Performance" title="Meu faturamento" subtitle="Carregando…">
          <div className="h-40 animate-pulse rounded-2xl bg-card" />
        </IntranetPage>
      }
    >
      <MeuFaturamentoPageContent />
    </Suspense>
  )
}

function MeuFaturamentoPageContent() {
  const { session } = useClientSession()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [month, setMonth] = useState(() => parseMonthParam(searchParams.get('month')))
  const [data, setData] = useState<Payload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({})

  useEffect(() => {
    const fromUrl = parseMonthParam(searchParams.get('month'))
    setMonth((prev) => (prev === fromUrl ? prev : fromUrl))
  }, [searchParams])

  useEffect(() => {
    let cancelled = false
    const q = new URLSearchParams({ month })
    fetch(`/api/kpis/meu-faturamento?${q}`, { credentials: 'include', cache: 'no-store' })
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
  }, [month])

  function onMonthChange(next: string) {
    if (!/^\d{4}-\d{2}$/.test(next)) return
    setMonth(next)
    setError(null)
    setData(null)
    const params = new URLSearchParams(searchParams.toString())
    params.set('month', next)
    router.replace(`${pathname}?${params.toString()}`)
  }

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
  const groups = useMemo(() => groupCommissionDiscountLines(lines), [lines])

  const commissionMetrics: MeuComissaoMetrics | null = data
    ? {
        commission_matched_name: data.commission_matched_name,
        charged: data.charged,
        service_share: data.service_share,
        product_share: data.product_share,
        other_share: data.other_share,
        assistant_discount: data.assistant_discount,
        product_spend: data.product_spend,
        other_discounts: data.other_discounts,
        card_fee: data.card_fee,
        admin_fee: data.admin_fee,
        tip: data.tip,
        net_payable: data.net_payable,
        house_share: data.house_share,
      }
    : null

  function toggleGroup(key: string) {
    setOpenGroups((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const adminLink = (
    <>
      Em{' '}
      <Link href="/pessoas" className="text-gold-strong hover:underline">
        Gestão de usuário
      </Link>
      , preencha o campo <span className="font-medium">Nome no Avec</span> igual ao relatório
      0021/8123.
    </>
  )
  const staffHint = (
    <>
      Peça ao admin para vincular seu <span className="font-medium">Nome no Avec</span> em Gestão de
      usuário.
    </>
  )

  return (
    <IntranetPage
      kicker="Performance"
      title="Meu faturamento"
      subtitle={`${name} — produção bruta e comissão líquida (espelho Avec). Sem ranking de colegas.`}
    >
      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[0.65rem] uppercase tracking-wide text-muted">Mês</span>
          <MonthYearField value={month} onChange={onMonthChange} aria-label="Mês do faturamento" />
        </label>
        {data?.reference_day || data?.commission_reference_day ? (
          <p className="text-xs text-muted">
            {data.reference_day ? `P1 ${data.reference_day}` : null}
            {data.reference_day && data.commission_reference_day ? ' · ' : null}
            {data.commission_reference_day ? `8123 ${data.commission_reference_day}` : null}
          </p>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SectionCard title="Produção bruta">
          <p className="text-2xl font-semibold">{formatMoney(data?.revenue ?? null)}</p>
          <p className="mt-1 text-xs text-muted">
            {data?.month ? `Mês ${data.month}` : `Mês ${month}`}
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
          Espelho 8123 (fechamento) + 0029 (lançamentos agrupados). Não recalculamos %. Ausente = —.
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
            <p className="mb-1 text-xs uppercase tracking-wide text-muted">Abatimentos (totais 8123)</p>
            <DeductionRow label="Desconto assistente" value={data?.assistant_discount ?? null} />
            <DeductionRow label="Gasto com produtos" value={data?.product_spend ?? null} />
            <DeductionRow label="Outros descontos" value={data?.other_discounts ?? null} />
            <DeductionRow label="Taxa cartão" value={data?.card_fee ?? null} />
            <DeductionRow label="Taxa administrativa" value={data?.admin_fee ?? null} />
            <DeductionRow label="Caixinha" value={data?.tip ?? null} />
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted">
            {data == null
              ? 'Carregando comissão…'
              : !data.linked
                ? 'Sem Nome no Avec no seu cadastro — a comissão 8123 só aparece depois do vínculo em Gestão de usuário.'
                : !data.commission_reference_day
                  ? 'Sem snapshot 8123 para este mês (ainda não sincronizou ou o fechamento não chegou).'
                  : 'Seu nome não aparece no snapshot 8123 deste mês.'}
          </p>
        )}

        <div className="mt-6">
          <p className="mb-1 text-xs uppercase tracking-wide text-muted">
            Descontos por grupo (0029)
            {data?.discount_reference_day ? ` · ref. ${data.discount_reference_day}` : ''}
          </p>
          <p className="mb-3 text-xs text-muted">
            Soma das linhas por categoria · toque no grupo para ver cada lançamento · concilia com o
            total 8123 quando o tipo é reconhecido.
          </p>
          {groups.length > 0 ? (
            <ul className="divide-y divide-border/60">
              {groups.map((group) => {
                const open = Boolean(openGroups[group.key])
                const reconcile =
                  commissionMetrics && group.reconcile_key
                    ? commissionTotalForReconcileKey(commissionMetrics, group.reconcile_key)
                    : null
                const match = moneyClose(group.total, reconcile)
                return (
                  <li key={group.key} className="py-2">
                    <button
                      type="button"
                      onClick={() => toggleGroup(group.key)}
                      className="flex w-full items-start justify-between gap-3 text-left text-sm"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-foreground">
                          {open ? '▾ ' : '▸ '}
                          {group.category}
                        </p>
                        <p className="text-xs text-muted">
                          {group.count} lançamento{group.count === 1 ? '' : 's'}
                          {reconcile != null ? (
                            <>
                              {' '}
                              · 8123 {formatMoney(reconcile)}
                              {match === true ? ' · ok' : match === false ? ' · diverge' : ''}
                            </>
                          ) : null}
                        </p>
                      </div>
                      <span className="shrink-0 font-medium tabular-nums">
                        {formatMoney(group.total)}
                      </span>
                    </button>
                    {open ? (
                      <ul className="mt-2 space-y-1 border-l border-border/80 pl-3">
                        {group.lines.map((line, idx) => (
                          <li
                            key={`${group.key}-${line.day ?? ''}-${line.amount ?? ''}-${idx}`}
                            className="flex items-start justify-between gap-3 text-xs text-muted"
                          >
                            <span className="min-w-0 truncate">
                              {line.description || line.day || 'Lançamento'}
                              {line.description && line.day ? ` · ${line.day}` : ''}
                            </span>
                            <span className="shrink-0 tabular-nums text-foreground">
                              {formatMoney(line.amount)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted">
              {data == null
                ? 'Carregando lançamentos…'
                : !data.linked
                  ? 'Sem Nome no Avec — não dá para puxar o detalhe 0029.'
                  : !data.avec_pro_id
                    ? 'Sem avec_pro_id no cadastro (e sem id no elenco para este nome) — o detalhe linha a linha 0029 fica indisponível.'
                    : 'Sem lançamentos 0029 neste período (ou ainda sincronizando).'}
            </p>
          )}
        </div>
      </SectionCard>

      <SectionCard title="Vínculo Avec">
        {!data ? (
          <p className="text-sm text-muted">Carregando vínculo…</p>
        ) : !data.linked ? (
          <p className="text-sm text-muted">
            Sem Nome no Avec no seu cadastro.
            {session?.role === 'admin' ? <> {adminLink}</> : <> {staffHint}</>}
          </p>
        ) : data.matched_name || data.commission_matched_name ? (
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
            ) : (
              <span className="text-muted">
                {' '}
                · sem avec_pro_id (escolha o profissional na lista em Gestão de usuário)
              </span>
            )}
          </p>
        ) : !data.commission_reference_day && !data.reference_day ? (
          <p className="text-sm text-muted">
            Nome no Avec preenchido, mas sem snapshot P1/8123 para {data.month ?? month}.
          </p>
        ) : (
          <p className="text-sm text-muted">
            Nome no Avec preenchido ({data.link_name}), mas não encontramos match no snapshot deste
            mês.
            {!data.avec_pro_id ? (
              <>
                {' '}
                Também falta <span className="font-medium">avec_pro_id</span> — escolha o
                profissional na lista em Gestão de usuário.
              </>
            ) : null}
          </p>
        )}
      </SectionCard>
    </IntranetPage>
  )
}
