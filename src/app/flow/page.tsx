'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { IntranetPage } from '../_components/intranet/IntranetPage'
import type { Company, Expense, RequestArea, User } from '@/lib/flow/types'
import { REQUEST_AREAS } from '@/lib/flow/workflow'

const AREA_LABEL: Record<RequestArea, string> = {
  financeiro: 'Financeiro',
  compras: 'Compras',
  rh: 'RH',
  manutencao: 'Manutenção',
}

function FlowList() {
  const params = useSearchParams()
  const areaFilter = params.get('area')
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [user, setUser] = useState<User | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/flow', { credentials: 'include' })
      .then((r) => r.json())
      .then((json) => {
        if (json.error) setError(json.error)
        setExpenses(json.data?.expenses ?? [])
        setCompanies(json.data?.companies ?? [])
        setUser(json.data?.user ?? null)
      })
      .catch(() => setError('Não foi possível carregar o RomFlow'))
  }, [])

  const visible = useMemo(() => {
    if (!areaFilter) return expenses
    return expenses.filter((item) => item.area === areaFilter)
  }, [areaFilter, expenses])

  return (
    <IntranetPage kicker="RomFlow" title="Solicitações da unidade">
      <p className="text-sm text-muted">
        Estrutura do RomFlow, só com os negócios desta intranet.
        {companies.length > 0 ? ` Empresas: ${companies.map((c) => c.name).join(', ')}.` : ''}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link href="/flow/nova" className="rounded-full bg-[#1c1916] px-4 py-2 text-sm text-white">
          Nova solicitação
        </Link>
        {REQUEST_AREAS.map((area) => (
          <Link
            key={area}
            href={`/flow?area=${area}`}
            className="rounded-full border border-border px-3 py-2 text-xs uppercase tracking-wide"
          >
            {AREA_LABEL[area]}
          </Link>
        ))}
      </div>
      {error && <p className="mt-4 text-sm text-danger">{error}</p>}
      <ul className="mt-6 divide-y divide-border rounded-2xl border border-border bg-card">
        {visible.length === 0 && <li className="px-4 py-6 text-sm text-muted">Nenhuma solicitação visível.</li>}
        {visible.map((expense) => (
          <li key={expense.id}>
            <Link href={`/flow/${expense.id}`} className="flex items-center justify-between gap-3 px-4 py-3">
              <div>
                <p className="text-sm font-medium">{expense.title}</p>
                <p className="text-xs text-muted">
                  {AREA_LABEL[expense.area]} · {expense.status.replace('_', ' ')}
                </p>
              </div>
              <span className="text-sm">{expense.amount ? `R$ ${expense.amount}` : '—'}</span>
            </Link>
          </li>
        ))}
      </ul>
      {user && (
        <p className="mt-4 text-xs text-muted">
          Perfil RomFlow: {user.role} · {user.companyIds.length} empresas
        </p>
      )}
    </IntranetPage>
  )
}

export default function FlowPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-muted">Carregando…</div>}>
      <FlowList />
    </Suspense>
  )
}
