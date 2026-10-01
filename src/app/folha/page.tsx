'use client'

import { useCallback, useEffect, useState } from 'react'
import { IntranetPage } from '../_components/intranet/IntranetPage'
import { SectionCard } from '../_components/ui'
import type { FolhaShellStatus } from '@/lib/folha/types'

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

      <SectionCard title="Status">
        {loading ? <p className="text-sm text-muted">Carregando…</p> : null}
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        {!loading && !error && status ? (
          <div className="space-y-2 text-sm">
            <p className="text-foreground">{status.message}</p>
            {status.shell_only ? (
              <p className="text-muted">
                Ainda sem períodos calculados. Aguardando confirmação das regras com o RH.
              </p>
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
