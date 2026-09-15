'use client'

import { useEffect, useState } from 'react'
import { IntranetPage } from '../_components/intranet/IntranetPage'
import { useClientSession } from '../_components/SessionProvider'

type Employee = { id: string; email: string; name: string; panel_role: string; flow_role: string; status: string }

export default function PessoasPage() {
  const { session } = useClientSession()
  const [employees, setEmployees] = useState<Employee[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const canManage = session != null && (!session.auth_enabled || session.role === 'admin')

  useEffect(() => {
    fetch('/api/employees', { credentials: 'include' })
      .then((r) => r.json())
      .then((json) => setEmployees(json.data?.employees ?? []))
      .catch(() => setEmployees([]))
  }, [])

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const form = new FormData(e.currentTarget)
    const res = await fetch('/api/employees', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        name: form.get('name'),
        email: form.get('email'),
        password: form.get('password'),
        panel_role: form.get('panel_role'),
        flow_role: form.get('flow_role'),
        can_publish: form.get('can_publish') === 'on',
      }),
    })
    const json = await res.json()
    setSaving(false)
    if (!res.ok) {
      setError(json.error ?? 'Não foi possível criar')
      return
    }
    setEmployees((prev) => [...prev, json.data.employee])
    e.currentTarget.reset()
  }

  return (
    <IntranetPage kicker="Diretório" title="Pessoas">
      <p className="text-sm text-muted">Colaboradores desta unidade. Login próprio, sem senha compartilhada.</p>
      <ul className="mt-4 divide-y divide-border rounded-2xl border border-border bg-card">
        {employees.length === 0 && <li className="px-4 py-6 text-sm text-muted">Ninguém cadastrado ainda. O admin cria o primeiro acesso.</li>}
        {employees.map((person) => (
          <li key={person.id} className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-sm font-medium">{person.name}</p>
              <p className="text-xs text-muted">{person.email}</p>
            </div>
            <span className="text-xs uppercase tracking-wide text-muted">{person.panel_role}</span>
          </li>
        ))}
      </ul>

      {canManage && (
        <form onSubmit={onSubmit} className="mt-8 grid gap-3 rounded-2xl border border-border bg-card p-5 sm:grid-cols-2">
          <h2 className="sm:col-span-2 font-serif text-xl">Novo colaborador</h2>
          <input name="name" required placeholder="Nome" className="rounded-xl border border-border bg-background px-3 py-2" />
          <input name="email" type="email" required placeholder="E-mail" className="rounded-xl border border-border bg-background px-3 py-2" />
          <input name="password" type="password" required minLength={8} placeholder="Senha inicial" className="rounded-xl border border-border bg-background px-3 py-2" />
          <select name="panel_role" className="rounded-xl border border-border bg-background px-3 py-2" defaultValue="staff">
            <option value="staff">Staff</option>
            <option value="admin">Admin</option>
            <option value="financeiro">Financeiro</option>
            <option value="estoque">Estoque</option>
            <option value="mkt">Marketing</option>
          </select>
          <select name="flow_role" className="rounded-xl border border-border bg-background px-3 py-2" defaultValue="solicitante">
            <option value="solicitante">Solicitante</option>
            <option value="master">Master RomFlow</option>
            <option value="admin_financeiro">Admin financeiro</option>
            <option value="admin_compras">Admin compras</option>
            <option value="admin_rh">Admin RH</option>
            <option value="admin_manutencao">Admin manutenção</option>
          </select>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="can_publish" /> Pode publicar notícias (MKT)
          </label>
          {error && <p className="sm:col-span-2 text-sm text-danger">{error}</p>}
          <button disabled={saving} className="rounded-full bg-[#1c1916] px-4 py-2 text-sm text-white sm:col-span-2">
            {saving ? 'Salvando…' : 'Criar acesso'}
          </button>
        </form>
      )}
    </IntranetPage>
  )
}
