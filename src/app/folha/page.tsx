'use client'

import { useCallback, useEffect, useState } from 'react'
import { IntranetPage } from '../_components/intranet/IntranetPage'
import { SectionCard } from '../_components/ui'
import type { FolhaShellStatus } from '@/lib/folha/types'

function pct(rate: number): string {
  return `${(rate * 100).toFixed(0)}%`
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
        signal: AbortSignal.timeout(15_000),
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

  return (
    <IntranetPage
      kicker="RH · Financeiro"
      title="Folha de pagamento"
      subtitle="O sistema calcula a folha PJ; vocês conferem e liberam o pagamento."
    >
      <SectionCard title="Como vai funcionar">
        <ol className="list-decimal space-y-2 pl-5 text-sm text-muted">
          <li>O sistema monta o rascunho da quinzena (comissões, taxas e impostos).</li>
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

      <SectionCard title="Status">
        {loading ? <p className="text-sm text-muted">Carregando…</p> : null}
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        {!loading && !error && status ? (
          <div className="space-y-2 text-sm">
            <p className="text-foreground">{status.message}</p>
            {status.rules_locked ? (
              <p className="text-muted">Motor de regras ativo. Aguardando rascunho 8123.</p>
            ) : null}
            {status.periods.length === 0 ? (
              <p className="text-muted">Nenhuma quinzena aberta no momento.</p>
            ) : null}
          </div>
        ) : null}
      </SectionCard>
    </IntranetPage>
  )
}
