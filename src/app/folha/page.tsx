'use client'

import { useCallback, useEffect, useState } from 'react'
import { IntranetPage } from '../_components/intranet/IntranetPage'
import { SectionCard } from '../_components/ui'
import type { FolhaDraftLine } from '@/lib/folha/draft-from-8123'
import type { FolhaShellStatus } from '@/lib/folha/types'

function pct(rate: number): string {
  return `${(rate * 100).toFixed(0)}%`
}

function formatMoney(value: number | null | undefined): string {
  if (value == null) return '—'
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function flagLabel(flag: FolhaDraftLine['flags'][number]): string {
  switch (flag) {
    case 'manicure_com_taxa_adm':
      return 'Manicure com taxa adm no 8123'
    case 'sem_a_pagar':
      return 'Sem a_pagar'
    case 'sem_cargo':
      return 'Sem cargo'
    case 'assistente_com_desconto':
      return 'Desconto assistente'
    default: {
      const _exhaustive: never = flag
      return _exhaustive
    }
  }
}

export default function FolhaPage() {
  const [status, setStatus] = useState<FolhaShellStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/folha', {
        credentials: 'include',
        signal: AbortSignal.timeout(20_000),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(json.error ?? 'Falha ao carregar a Folha')
        setStatus(null)
        return
      }
      setStatus(json.data ?? null)
    } catch {
      setError('Falha ao carregar a Folha')
      setStatus(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const rules = status?.rules
  const draft = status?.draft
  const lines = draft?.lines ?? []

  return (
    <IntranetPage
      kicker="RH · Financeiro"
      title="Folha de pagamento"
      subtitle="O sistema calcula a folha PJ; vocês conferem e liberam o pagamento."
    >
      <SectionCard title="Como vai funcionar">
        <ol className="list-decimal space-y-2 pl-5 text-sm text-muted">
          <li>O sistema monta o rascunho da quinzena a partir do 8123 Avec.</li>
          <li>RH e Financeiro conferem os valores na tela.</li>
          <li>Depois da conferência, liberam o pagamento.</li>
        </ol>
      </SectionCard>

      <SectionCard title="Regras travadas">
        {loading ? <p className="text-sm text-muted">Carregando…</p> : null}
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        {!loading && !error && rules ? (
          <div className="space-y-3 text-sm">
            <p className="text-muted">{rules.source}</p>
            <ul className="list-disc space-y-1.5 pl-5 text-foreground">
              <li>
                Taxa sobre serviços (assistente como pro):{' '}
                <span className="font-medium">{pct(rules.assistant_service_tax_rate)}</span>
                {' — '}
                distinta da taxa de cartão/PIX.
              </li>
              <li>
                Assistente como profissional: remessa{' '}
                <span className="font-medium">{pct(rules.assistant_as_pro_remit_rate)}</span> ao
                profissional; assistente pode ganhar{' '}
                <span className="font-medium">{pct(rules.assistant_as_pro_earn_rate)}</span> + meio
                a meio.
              </li>
              <li>Manicure: sem taxa administrativa (exceto quem tem depilação).</li>
              <li>Esteticista: +{pct(rules.esteticista_bonus_rate)} do faturado.</li>
              <li>Exceções da planilha Fopag permanecem (contratos / casos especiais).</li>
            </ul>
            <p className="text-xs text-muted">{rules.card_fee_note}</p>
          </div>
        ) : null}
      </SectionCard>

      <SectionCard title="Rascunho da quinzena">
        {loading ? <p className="text-sm text-muted">Carregando…</p> : null}
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        {!loading && !error && status ? (
          <div className="space-y-4 text-sm">
            <p className="text-foreground">{status.message}</p>
            {draft ? (
              <>
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-muted">
                  <span>Quinzena: {draft.quinzena.label}</span>
                  <span>Ref. 8123: {draft.reference_day}</span>
                  <span>{draft.line_count} profissionais</span>
                  <span>Total proposto: {formatMoney(draft.total_proposed_pay)}</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
                        <th className="py-2 pr-3 font-medium">Profissional</th>
                        <th className="py-2 pr-3 font-medium">Cargo</th>
                        <th className="py-2 pr-3 font-medium tabular-nums">Faturado</th>
                        <th className="py-2 pr-3 font-medium tabular-nums">a_pagar 8123</th>
                        <th className="py-2 pr-3 font-medium tabular-nums">Meio a meio</th>
                        <th className="py-2 pr-3 font-medium tabular-nums">Proposto</th>
                        <th className="py-2 font-medium">Alertas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((line) => (
                        <tr key={line.name} className="border-b border-border/60">
                          <td className="py-2 pr-3 text-foreground">{line.name}</td>
                          <td className="py-2 pr-3 text-muted">{line.cargo_raw ?? '—'}</td>
                          <td className="py-2 pr-3 tabular-nums">
                            {formatMoney(line.avec.charged)}
                          </td>
                          <td className="py-2 pr-3 tabular-nums">
                            {formatMoney(line.avec.net_payable)}
                          </td>
                          <td className="py-2 pr-3 tabular-nums">
                            {formatMoney(line.meio_a_meio)}
                          </td>
                          <td className="py-2 pr-3 tabular-nums font-medium text-foreground">
                            {formatMoney(line.proposed_pay)}
                          </td>
                          <td className="py-2 text-xs text-muted">
                            {line.flags.length === 0
                              ? '—'
                              : line.flags.map(flagLabel).join(' · ')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-muted">
                  proposed_pay = a_pagar do 8123 ± extras Folha (DARF/DAS/U). Comissão % não é
                  recalculada.
                </p>
              </>
            ) : (
              <p className="text-muted">Nenhuma quinzena com dados 8123 no momento.</p>
            )}
          </div>
        ) : null}
      </SectionCard>
    </IntranetPage>
  )
}
