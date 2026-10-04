'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { upload } from '@vercel/blob/client'
import { Camera, CheckCircle2, Circle, Plus } from 'lucide-react'
import { IntranetPage } from '../_components/intranet/IntranetPage'
import { PanelButton, SectionCard } from '../_components/ui'
import {
  CHECKS_TEAMS,
  type ChecksDiarioBoard,
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

function teamLabel(id: ChecksTeamId | null): string {
  if (!id) return '—'
  return CHECKS_TEAMS.find((t) => t.id === id)?.label ?? id
}

export default function ChecksDiarioPage() {
  const [board, setBoard] = useState<ChecksDiarioBoard | null>(null)
  const [access, setAccess] = useState<AccessMeta | null>(null)
  const [employees, setEmployees] = useState<EmployeeLite[]>([])
  const [team, setTeam] = useState<ChecksTeamId | 'all'>('all')
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
      if (!res.ok) throw new Error(json.error ?? 'Falha ao vincular')
      setAssignEmployeeId('')
      await load(team)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao vincular')
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

  return (
    <IntranetPage
      kicker="Operação"
      title="Checks diários"
      subtitle={
        board
          ? `${board.day} · ${board.summary.complete}/${board.summary.people} ok · ${board.summary.logs_today} lançamentos`
          : 'Rotina do dia por pessoa'
      }
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

      {loading && !board ? (
        <p className="text-sm text-muted">Carregando…</p>
      ) : null}

      {myPerson && myPerson.tasks.length > 0 ? (
        <SectionCard title="Meus checks de hoje" badge={`${myPerson.done_tasks}/${myPerson.total_tasks}`}>
          <ul className="space-y-3">
            {myPerson.tasks.map((task) => {
              const done = task.done_count > 0
              return (
                <li
                  key={task.id}
                  className="flex flex-col gap-2 rounded-xl border border-border px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-medium">
                      {done ? (
                        <CheckCircle2 size={16} className="shrink-0 text-success" />
                      ) : (
                        <Circle size={16} className="shrink-0 text-muted" />
                      )}
                      <span className="truncate">{task.title}</span>
                      {task.requires_photo ? (
                        <span className="shrink-0 text-[0.65rem] uppercase tracking-wide text-gold-strong">
                          foto
                        </span>
                      ) : null}
                    </p>
                    {task.description ? (
                      <p className="mt-1 text-xs text-muted">{task.description}</p>
                    ) : null}
                  </div>
                  {!done ? (
                    task.requires_photo ? (
                      <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-border px-3 py-1.5 text-sm">
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
                            void completeTask(task.id, {
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
                        onClick={() => void completeTask(task.id, { requiresPhoto: false })}
                      >
                        {busyTaskId === task.id ? '…' : 'Concluir'}
                      </PanelButton>
                    )
                  ) : (
                    <span className="text-xs text-success">Feito</span>
                  )}
                </li>
              )
            })}
          </ul>
        </SectionCard>
      ) : null}

      {board && !board.is_master_view && myPerson && myPerson.tasks.length === 0 ? (
        <SectionCard title="Meus checks de hoje">
          <p className="text-sm text-muted">Nenhuma tarefa atribuída hoje.</p>
        </SectionCard>
      ) : null}

      {board?.is_master_view ? (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            <SummaryTile label="Pessoas" value={String(board.summary.people)} />
            <SummaryTile label="Completos" value={String(board.summary.complete)} tone="success" />
            <SummaryTile label="Parciais" value={String(board.summary.partial)} tone="gold" />
            <SummaryTile label="Pendentes" value={String(board.summary.pending)} tone="danger" />
          </div>

          {access?.can_edit ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <SectionCard title="Nova tarefa">
                <form className="space-y-3" onSubmit={createTask}>
                  <select
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                    value={newEmployeeId}
                    onChange={(e) => setNewEmployeeId(e.target.value)}
                    required
                  >
                    <option value="">Colaborador…</option>
                    {employees.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.name}
                      </option>
                    ))}
                  </select>
                  <input
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                    placeholder="Título do check"
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
                    Exige foto ao vivo
                  </label>
                  <PanelButton type="submit" disabled={savingTask}>
                    <Plus size={14} />
                    {savingTask ? 'Salvando…' : 'Adicionar'}
                  </PanelButton>
                </form>
              </SectionCard>

              <SectionCard title="Vincular à equipe">
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
                      É lead da equipe
                    </label>
                  ) : null}
                  <PanelButton type="submit" disabled={savingMember} variant="outline">
                    {savingMember ? 'Salvando…' : 'Vincular'}
                  </PanelButton>
                </form>
              </SectionCard>
            </div>
          ) : access?.is_dono ? (
            <p className="text-sm text-muted">Modo leitura (Dono) — sem editar tarefas.</p>
          ) : null}

          <SectionCard title="Equipe hoje">
            {board.people.length === 0 ? (
              <p className="text-sm text-muted">Ninguém vinculado ainda.</p>
            ) : (
              <ul className="space-y-4">
                {board.people.map((person) => (
                  <li key={person.employee_id} className="rounded-xl border border-border p-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold">{person.name}</p>
                        <p className="text-xs text-muted">
                          {teamLabel(person.team)}
                          {person.is_lead ? ' · lead' : ''}
                        </p>
                      </div>
                      <span className="text-xs font-medium">
                        {person.done_tasks}/{person.total_tasks}
                      </span>
                    </div>
                    {person.tasks.length === 0 ? (
                      <p className="mt-2 text-xs text-muted">Sem tarefas ativas.</p>
                    ) : (
                      <ul className="mt-2 space-y-1.5">
                        {person.tasks.map((task) => (
                          <li
                            key={task.id}
                            className="flex items-center justify-between gap-2 text-sm"
                          >
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
                                  ver foto
                                </a>
                              ) : null}
                            </span>
                            {access?.can_edit ? (
                              <button
                                type="button"
                                className="shrink-0 text-xs text-muted underline"
                                disabled={busyTaskId === task.id}
                                onClick={() => void deactivateTask(task.id)}
                              >
                                remover
                              </button>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    )}
                    {board.my_employee_id === person.employee_id &&
                    !access?.can_edit &&
                    person.tasks.some((t) => t.done_count === 0) ? (
                      <p className="mt-2 text-xs text-muted">
                        Suas pendências aparecem acima em “Meus checks”.
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </>
      ) : null}
    </IntranetPage>
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
