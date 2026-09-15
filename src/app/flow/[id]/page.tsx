'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { IntranetPage } from '../../_components/intranet/IntranetPage'
import type { Expense, RequestAction } from '@/lib/flow/types'
import { allowedActions } from '@/lib/flow/workflow'
import type { User } from '@/lib/flow/types'

const ACTION_LABEL: Record<RequestAction, string> = {
  docs: 'Pedir docs',
  approve: 'Aprovar',
  reject: 'Recusar',
  resubmit: 'Reenviar',
  attach_proof: 'Anexar comprovante',
  progress: 'Em andamento',
  complete: 'Finalizar',
  cancel: 'Cancelar',
}

export default function FlowDetailPage() {
  const params = useParams<{ id: string }>()
  const [expense, setExpense] = useState<Expense | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState('')

  useEffect(() => {
    Promise.all([
      fetch(`/api/flow/${params.id}`, { credentials: 'include' }).then((r) => r.json()),
      fetch('/api/flow', { credentials: 'include' }).then((r) => r.json()),
    ]).then(([detail, list]) => {
      if (detail.error) setError(detail.error)
      setExpense(detail.data?.expense ?? null)
      setUser(list.data?.user ?? null)
    })
  }, [params.id])

  async function run(action: RequestAction) {
    setError(null)
    const res = await fetch(`/api/flow/${params.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ action, note }),
    })
    const json = await res.json()
    if (!res.ok) {
      setError(json.error ?? 'Ação recusada')
      return
    }
    setExpense(json.data.expense)
  }

  const actions = expense && user ? allowedActions(user, expense) : []

  return (
    <IntranetPage kicker="RomFlow" title={expense?.title || 'Solicitação'}>
      {!expense && <p className="text-sm text-muted">{error || 'Carregando…'}</p>}
      {expense && (
        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="text-sm text-muted">
            {expense.area} · {expense.status} · {expense.company}
          </p>
          <p className="mt-3 whitespace-pre-wrap text-sm">{expense.description || 'Sem descrição.'}</p>
          <p className="mt-4 text-lg font-semibold">{expense.amount ? `R$ ${expense.amount}` : 'Sem valor'}</p>
          {expense.review_note && <p className="mt-2 text-sm text-muted">Nota: {expense.review_note}</p>}
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Nota da ação"
            className="mt-4 w-full rounded-xl border border-border bg-background px-3 py-2"
          />
          <div className="mt-4 flex flex-wrap gap-2">
            {actions.map((action) => (
              <button
                key={action}
                type="button"
                onClick={() => run(action)}
                className="rounded-full border border-border px-3 py-1.5 text-sm"
              >
                {ACTION_LABEL[action]}
              </button>
            ))}
          </div>
          {error && <p className="mt-3 text-sm text-danger">{error}</p>}
        </div>
      )}
    </IntranetPage>
  )
}
