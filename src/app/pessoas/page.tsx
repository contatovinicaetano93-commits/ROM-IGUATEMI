'use client'

import { useEffect, useMemo, useState } from 'react'
import { IntranetPage } from '../_components/intranet/IntranetPage'
import { PanelButton, SectionCard } from '../_components/ui'
import { useClientSession, type ClientAuthRole } from '../_components/SessionProvider'
import {
  CARGO_PACKAGES,
  cargoPackageById,
  matchCargoPackage,
  modulesForCargo,
  type CargoPackageId,
} from '@/lib/intranet/cargo-packages'
import {
  GRANTABLE_MODULES,
  hasPanelModule,
  parseGrantableModules,
  type GrantableModuleKey,
} from '@/lib/intranet/modules'
import type { RequestArea } from '@/lib/flow/types'

type Employee = {
  id: string
  email: string
  name: string
  panel_role: ClientAuthRole
  flow_role: string
  status: string
  professional_name?: string | null
  modules?: GrantableModuleKey[]
  areaIds?: RequestArea[]
}

type UnitProfessional = {
  id: string
  name: string
  avec_pro_id: string | null
  role: 'hairstylist' | 'makeup' | 'other'
  linked_employee_id: string | null
  linked_email: string | null
  linked_name: string | null
}

function ModuleChecks({
  role,
  selected,
  onToggle,
  readOnly,
  showMeuFaturamento,
}: {
  role: ClientAuthRole
  selected: GrantableModuleKey[]
  onToggle: (key: GrantableModuleKey) => void
  readOnly?: boolean
  /** Self-serve: não é módulo grantable, mas entra no menu do profissional. */
  showMeuFaturamento?: boolean
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <p className="sm:col-span-2 text-xs uppercase tracking-wide text-muted">Sistemas liberados</p>
      {GRANTABLE_MODULES.map((item) => {
        const fromRole = hasPanelModule(role, [], item.key)
        const checked = fromRole || selected.includes(item.key)
        return (
          <label key={item.key} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={checked}
              disabled={readOnly || fromRole || role === 'admin'}
              onChange={() => onToggle(item.key)}
            />
            <span>
              {item.label}
              {fromRole ? <span className="text-muted"> · do cargo</span> : null}
            </span>
          </label>
        )
      })}
      {showMeuFaturamento ? (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked disabled />
          <span>
            Meu faturamento
            <span className="text-muted"> · do cargo (só o dele)</span>
          </span>
        </label>
      ) : null}
    </div>
  )
}

