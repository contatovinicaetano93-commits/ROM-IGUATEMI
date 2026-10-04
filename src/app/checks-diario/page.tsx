'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { upload } from '@vercel/blob/client'
import { Camera, CheckCircle2, Circle, Plus, Users } from 'lucide-react'
import { IntranetPage } from '../_components/intranet/IntranetPage'
import { PanelButton, SectionCard } from '../_components/ui'
import {
  CHECKS_TEAMS,
  type ChecksDiarioBoard,
  type ChecksDiarioPersonBoard,
  type ChecksTeamId,
} from '@/lib/checks-diario/types'

type AccessMeta = {
  can_edit: boolean
  is_dono: boolean
  is_admin_master: boolean
  scoped_team: ChecksTeamId | null
}

type EmployeeLite = {
  id: string
  name: string
  email: string
}

type TabId = 'meus' | 'equipe'

function teamLabel(id: ChecksTeamId | null): string {
  if (!id) return '—'
  return CHECKS_TEAMS.find((t) => t.id === id)?.label ?? id
}

function formatDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  if (!y || !m || !d) return day
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  }).format(new Date(Date.UTC(y, m - 1, d)))
}

export default function ChecksDiarioPage() {
  const [board, setBoard] = useState<ChecksDiarioBoard | null>(null)
  const [access, setAccess] = useState<AccessMeta | null>(null)
  const [employees, setEmployees] = useState<EmployeeLite[]>([])
  const [team, setTeam] = useState<ChecksTeamId | 'all'>('all')
  const [tab, setTab] = useState<TabId>('equipe')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null)

  const [newEmployeeId, setNewEmployeeId] = useState('')
  const [newTitle, setNewTitle] = useState('')
  const [newRequiresPhoto, setNewRequiresPhoto] = useState(false)
  const [savingTask, setSavingTask] = useState(false)

  const [assignEmployeeId, setAssignEmployeeId] = useState('')
  const [assignTeam, setAssignTeam] = useState<ChecksTeamId>('gestor_unidade')
  const [assignLead, setAssignLead] = useState(false)
  const [savingMember, setSavingMember] = useState(false)

  const load = useCallback(async (teamFilter: ChecksTeamId | 'all') => {
    setLoading(true)
    setError(null)
    try {
      const qs = teamFilter !== 'all' ? `?team=${encodeURIComponent(teamFilter)}` : ''
      const res = await fetch(`/api/checks-diario${qs}`, { credentials: 'include' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(json.error ?? 'Falha ao carregar checks')
        setBoard(null)
        return
      }
      setBoard(json.data?.board ?? null)
      setAccess(json.data?.access ?? null)
      if (json.data?.board?.team_filter) {
        setTeam(json.data.board.team_filter)
      }
    } catch {
      setError('Falha ao carregar checks')
      setBoard(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load(team)
  }, [load, team])

  useEffect(() => {
    if (!access?.can_edit && !access?.is_dono) return
    let cancelled = false
    fetch('/api/checks-diario/employees', { credentials: 'include' })
      .then((r) => r.json())
      .then((json) => {
        if (!cancelled) setEmployees(json.data?.employees ?? [])
      })
      .catch(() => {
        if (!cancelled) setEmployees([])
      })
    return () => {
      cancelled = true
    }
  }, [access?.can_edit, access?.is_dono])

  const canPickTeam = Boolean(access?.is_admin_master || access?.is_dono)
  const isMasterView = Boolean(board?.is_master_view)

  const myPerson = useMemo(() => {
    if (!board?.my_employee_id) return null
    return board.people.find((p) => p.employee_id === board.my_employee_id) ?? null
  }, [board])

  async function completeTask(
    taskId: string,
    opts: { requiresPhoto: boolean; file?: File | null; capturedAt?: string | null },
  ) {
    setBusyTaskId(taskId)
    setError(null)
    try {
      let photoUrl: string | null = null
      let photoCapturedAt: string | null = opts.capturedAt ?? null
      if (opts.requiresPhoto) {
        if (!opts.file) throw new Error('Tire a foto agora para concluir este check')
        if (!photoCapturedAt) photoCapturedAt = new Date().toISOString()
        const blob = await upload(opts.file.name || `check-${taskId}.jpg`, opts.file, {
          access: 'public',
          handleUploadUrl: '/api/checks-diario/upload',
        })
        photoUrl = blob.url
      }
      const res = await fetch('/api/checks-diario/complete', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task_id: taskId,
          photo_url: photoUrl,
          photo_captured_at: photoCapturedAt,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error ?? 'Falha ao lançar check')
      await load(team)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao lançar check')
    } finally {
      setBusyTaskId(null)
    }
  }

  async function createTask(e: React.FormEvent) {
    e.preventDefault()
    if (!newEmployeeId || !newTitle.trim()) return
    setSavingTask(true)
    setError(null)
    try {
      const res = await fetch('/api/checks-diario/tasks', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_id: newEmployeeId,
          title: newTitle.trim(),
          requires_photo: newRequiresPhoto,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error ?? 'Falha ao criar tarefa')
      setNewTitle('')
      setNewRequiresPhoto(false)
      await load(team)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao criar tarefa')
    } finally {
      setSavingTask(false)
    }
  }

  async function assignMember(e: React.FormEvent) {
    e.preventDefault()
    if (!assignEmployeeId) return
    setSavingMember(true)
    setError(null)
    try {
      const res = await fetch('/api/checks-diario', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'assign_member',
          employee_id: assignEmployeeId,
          team: assignTeam,
          is_lead: assignLead,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error ?? 'Falha ao colocar na equipe')
      setAssignEmployeeId('')
      await load(team)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao colocar na equipe')
    } finally {
      setSavingMember(false)
    }
  }

  async function deactivateTask(taskId: string) {
    setBusyTaskId(taskId)
    setError(null)
    try {
      const res = await fetch('/api/checks-diario/tasks', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_id: taskId, active: false }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error ?? 'Falha ao remover tarefa')
      await load(team)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao remover tarefa')
    } finally {
      setBusyTaskId(null)
    }
  }

  const myPending = myPerson?.tasks.filter((t) => t.done_count === 0).length ?? 0
  const subtitle = board
    ? isMasterView
      ? `${formatDay(board.day)} · ${board.summary.complete}/${board.summary.people} ok na equipe`
      : `${formatDay(board.day)} · ${myPerson ? `${myPerson.done_tasks}/${myPerson.total_tasks} feitos` : 'seus checks'}`
    : 'Rotina do dia'

  return (
    <IntranetPage
      kicker="Operação"
      title="Checks diários"
      subtitle={subtitle}
      actions={
        canPickTeam ? (
          <select
            className="rounded-full border border-border bg-card px-3 py-2 text-sm"
            value={team}
            onChange={(e) => setTeam(e.target.value as ChecksTeamId | 'all')}
          >
            <option value="all">Todas as equipes</option>
            {CHECKS_TEAMS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        ) : null
      }
    >
      {error ? (
        <p className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}

      {loading && !board ? <p className="text-sm text-muted">Carregando…</p> : null}

      {isMasterView ? (
        <div className="flex gap-2">
          <TabButton active={tab === 'meus'} onClick={() => setTab('meus')}>
            Meus checks
            {myPending > 0 ? (
              <span className="ml-1 rounded-full bg-gold/20 px-1.5 text-[0.65rem] text-gold-strong">
                {myPending}
              </span>
            ) : null}
          </TabButton>
          <TabButton active={tab === 'equipe'} onClick={() => setTab('equipe')}>
            <Users size={14} />
            Equipe
          </TabButton>
        </div>
      ) : null}

      {(tab === 'meus' || !isMasterView) && (
        <MyChecksCard
          person={myPerson}
          busyTaskId={busyTaskId}
          emptyHint={
            isMasterView
              ? 'Você não tem checks pessoais hoje — use a aba Equipe para fiscalizar.'
              : 'Seu lead ainda não atribuiu checks para hoje.'
          }
          onComplete={completeTask}
        />
      )}

      {isMasterView && tab === 'equipe' ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SummaryTile label="Pessoas" value={String(board?.summary.people ?? 0)} />
            <SummaryTile label="Completos" value={String(board?.summary.complete ?? 0)} tone="success" />
            <SummaryTile label="Parciais" value={String(board?.summary.partial ?? 0)} tone="gold" />
            <SummaryTile label="Pendentes" value={String(board?.summary.pending ?? 0)} tone="danger" />
          </div>

          {access?.can_edit ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <SectionCard title="Criar check para alguém">
                <p className="mb-3 text-xs text-muted">
                  Ex.: “Abrir caixa”, “Foto do estoque”. Marque foto se precisar prova ao vivo.
                </p>
                <form className="space-y-3" onSubmit={createTask}>
                  <select
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                    value={newEmployeeId}
                    onChange={(e) => setNewEmployeeId(e.target.value)}
                    required
                  >
                    <option value="">Quem vai fazer…</option>
                    {employees.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.name}
                      </option>
                    ))}
                  </select>
                  <input
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                    placeholder="O que precisa ser feito"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    required
                  />
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={newRequiresPhoto}
                      onChange={(e) => setNewRequiresPhoto(e.target.checked)}
                    />
                    Exige foto na hora (câmera)
                  </label>
                  <PanelButton type="submit" disabled={savingTask}>
                    <Plus size={14} />
                    {savingTask ? 'Salvando…' : 'Criar check'}
                  </PanelButton>
                </form>
              </SectionCard>

              <SectionCard title="Colocar pessoa na equipe">
                <p className="mb-3 text-xs text-muted">
                  Diz em qual time ela entra nos checks (Ops Fin, Gestor ou RH). Quase sempre o cargo
                  já faz isso sozinho — use só se faltar alguém na lista.
                </p>
                <form className="space-y-3" onSubmit={assignMember}>
                  <select
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                    value={assignEmployeeId}
                    onChange={(e) => setAssignEmployeeId(e.target.value)}
                    required
                  >
                    <option value="">Colaborador…</option>
                    {employees.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.name}
                      </option>
                    ))}
                  </select>
                  <select
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                    value={assignTeam}
                    onChange={(e) => setAssignTeam(e.target.value as ChecksTeamId)}
                    disabled={!canPickTeam && Boolean(access?.scoped_team)}
                  >
                    {CHECKS_TEAMS.filter(
                      (t) => !access?.scoped_team || t.id === access.scoped_team,
                    ).map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                  {access?.is_admin_master ? (
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={assignLead}
                        onChange={(e) => setAssignLead(e.target.checked)}
                      />
                      É responsável (lead) da equipe
                    </label>
                  ) : null}
                  <PanelButton type="submit" disabled={savingMember} variant="outline">
                    {savingMember ? 'Salvando…' : 'Colocar na equipe'}
                  </PanelButton>
                </form>
              </SectionCard>
            </div>
          ) : access?.is_dono ? (
            <p className="text-sm text-muted">Modo leitura (Dono) — sem editar tarefas.</p>
          ) : null}

          <SectionCard title="Status da equipe hoje">
            {!board || board.people.length === 0 ? (
              <p className="text-sm text-muted">
                Ninguém na equipe ainda. Confira os cargos ou use “Colocar pessoa na equipe”.
              </p>
            ) : (
              <ul className="space-y-3">
                {board.people.map((person) => (
                  <PersonRow
                    key={person.employee_id}
                    person={person}
                    canEdit={Boolean(access?.can_edit)}
                    busyTaskId={busyTaskId}
                    onRemove={deactivateTask}
                  />
                ))}
              </ul>
            )}
          </SectionCard>
        </>
      ) : null}
    </IntranetPage>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
        active
          ? 'bg-foreground text-background'
          : 'border border-border text-foreground/80 hover:bg-card'
      }`}
    >
      {children}
    </button>
  )
}

function MyChecksCard({
  person,
  busyTaskId,
  emptyHint,
  onComplete,
}: {
  person: ChecksDiarioPersonBoard | null
  busyTaskId: string | null
  emptyHint: string
  onComplete: (
    taskId: string,
    opts: { requiresPhoto: boolean; file?: File | null; capturedAt?: string | null },
  ) => void
}) {
  const total = person?.total_tasks ?? 0
  const done = person?.done_tasks ?? 0
  const pct = total > 0 ? Math.round((done / total) * 100) : 0

  return (
    <SectionCard
      title="Meus checks de hoje"
      badge={person ? `${done}/${total}` : undefined}
    >
      {total > 0 ? (
        <div className="mb-4">
          <div className="h-1.5 overflow-hidden rounded-full bg-border">
            <div
              className="h-full rounded-full bg-gold-strong transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="mt-1.5 text-xs text-muted">
            {done >= total ? 'Tudo feito por hoje.' : `${total - done} pendente(s)`}
          </p>
        </div>
      ) : null}

      {!person || person.tasks.length === 0 ? (
        <p className="text-sm text-muted">{emptyHint}</p>
      ) : (
        <ul className="space-y-3">
          {person.tasks.map((task) => {
            const isDone = task.done_count > 0
            return (
              <li
                key={task.id}
                className={`rounded-2xl border px-4 py-3 ${
                  isDone ? 'border-success/30 bg-success/5' : 'border-border bg-background'
                }`}
              >
                <div className="flex items-start gap-3">
                  {isDone ? (
                    <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-success" />
                  ) : (
                    <Circle size={20} className="mt-0.5 shrink-0 text-muted" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium leading-snug">{task.title}</p>
                    {task.description ? (
                      <p className="mt-1 text-xs text-muted">{task.description}</p>
                    ) : null}
                    {task.requires_photo && !isDone ? (
                      <p className="mt-1 text-[0.7rem] uppercase tracking-wide text-gold-strong">
                        Precisa de foto ao vivo
                      </p>
                    ) : null}
                  </div>
                </div>
                <div className="mt-3 flex justify-end">
                  {isDone ? (
                    <span className="text-xs font-medium text-success">Feito</span>
                  ) : task.requires_photo ? (
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background">
                      <Camera size={14} />
                      {busyTaskId === task.id ? 'Enviando…' : 'Tirar foto e concluir'}
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        disabled={busyTaskId === task.id}
                        onChange={(e) => {
                          const file = e.target.files?.[0] ?? null
                          const capturedAt = new Date().toISOString()
                          onComplete(task.id, {
                            requiresPhoto: true,
                            file,
                            capturedAt,
                          })
                          e.target.value = ''
                        }}
                      />
                    </label>
                  ) : (
                    <PanelButton
                      disabled={busyTaskId === task.id}
                      onClick={() => onComplete(task.id, { requiresPhoto: false })}
                    >
                      {busyTaskId === task.id ? '…' : 'Concluir'}
                    </PanelButton>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </SectionCard>
  )
}

function PersonRow({
  person,
  canEdit,
  busyTaskId,
  onRemove,
}: {
  person: ChecksDiarioPersonBoard
  canEdit: boolean
  busyTaskId: string | null
  onRemove: (taskId: string) => void
}) {
  const pct =
    person.total_tasks > 0
      ? Math.round((person.done_tasks / person.total_tasks) * 100)
      : 0
  return (
    <li className="rounded-2xl border border-border p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">{person.name}</p>
          <p className="text-xs text-muted">
            {teamLabel(person.team)}
            {person.is_lead ? ' · responsável' : ''}
          </p>
        </div>
        <span className="text-xs font-medium">
          {person.done_tasks}/{person.total_tasks}
        </span>
      </div>
      {person.total_tasks > 0 ? (
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-border">
          <div className="h-full rounded-full bg-gold-strong" style={{ width: `${pct}%` }} />
        </div>
      ) : null}
      {person.tasks.length === 0 ? (
        <p className="mt-2 text-xs text-muted">Sem checks ativos.</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {person.tasks.map((task) => (
            <li key={task.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                {task.done_count > 0 ? (
                  <CheckCircle2 size={14} className="shrink-0 text-success" />
                ) : (
                  <Circle size={14} className="shrink-0 text-muted" />
                )}
                <span className="truncate">{task.title}</span>
                {task.requires_photo ? (
                  <Camera size={12} className="shrink-0 text-gold-strong" />
                ) : null}
                {task.logs_today[0]?.photo_url ? (
                  <a
                    href={task.logs_today[0].photo_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-gold-strong underline"
                  >
                    foto
                  </a>
                ) : null}
              </span>
              {canEdit ? (
                <button
                  type="button"
                  className="shrink-0 text-xs text-muted underline"
                  disabled={busyTaskId === task.id}
                  onClick={() => onRemove(task.id)}
                >
                  remover
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

function SummaryTile({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: 'success' | 'gold' | 'danger'
}) {
  const color =
    tone === 'success'
      ? 'text-success'
      : tone === 'danger'
        ? 'text-danger'
        : tone === 'gold'
          ? 'text-gold-strong'
          : 'text-foreground'
  return (
    <div className="rounded-2xl border border-border bg-card px-4 py-3">
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${color}`}>{value}</p>
    </div>
  )
}
