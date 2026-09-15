'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { IntranetPage } from '../../_components/intranet/IntranetPage'
import type { Category, Company, ExpenseType, PaymentMethod, RequestArea } from '@/lib/flow/types'
import { REQUEST_AREAS } from '@/lib/flow/workflow'

function NovaForm() {
  const router = useRouter()
  const [companies, setCompanies] = useState<Company[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch('/api/flow', { credentials: 'include' })
      .then((r) => r.json())
      .then((json) => {
        setCompanies(json.data?.companies ?? [])
        setCategories(json.data?.categories ?? [])
      })
      .catch(() => setError('Falha ao carregar empresas da unidade'))
  }, [])

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const form = new FormData(e.currentTarget)
    const res = await fetch('/api/flow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        title: form.get('title'),
        description: form.get('description'),
        area: form.get('area'),
        expense_type: form.get('expense_type'),
        company: form.get('company'),
        category: form.get('category'),
        amount: Number(form.get('amount') || 0),
        payment_method: form.get('payment_method'),
        beneficiary_name: form.get('beneficiary_name'),
        event_date: form.get('event_date') || '',
      }),
    })
    const json = await res.json()
    setSaving(false)
    if (!res.ok) {
      setError(json.error ?? 'Não foi possível criar')
      return
    }
    router.push(`/flow/${json.data.expense.id}`)
  }

  return (
    <IntranetPage kicker="RomFlow" title="Nova solicitação">
      <form onSubmit={onSubmit} className="grid gap-3 rounded-2xl border border-border bg-card p-5">
        <input name="title" required placeholder="Título" className="rounded-xl border border-border bg-background px-3 py-2" />
        <textarea name="description" placeholder="Descrição" className="rounded-xl border border-border bg-background px-3 py-2" />
        <select name="area" className="rounded-xl border border-border bg-background px-3 py-2" defaultValue="financeiro">
          {REQUEST_AREAS.map((area: RequestArea) => (
            <option key={area} value={area}>
              {area}
            </option>
          ))}
        </select>
        <select name="company" required className="rounded-xl border border-border bg-background px-3 py-2">
          <option value="">Empresa da unidade</option>
          {companies.map((company) => (
            <option key={company.id} value={company.id}>
              {company.name}
            </option>
          ))}
        </select>
        <select name="category" className="rounded-xl border border-border bg-background px-3 py-2">
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        <select name="expense_type" className="rounded-xl border border-border bg-background px-3 py-2" defaultValue="outros">
          {(['fornecedor', 'reembolso_colaborador', 'chamado', 'pedido', 'ferias', 'outros'] as ExpenseType[]).map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
        <input name="amount" type="number" step="0.01" placeholder="Valor" className="rounded-xl border border-border bg-background px-3 py-2" />
        <select name="payment_method" className="rounded-xl border border-border bg-background px-3 py-2" defaultValue="pix">
          {(['pix', 'ted', 'boleto'] as PaymentMethod[]).map((method) => (
            <option key={method} value={method}>
              {method}
            </option>
          ))}
        </select>
        <input name="beneficiary_name" placeholder="Beneficiário" className="rounded-xl border border-border bg-background px-3 py-2" />
        <input name="event_date" type="date" className="rounded-xl border border-border bg-background px-3 py-2" />
        {error && <p className="text-sm text-danger">{error}</p>}
        <button disabled={saving} className="rounded-full bg-[#1c1916] px-4 py-2 text-sm text-white">
          {saving ? 'Enviando…' : 'Enviar'}
        </button>
      </form>
    </IntranetPage>
  )
}

export default function NovaSolicitacaoPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-muted">Carregando…</div>}>
      <NovaForm />
    </Suspense>
  )
}