export default function PessoasPage() {
  const { session } = useClientSession()
  const [employees, setEmployees] = useState<Employee[]>([])
  const [professionals, setProfessionals] = useState<UnitProfessional[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [cargoId, setCargoId] = useState<CargoPackageId>('profissional')
  const [fineTune, setFineTune] = useState(false)
  const [createModules, setCreateModules] = useState<GrantableModuleKey[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editModules, setEditModules] = useState<GrantableModuleKey[]>([])
  const [editProfessionalName, setEditProfessionalName] = useState('')
  const [selectedProId, setSelectedProId] = useState('')
  const [createName, setCreateName] = useState('')
  const [createProfessionalName, setCreateProfessionalName] = useState('')
  const [proSearch, setProSearch] = useState('')
  const canManage = session != null && (!session.auth_enabled || session.role === 'admin')
  const isProfissionalCargo = cargoId === 'profissional'

  const pack = useMemo(() => cargoPackageById(cargoId), [cargoId])
  const selectedPro = useMemo(
    () => professionals.find((item) => item.id === selectedProId) ?? null,
    [professionals, selectedProId],
  )
  const filteredProfessionals = useMemo(() => {
    const q = proSearch.trim().toLowerCase()
    if (!q) return professionals
    return professionals.filter((pro) => pro.name.toLowerCase().includes(q))
  }, [professionals, proSearch])


  useEffect(() => {
    fetch('/api/employees', { credentials: 'include' })
      .then((r) => r.json())
      .then((json) => setEmployees(json.data?.employees ?? []))
      .catch(() => setEmployees([]))
  }, [])

  useEffect(() => {
    if (!canManage) return
    fetch('/api/employees/professionals', { credentials: 'include' })
      .then((r) => r.json())
      .then((json) => setProfessionals(json.data?.professionals ?? []))
      .catch(() => setProfessionals([]))
  }, [canManage])

  useEffect(() => {
    if (!pack) return
    setCreateModules([...pack.extras])
    setFineTune(false)
    if (pack.id !== 'profissional') {
      setSelectedProId('')
      setCreateProfessionalName('')
      setProSearch('')
    }
  }, [pack])

  function toggleCreate(key: GrantableModuleKey) {
    setCreateModules((prev) => (prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]))
  }

  function toggleEdit(key: GrantableModuleKey) {
    setEditModules((prev) => (prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]))
  }

  function onSelectProfessional(proId: string) {
    setSelectedProId(proId)
    const pro = professionals.find((item) => item.id === proId)
    if (!pro) {
      setCreateProfessionalName('')
      return
    }
    setCreateName(pro.name)
    setCreateProfessionalName(pro.name)
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!pack) return
    if (isProfissionalCargo && !createProfessionalName.trim()) {
      setError('Escolha o profissional da unidade para vincular o acesso')
      return
    }
    setSaving(true)
    setError(null)
    const form = new FormData(e.currentTarget)
    const res = await fetch('/api/employees', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        name: createName.trim() || form.get('name'),
        email: form.get('email'),
        password: form.get('password'),
        professional_name: isProfissionalCargo
          ? createProfessionalName.trim()
          : String(form.get('professional_name') ?? '').trim() || null,
        panel_role: pack.panel_role,
        flow_role: pack.flow_role,
        can_publish: pack.can_publish,
        modules: fineTune ? createModules : pack.extras,
        areaIds: [...pack.areaIds],
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
    setCreateName('')
    setCreateProfessionalName('')
    setSelectedProId('')
    setCreateModules([...pack.extras])
    setFineTune(false)
    // Recarrega roster para marcar "já tem acesso"
    fetch('/api/employees/professionals', { credentials: 'include' })
      .then((r) => r.json())
      .then((body) => setProfessionals(body.data?.professionals ?? []))
      .catch(() => null)
  }

  async function saveModules(person: Employee) {
    setSaving(true)
    setError(null)
    const res = await fetch(`/api/employees/${person.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        modules: editModules,
        professional_name: editProfessionalName.trim() || null,
      }),
    })
    const json = await res.json()
    setSaving(false)
    if (!res.ok) {
      setError(json.error ?? 'Não foi possível salvar os sistemas')
      return
    }
    setEmployees((prev) => prev.map((item) => (item.id === person.id ? json.data.employee : item)))
    setEditingId(null)
    fetch('/api/employees/professionals', { credentials: 'include' })
      .then((r) => r.json())
      .then((body) => setProfessionals(body.data?.professionals ?? []))
      .catch(() => null)
  }

  const previewModules = pack ? modulesForCargo({ ...pack, extras: fineTune ? createModules : pack.extras }) : []
  const previewSystemLabels = [
    ...previewModules.map((key) => GRANTABLE_MODULES.find((m) => m.key === key)?.label ?? key),
    ...(isProfissionalCargo ? ['Meu faturamento'] : []),
  ]

  return (
    <IntranetPage
      kicker="Diretório"
      title="Gestão de usuário"
      subtitle="Escolha o cargo (pacote), preencha nome e senha. O acesso do painel e do Rom Flow já vem montado."
    >
      <SectionCard title="Colaboradores" badge={<span className="text-xs text-muted">{employees.length}</span>}>
        <ul className="divide-y divide-border">
          {employees.length === 0 && (
            <li className="py-4 text-sm text-muted">Ninguém cadastrado ainda. Escolha um cargo abaixo e crie o primeiro acesso.</li>
          )}
          {employees.map((person) => {
            const extras = parseGrantableModules(person.modules)
            const matched = matchCargoPackage({
              panel_role: person.panel_role,
              flow_role: person.flow_role,
              modules: extras,
              areaIds: person.areaIds,
            })
            return (
              <li key={person.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{person.name}</p>
                    <p className="text-xs text-muted">{person.email}</p>
                    {person.professional_name ? (
                      <p className="mt-0.5 text-xs text-muted">Avec: {person.professional_name}</p>
                    ) : null}
                    <p className="mt-1 text-[0.65rem] uppercase tracking-wide text-gold-strong">
                      {matched?.alias ?? person.panel_role}
                      {extras.length > 0 ? ` · extra ${extras.join(' · ')}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs uppercase tracking-wide text-muted">{person.flow_role}</span>
                    {canManage && (
                      <button
                        type="button"
                        className="text-xs font-medium text-gold-strong"
                        onClick={() => {
                          setEditingId(person.id)
                          setEditModules(extras)
                          setEditProfessionalName(person.professional_name ?? '')
                        }}
                      >
                        Ajustar
                      </button>
                    )}
                  </div>
                </div>
                {editingId === person.id && (
                  <div className="mt-3 rounded-xl border border-border bg-background p-3">
                    <label className="mb-3 block text-sm">
                      <span className="mb-1 block text-xs uppercase tracking-wide text-muted">
                        Profissional da unidade (Avec)
                      </span>
                      {professionals.length > 0 ? (
                        <select
                          value={
                            professionals.find((pro) => pro.name === editProfessionalName)?.id ?? ''
                          }
                          onChange={(e) => {
                            const pro = professionals.find((item) => item.id === e.target.value)
                            setEditProfessionalName(pro?.name ?? '')
                          }}
                          className="w-full rounded-xl border border-border bg-background px-3 py-2"
                        >
                          <option value="">Sem vínculo Avec</option>
                          {professionals.map((pro) => (
                            <option key={pro.id} value={pro.id}>
                              {pro.name}
                              {pro.linked_employee_id && pro.linked_employee_id !== person.id
                                ? ` · já: ${pro.linked_email}`
                                : ''}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          value={editProfessionalName}
                          onChange={(e) => setEditProfessionalName(e.target.value)}
                          placeholder="Igual ao relatório de profissionais"
                          className="w-full rounded-xl border border-border bg-background px-3 py-2"
                        />
                      )}
                    </label>
                    {person.panel_role !== 'admin' ? (
                      <ModuleChecks
                        role={person.panel_role}
                        selected={editModules}
                        onToggle={toggleEdit}
                        showMeuFaturamento={Boolean(person.professional_name) || matched?.id === 'profissional'}
                      />
                    ) : null}
                    <div className="mt-3 flex gap-2">
                      <PanelButton
                        type="button"
                        disabled={saving}
                        onClick={() => void saveModules(person)}
                        className="px-3 py-1.5 text-xs"
                      >
                        {saving ? 'Salvando…' : 'Salvar'}
                      </PanelButton>
                      <PanelButton type="button" variant="outline" className="px-3 py-1.5 text-xs" onClick={() => setEditingId(null)}>
                        Cancelar
                      </PanelButton>
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </SectionCard>

      {canManage && pack && (
        <SectionCard title="Novo colaborador">
          <p className="mb-3 text-sm text-muted">1 · Escolha o cargo (alias vazio). 2 · Preencha os dados. 3 · Criar acesso.</p>
          <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {CARGO_PACKAGES.map((item) => {
              const active = item.id === cargoId
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setCargoId(item.id)}
                  className={
                    active
                      ? 'rounded-2xl border border-foreground bg-foreground px-3 py-3 text-left text-background'
                      : 'rounded-2xl border border-border bg-background px-3 py-3 text-left hover:border-foreground/40'
                  }
                >
                  <p className="text-sm font-medium">{item.alias}</p>
                  <p className={`mt-1 text-xs ${active ? 'text-background/80' : 'text-muted'}`}>{item.summary}</p>
                  <p className={`mt-2 text-[0.65rem] uppercase tracking-wide ${active ? 'text-background/70' : 'text-gold-strong'}`}>
                    {item.examples}
                  </p>
                </button>
              )
            })}
          </div>

          <div className="mb-4 rounded-2xl border border-border bg-background px-4 py-3 text-sm">
            <p className="font-medium">{pack.label}</p>
            <p className="mt-1 text-muted">{pack.summary}</p>
            <p className="mt-2 text-xs text-muted">
              Painel: <span className="text-foreground">{pack.panel_role}</span>
              {' · '}
              Flow: <span className="text-foreground">{pack.flow_role}</span>
              {pack.areaIds.length > 0 ? (
                <>
                  {' · '}
                  Áreas: <span className="text-foreground">{pack.areaIds.join(', ')}</span>
                </>
              ) : (
                <> · Sem áreas Flow</>
              )}
              {pack.can_publish ? ' · Pode publicar MKT' : ''}
            </p>
            <p className="mt-1 text-xs text-muted">
              Sistemas: {previewSystemLabels.length > 0 ? previewSystemLabels.join(' · ') : '—'}
            </p>
          </div>

          <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
            {isProfissionalCargo ? (
              <>
                <div className="sm:col-span-2">
                  <p className="mb-1 text-xs uppercase tracking-wide text-muted">
                    Profissional da unidade ({professionals.length})
                  </p>
                  <input
                    type="search"
                    value={proSearch}
                    onChange={(e) => setProSearch(e.target.value)}
                    placeholder="Buscar pelo nome…"
                    className="mb-2 w-full rounded-xl border border-border bg-background px-3 py-2"
                  />
                  <ul className="max-h-56 overflow-y-auto rounded-xl border border-border bg-background divide-y divide-border">
                    {filteredProfessionals.length === 0 ? (
                      <li className="px-3 py-3 text-sm text-muted">Nenhum profissional com esse nome.</li>
                    ) : (
                      filteredProfessionals.map((pro) => {
                        const taken = Boolean(pro.linked_employee_id)
                        const active = pro.id === selectedProId
                        return (
                          <li key={pro.id}>
                            <button
                              type="button"
                              disabled={taken}
                              onClick={() => onSelectProfessional(pro.id)}
                              className={
                                active
                                  ? 'flex w-full items-start justify-between gap-2 bg-foreground px-3 py-2.5 text-left text-sm text-background'
                                  : taken
                                    ? 'flex w-full items-start justify-between gap-2 px-3 py-2.5 text-left text-sm text-muted opacity-60'
                                    : 'flex w-full items-start justify-between gap-2 px-3 py-2.5 text-left text-sm hover:bg-foreground/5'
                              }
                            >
                              <span>
                                {pro.name}
                                {pro.role === 'makeup' ? (
                                  <span className={active ? 'text-background/70' : 'text-muted'}> · maquiagem</span>
                                ) : null}
                              </span>
                              {taken ? (
                                <span className="shrink-0 text-[0.65rem] uppercase tracking-wide">
                                  já: {pro.linked_email}
                                </span>
                              ) : null}
                            </button>
                          </li>
                        )
                      })
                    )}
                  </ul>
                  {!selectedProId ? (
                    <p className="mt-2 text-xs text-danger">Escolha o profissional na lista para vincular o acesso.</p>
                  ) : null}
                </div>
                {selectedPro ? (
                  <p className="sm:col-span-2 text-xs text-muted">
                    Vínculo Avec: <span className="text-foreground">{selectedPro.name}</span>
                    {selectedPro.avec_pro_id ? ` · id ${selectedPro.avec_pro_id}` : ''}
                    . Ele verá só o próprio faturamento e os próprios clientes.
                  </p>
                ) : null}
                <input
                  name="name"
                  required
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="Nome de exibição"
                  className="rounded-xl border border-border bg-background px-3 py-2"
                />
                <input name="email" type="email" required placeholder="E-mail que ele te passou" className="rounded-xl border border-border bg-background px-3 py-2" />
                <input type="hidden" name="professional_name" value={createProfessionalName} />
              </>
            ) : (
              <>
                <input
                  name="name"
                  required
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="Nome"
                  className="rounded-xl border border-border bg-background px-3 py-2"
                />
                <input name="email" type="email" required placeholder="E-mail" className="rounded-xl border border-border bg-background px-3 py-2" />
                <input
                  name="professional_name"
                  placeholder="Nome no Avec (0021) — opcional"
                  className="rounded-xl border border-border bg-background px-3 py-2 sm:col-span-2"
                />
              </>
            )}
            <input
              name="password"
              type="password"
              required
              minLength={8}
              placeholder="Senha inicial (mín. 8)"
              className="rounded-xl border border-border bg-background px-3 py-2 sm:col-span-2"
            />
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" checked={fineTune} onChange={(e) => setFineTune(e.target.checked)} />
              Ajuste fino dos sistemas (avançado)
            </label>
            {fineTune && (
              <div className="sm:col-span-2">
                <ModuleChecks
                  role={pack.panel_role}
                  selected={createModules}
                  onToggle={toggleCreate}
                  showMeuFaturamento={isProfissionalCargo}
                />
              </div>
            )}
            {isProfissionalCargo && !fineTune ? (
              <p className="sm:col-span-2 text-xs text-muted">
                Inclui também <span className="text-foreground">Meu faturamento</span> (só a linha dele no salão).
              </p>
            ) : null}
            {error && <p className="sm:col-span-2 text-sm text-danger">{error}</p>}
            <div className="sm:col-span-2">
              <PanelButton type="submit" disabled={saving}>
                {saving ? 'Salvando…' : `Criar acesso · ${pack.alias}`}
              </PanelButton>
            </div>
          </form>
        </SectionCard>
      )}
    </IntranetPage>
  )
}
