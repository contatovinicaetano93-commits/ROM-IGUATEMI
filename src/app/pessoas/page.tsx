'use client'

import { useEffect, useState } from 'react'
import { IntranetPage } from '../_components/intranet/IntranetPage'
import { useClientSession, type ClientAuthRole } from '../_components/SessionProvider'
import { GRANTABLE_MODULES, hasPanelModule, parseGrantableModules, type GrantableModuleKey } from '@/lib/intranet/modules'

type Employee = {
  id: string
  email: string
  name: string
  panel_role: ClientAuthRole
  flow_role: string
  status: string
  modules?: GrantableModuleKey[]
}

const ROLES: ClientAuthRole[] = ['staff', 'admin', 'financeiro', 'estoque', 'mkt']

function ModuleChecks({
  role,
  selected,
  onToggle,
}: {
  role: ClientAuthRole
  selected: GrantableModuleKey[]
  onToggle: (key: GrantableModuleKey) => void
}) {
  return (
    <div className="sm:col-span-2 grid gap-2 sm:grid-cols-2">
      <p className="sm:col-span-2 text-xs uppercase tracking-wide text-muted">Sistemas desta pessoa</p>
      {GRANTABLE_MODULES.map((item) => {
        const fromRole = hasPanelModule(role, [], item.key)
        const checked = fromRole || selected.includes(item.key)
        return (
          <label key={item.key} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={checked}
              disabled={fromRole || role === 'admin'}
              onChange={() => onToggle(item.key)}
            />
            <span>
              {item.label}
              {fromRole ? <span className="text-muted"> · vem do papel</span> : null}
            </span>
          </label>
        )
      })}
    </div>
  )
}

export default function PessoasPage() {
  const { session } = useClientSession()
  const [employees, setEmployees] = useState<Employee[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [createRole, setCreateRole] = useState<ClientAuthRole>('staff')
  const [createModules, setCreateModules] = useState<GrantableModuleKey[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editModules, setEditModules] = useState<GrantableModuleKey[]>([])
  const canManage = session != null && (!session.auth_enabled || session.role === 'admin')

  useEffect(() => {
    fetch('/api/employees', { credentials: 'include' })
      .then((r) => r.json())
      .then((json) => setEmployees(json.data?.employees ?? []))
      .catch(() => setEmployees([]))
  }, [])

  function toggleCreate(key: GrantableModuleKey) {
    setCreateModules((prev) => (prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]))
  }

  function toggleEdit(key: GrantableModuleKey) {
    setEditModules((prev) => (prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]))
  }

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
        panel_role: createRole,
        flow_role: form.get('flow_role'),
        can_publish: form.get('can_publish') === 'on',
        modules: createModules,
      }),
    })
    const json = await res.json()
    setSaving(false)
    if (!res.ok) {
      setError(json.error ?? 'Não foi possível criar')
      return
    }
    setEmployees((prev) => [...prev, json.data.employee])
    setCreateModules([])
    setCreateRole('staff')
    e.currentTarget.reset()
  }

  async function saveModules(person: Employee) {
    setSaving(true)
    setError(null)
    const res = await fetch(`/api/employees/${person.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ modules: editModules }),
    })
    const json = await res.json()
    setSaving(false)
    if (!res.ok) {
      setError(json.error ?? 'Não foi possível salvar os sistemas')
      return
    }
    setEmployees((prev) => prev.map((item) => (item.id === person.id ? json.data.employee : item)))
    setEditingId(null)
  }

  return (
    <IntranetPage kicker="Diretório" title="Pessoas">
      <p className="text-sm text-muted">
        Colaboradores desta unidade. O papel define o pacote; os extras liberam um sistema sem mudar o cargo.
      </p>
      <ul className="mt-4 divide-y divide-border rounded-2xl border border-border bg-card">
        {employees.length === 0 && (
          <li className="px-4 py-6 text-sm text-muted">Ninguém cadastrado ainda. O admin cria o primeiro acesso.</li>
        )}
        {employees.map((person) => {
          const extras = parseGrantableModules(person.modules)
          return (
            <li key={person.id} className="px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{person.name}</p>
                  <p className="text-xs text-muted">{person.email}</p>
                  {extras.length > 0 && (
                    <p className="mt-1 text-[0.65rem] uppercase tracking-wide text-gold-strong">
                      extra: {extras.join(' · ')}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs uppercase tracking-wide text-muted">{person.panel_role}</span>
                  {canManage && person.panel_role !== 'admin' && (
                    <button
                      type="button"
                      className="text-xs text-gold-strong"
                      onClick={() => {
                        setEditingId(person.id)
                        setEditModules(extras)
                      }}
                    >
                      Sistemas
                    </button>
                  )}
                </div>
              </div>
              {editingId === person.id && (
                <div className="mt-3 rounded-xl border border-border bg-background p-3">
                  <ModuleChecks role={person.panel_role} selected={editModules} onToggle={toggleEdit} />
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void saveModules(person)}
                      className="rounded-full bg-[#1c1916] px-3 py-1.5 text-xs text-white"
                    >
                      {saving ? 'Salvando…' : 'Salvar sistemas'}
                    </button>
                    <button type="button" className="text-xs text-muted" onClick={() => setEditingId(null)}>
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </li>
          )
        })}
      </ul>

      {canManage && (
        <form onSubmit={onSubmit} className="mt-8 grid gap-3 rounded-2xl border border-border bg-card p-5 sm:grid-cols-2">
          <h2 className="sm:col-span-2 font-serif text-xl">Novo colaborador</h2>
          <input name="name" required placeholder="Nome" className="rounded-xl border border-border bg-background px-3 py-2" />
          <input name="email" type="email" required placeholder="E-mail" className="rounded-xl border border-border bg-background px-3 py-2" />
          <input name="password" type="password" required minLength={8} placeholder="Senha inicial" className="rounded-xl border border-border bg-background px-3 py-2" />
          <select
            name="panel_role"
            className="rounded-xl border border-border bg-background px-3 py-2"
            value={createRole}
            onChange={(e) => {
              const next = ROLES.includes(e.target.value as ClientAuthRole) ? (e.target.value as ClientAuthRole) : 'staff'
              setCreateRole(next)
              setCreateModules([])
            }}
          >
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
          <ModuleChecks role={createRole} selected={createModules} onToggle={toggleCreate} />
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
