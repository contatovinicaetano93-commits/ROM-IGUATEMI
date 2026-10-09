'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { upload } from '@vercel/blob/client'
import { Camera, CheckCircle2, Circle, Plus, Settings2, Users } from 'lucide-react'
import { IntranetPage } from '../_components/intranet/IntranetPage'
import { IntranetPageSkeleton } from '../_components/intranet/IntranetPageSkeleton'
import { PanelButton, SectionCard } from '../_components/ui'
import {
  buildTeamNetwork,
  type TeamNetworkPerson,
  type TeamNetworkRow,
} from '@/lib/checks-diario/team-network'
import {
  checksDayProgressLabel,
  summarizeChecksPeople,
} from '@/lib/checks-diario/summary'
import { checksDiarioBlobPathname } from '@/lib/checks-diario/photo'
import {
  CHECKS_CARGOS,
  CHECKS_TEAMS,
  checksCargoLabel,
  resolveChecksCargo,
  type ChecksCargoId,
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

/** hoje = rotina do dia; config = quem fiscaliza quem (fora do fluxo diário). */
type TabId = 'meus' | 'hoje' | 'config'

function personRoleLabel(person: {
  team: ChecksTeamId | null
  is_lead: boolean
  cargo?: ChecksCargoId | null
}): string {
  const cargo = resolveChecksCargo({
    cargo: person.cargo,
    team: person.team,
    is_lead: person.is_lead,
  })
  if (cargo) return checksCargoLabel(cargo)
  if (!person.team) return '—'
  return CHECKS_TEAMS.find((t) => t.id === person.team)?.label ?? person.team
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
  const [tab, setTab] = useState<TabId>('hoje')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null)
  const [savingTaskFor, setSavingTaskFor] = useState<string | null>(null)
  const [composingFor, setComposingFor] = useState<string | null>(null)

  const [assignEmployeeId, setAssignEmployeeId] = useState('')
  const [assignCargo, setAssignCargo] = useState<ChecksCargoId>('recepcao')
  const [savingMember, setSavingMember] = useState(false)
  const [busyUnassignId, setBusyUnassignId] = useState<string | null>(null)
  const loadGen = useRef(0)

  const load = useCallback(async (teamFilter: ChecksTeamId | 'all', quiet = false) => {
    const seq = ++loadGen.current
    if (!quiet) setLoading(true)
    if (!quiet) setError(null)
    try {
      const qs = teamFilter !== 'all' ? `?team=${encodeURIComponent(teamFilter)}` : ''
      const res = await fetch(`/api/checks-diario${qs}`, { credentials: 'include' })
      const json = await res.json().catch(() => ({}))
      if (seq !== loadGen.current) return
      if (!res.ok) {
        setError(json.error ?? 'Falha ao carregar checks')
        return
      }
      setError(null)
      setBoard(json.data?.board ?? null)
      setAccess(json.data?.access ?? null)
    } catch {
      if (seq !== loadGen.current) return
      setError('Falha ao carregar checks')
    } finally {
      if (seq === loadGen.current) setLoading(false)
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
  const assignableCargos = useMemo(() => {
    return CHECKS_CARGOS.filter((c) => {
      if (access?.scoped_team && c.team !== access.scoped_team) return false
      if (!access?.is_admin_master && c.is_lead) return false
      return true
    })
  }, [access?.is_admin_master, access?.scoped_team])

  useEffect(() => {
    if (assignableCargos.length === 0) return
    setAssignCargo((prev) =>
      assignableCargos.some((c) => c.id === prev)
        ? prev
        : (assignableCargos[0]?.id ?? 'recepcao'),
    )
  }, [assignableCargos])

  const myPerson = useMemo(() => {
    if (!board?.my_employee_id) return null
    return board.people.find((p) => p.employee_id === board.my_employee_id) ?? null
  }, [board])

  const teamNetwork = useMemo(
    () => buildTeamNetwork(board?.people ?? [], team),
    [board?.people, team],
  )

  /** Pessoas do dia agrupadas por cargo (quando “todas”). */
  const peopleByTeam = useMemo(() => {
    const people = board?.people ?? []
    const visibleTeams =
      team === 'all' ? CHECKS_TEAMS : CHECKS_TEAMS.filter((t) => t.id === team)
    const groups: Array<{
      teamId: ChecksTeamId | null
      label: string | null
      people: ChecksDiarioPersonBoard[]
    }> = []
    for (const t of visibleTeams) {
      const inTeam = people.filter((p) => p.team === t.id)
      const used = new Set<string>()
      for (const cargo of CHECKS_CARGOS.filter((c) => c.team === t.id)) {
        const slotPeople = inTeam.filter(
          (p) =>
            resolveChecksCargo({
              cargo: p.cargo,
              team: p.team,
              is_lead: p.is_lead,
            }) === cargo.id,
        )
        for (const person of slotPeople) used.add(person.employee_id)
        if (slotPeople.length === 0) continue
        groups.push({
          teamId: t.id,
          label: team === 'all' ? `${t.label} · ${cargo.label}` : cargo.label,
          people: slotPeople,
        })
      }
      const leftovers = inTeam.filter((p) => !used.has(p.employee_id))
      if (leftovers.length > 0) {
        groups.push({
          teamId: t.id,
          label: team === 'all' ? `${t.label} · Outros` : 'Outros na equipe',
          people: leftovers,
        })
      }
    }
    return groups
  }, [board?.people, team])

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
        const blob = await upload(
          checksDiarioBlobPathname(opts.file.name || `check-${taskId}.jpg`),
          opts.file,
          {
            access: 'public',
            handleUploadUrl: '/api/checks-diario/upload',
          },
        )
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
      await load(team, true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao lançar check')
    } finally {
      setBusyTaskId(null)
    }
  }

  async function createTaskForPerson(args: {
    employeeId: string
    title: string
    requiresPhoto: boolean
  }) {
    if (!args.employeeId || !args.title.trim()) return
    setSavingTaskFor(args.employeeId)
    setError(null)
    try {
      const res = await fetch('/api/checks-diario/tasks', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_id: args.employeeId,
          title: args.title.trim(),
          requires_photo: args.requiresPhoto,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error ?? 'Falha ao criar tarefa')
      setComposingFor(null)
      await load(team, true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao criar tarefa')
    } finally {
      setSavingTaskFor(null)
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
          cargo: assignCargo,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error ?? 'Falha ao colocar na equipe')
      setAssignEmployeeId('')
      await load(team, true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao colocar na equipe')
    } finally {
      setSavingMember(false)
    }
  }

  async function unassignMember(
    employeeId: string,
    name: string,
    opts?: { skipConfirm?: boolean },
  ) {
    if (!opts?.skipConfirm) {
      const ok = window.confirm(
        `Tirar ${name} dos Checks?\n\nO cargo não recoloca sozinho. Para voltar, use Configurar equipes.`,
      )
      if (!ok) return
    }
    const snapshot = board
    setBusyUnassignId(employeeId)
    setError(null)
    if (snapshot) {
      const people = snapshot.people.filter((p) => p.employee_id !== employeeId)
      setBoard({
        ...snapshot,
        people,
        summary: summarizeChecksPeople(people, snapshot.summary.logs_today),
      })
    }
    try {
      const res = await fetch('/api/checks-diario', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'unassign_member',
          employee_id: employeeId,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error ?? 'Falha ao tirar da equipe')
      await load(team, true)
    } catch (err) {
      if (snapshot) setBoard(snapshot)
      setError(err instanceof Error ? err.message : 'Falha ao tirar da equipe')
    } finally {
      setBusyUnassignId(null)
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
      await load(team, true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao remover tarefa')
    } finally {
      setBusyTaskId(null)
    }
  }

  // Colaborador sem visão de equipe: só Meus.
  useEffect(() => {
    if (board && !isMasterView && tab !== 'meus') setTab('meus')
  }, [board, isMasterView, tab])

  const myPending = myPerson?.tasks.filter((t) => t.done_count === 0).length ?? 0
  const subtitle = board
    ? tab === 'config'
      ? 'Quem fiscaliza quem — fora da rotina do dia'
      : isMasterView
        ? `${formatDay(board.day)} · ${checksDayProgressLabel(board.summary)}`
        : `${formatDay(board.day)} · ${myPerson ? `${myPerson.done_tasks}/${myPerson.total_tasks} feitos` : 'seus checks'}`
    : loading
      ? 'Carregando o dia…'
      : 'Rotina do dia'

  if (loading && !board && !error) {
    return <IntranetPageSkeleton cards={4} />
  }

  return (
    <IntranetPage
      kicker="Operação"
      title="Checks diários"
      subtitle={subtitle}
      actions={
        canPickTeam && tab !== 'meus' ? (
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
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          <p>{error}</p>
          <button
            type="button"
            className="shrink-0 underline"
            onClick={() => void load(team)}
          >
            Tentar de novo
          </button>
        </div>
      ) : null}

      {isMasterView ? (
        <div className="flex flex-wrap items-center gap-2">
          <TabButton active={tab === 'hoje'} onClick={() => setTab('hoje')}>
            <Users size={14} />
            Hoje
          </TabButton>
          <TabButton active={tab === 'meus'} onClick={() => setTab('meus')}>
            Meus checks
            {myPending > 0 ? (
              <span className="ml-1 rounded-full bg-gold/20 px-1.5 text-[0.65rem] text-gold-strong">
                {myPending}
              </span>
            ) : null}
          </TabButton>
          <button
            type="button"
            onClick={() => setTab('config')}
            className={`ml-auto inline-flex items-center gap-1.5 text-xs ${
              tab === 'config' ? 'font-medium text-foreground' : 'text-muted hover:text-foreground'
            }`}
          >
            <Settings2 size={13} />
            Configurar equipes
          </button>
        </div>
      ) : null}

      {(tab === 'meus' || !isMasterView) && (
        <MyChecksCard
          person={myPerson}
          busyTaskId={busyTaskId}
          emptyHint={
            isMasterView
              ? 'Você não tem checks pessoais — a fiscalização fica em Hoje.'
              : 'Seu responsável ainda não atribuiu checks para hoje.'
          }
          onComplete={completeTask}
        />
      )}

      {isMasterView && tab === 'hoje' && board ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SummaryTile label="Pessoas" value={String(board.summary.people)} />
            <SummaryTile
              label="Completos"
              value={String(board.summary.complete)}
              tone="success"
            />
            <SummaryTile
              label="Parciais"
              value={String(board.summary.partial)}
              tone="gold"
            />
            <SummaryTile
              label="Pendentes"
              value={String(board.summary.pending)}
              tone="danger"
            />
          </div>
          {board.summary.no_routine > 0 ? (
            <p className="text-xs text-muted">
              {board.summary.no_routine} sem rotina — não entram em pendentes.
            </p>
          ) : null}

          {access?.is_dono && !access.can_edit ? (
            <p className="text-sm text-muted">Modo leitura (Dono) — acompanhe o dia, sem editar.</p>
          ) : null}

          {!board || board.people.length === 0 ? (
            <SectionCard title="Equipe de hoje">
              <p className="text-sm text-muted">
                Ninguém nesta visão ainda. Abra{' '}
                <button
                  type="button"
                  className="underline"
                  onClick={() => setTab('config')}
                >
                  Configurar equipes
                </button>{' '}
                ou confira o cargo na Intranet.
              </p>
            </SectionCard>
          ) : (
            <div
              className={`space-y-6 pb-[5.5rem] transition-opacity lg:pb-6 ${
                loading ? 'opacity-70' : 'opacity-100'
              }`}
              aria-busy={loading}
            >
              {peopleByTeam.map((group) => (
                <div
                  key={`${group.teamId ?? 'none'}:${group.label ?? 'people'}`}
                  className="animate-rise space-y-3"
                >
                  {group.label ? (
                    <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
                      {group.label}
                    </h2>
                  ) : null}
                  <ul className="space-y-3">
                    {group.people.map((person) => (
                      <PersonDayCard
                        key={person.employee_id}
                        person={person}
                        canEdit={Boolean(access?.can_edit)}
                        busyTaskId={busyTaskId}
                        composing={composingFor === person.employee_id}
                        saving={savingTaskFor === person.employee_id}
                        onStartCompose={() => setComposingFor(person.employee_id)}
                        onCancelCompose={() => setComposingFor(null)}
                        onCreate={(title, requiresPhoto) =>
                          createTaskForPerson({
                            employeeId: person.employee_id,
                            title,
                            requiresPhoto,
                          })
                        }
                        onRemove={deactivateTask}
                        onUnassign={() =>
                          unassignMember(person.employee_id, person.name, {
                            skipConfirm: true,
                          })
                        }
                        unassigning={busyUnassignId === person.employee_id}
                      />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </>
      ) : null}

      {isMasterView && tab === 'config' ? (
        <div className="animate-rise space-y-5 pb-[5.5rem] lg:pb-6">
          <SectionCard title="Quem fiscaliza quem">
            <p className="mb-3 text-xs text-muted">
              Três times. Cada um tem o responsável e os cargos da equipe — Func fin; Recepção,
              Estoque, Almoxarifado, Pós-venda, Limpeza; Equipe RH. O cargo na Intranet já coloca
              a pessoa no slot certo. Master e o responsável podem tirar alguém — o cargo não
              recoloca sozinho. Para voltar, use o ajuste manual abaixo.
            </p>
            <TeamNetworkMap
              teams={teamNetwork}
              canEdit={Boolean(access?.can_edit)}
              busyUnassignId={busyUnassignId}
              onUnassign={unassignMember}
            />
          </SectionCard>

          {access?.can_edit ? (
            <SectionCard title="Ajuste manual (exceção)">
              <p className="mb-3 text-xs text-muted">
                Use só se faltar alguém na rede. Escolha o cargo da equipe, não só o time do
                gestor.
              </p>
              <form className="grid gap-3 sm:grid-cols-2" onSubmit={assignMember}>
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
                  value={assignCargo}
                  onChange={(e) => setAssignCargo(e.target.value as ChecksCargoId)}
                >
                  {CHECKS_TEAMS.filter(
                    (t) =>
                      assignableCargos.some((c) => c.team === t.id) &&
                      (!access?.scoped_team || t.id === access.scoped_team),
                  ).map((t) => (
                    <optgroup key={t.id} label={t.label}>
                      {assignableCargos
                        .filter((c) => c.team === t.id)
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.is_lead ? `${c.label} (responsável)` : c.label}
                          </option>
                        ))}
                    </optgroup>
                  ))}
                </select>
                <div className="sm:col-span-2">
                  <PanelButton type="submit" disabled={savingMember} variant="outline">
                    {savingMember ? 'Salvando…' : 'Colocar no cargo'}
                  </PanelButton>
                </div>
              </form>
            </SectionCard>
          ) : null}

          <p className="text-center text-xs text-muted">
            <button type="button" className="underline" onClick={() => setTab('hoje')}>
              Voltar para Hoje
            </button>
          </p>
        </div>
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
    <SectionCard title="Meus checks de hoje" badge={person ? `${done}/${total}` : undefined}>
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

function PersonDayCard({
  person,
  canEdit,
  busyTaskId,
  composing,
  saving,
  onStartCompose,
  onCancelCompose,
  onCreate,
  onRemove,
  onUnassign,
  unassigning,
}: {
  person: ChecksDiarioPersonBoard
  canEdit: boolean
  busyTaskId: string | null
  composing: boolean
  saving: boolean
  onStartCompose: () => void
  onCancelCompose: () => void
  onCreate: (title: string, requiresPhoto: boolean) => void
  onRemove: (taskId: string) => void
  onUnassign: () => void
  unassigning: boolean
}) {
  const [title, setTitle] = useState('')
  const [requiresPhoto, setRequiresPhoto] = useState(false)
  const [confirmUnassign, setConfirmUnassign] = useState(false)
  const pct =
    person.total_tasks > 0
      ? Math.round((person.done_tasks / person.total_tasks) * 100)
      : 0
  const emptyRoutine = person.tasks.length === 0 && !composing

  useEffect(() => {
    if (!composing) {
      setTitle('')
      setRequiresPhoto(false)
    }
  }, [composing])

  useEffect(() => {
    if (!unassigning) setConfirmUnassign(false)
  }, [unassigning])

  return (
    <li className="rounded-2xl border border-border bg-card p-4 transition-shadow hover:shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">{person.name}</p>
          <p className="text-xs text-muted">{personRoleLabel(person)}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium">
            {person.total_tasks === 0
              ? 'sem rotina'
              : `${person.done_tasks}/${person.total_tasks}`}
          </span>
          {canEdit ? (
            <>
              <button
                type="button"
                onClick={onStartCompose}
                className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-background"
              >
                <Plus size={12} />
                Check
              </button>
              {!emptyRoutine ? (
                <button
                  type="button"
                  onClick={() => setConfirmUnassign(true)}
                  disabled={unassigning}
                  className="text-xs text-muted underline"
                >
                  {unassigning ? '…' : 'tirar da equipe'}
                </button>
              ) : null}
            </>
          ) : null}
        </div>
      </div>

      {person.total_tasks > 0 ? (
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-border">
          <div className="h-full rounded-full bg-gold-strong transition-[width]" style={{ width: `${pct}%` }} />
        </div>
      ) : null}

      {emptyRoutine ? (
        <p className="mt-3 text-sm text-muted">
          Ainda sem rotina
          {canEdit ? (
            <>
              {' — '}
              <button type="button" className="underline" onClick={onStartCompose}>
                criar primeiro check
              </button>
              {' · '}
              <button
                type="button"
                className="underline"
                disabled={unassigning}
                onClick={() => setConfirmUnassign(true)}
              >
                tirar da equipe
              </button>
            </>
          ) : (
            '.'
          )}
        </p>
      ) : (
        <ul className="mt-3 space-y-1.5">
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

      {composing && canEdit ? (
        <form
          className="mt-3 space-y-2 rounded-xl border border-border bg-background p-3"
          onSubmit={(e) => {
            e.preventDefault()
            onCreate(title, requiresPhoto)
          }}
        >
          <input
            className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm"
            placeholder="Ex.: Abrir caixa, Foto do estoque…"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
            required
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={requiresPhoto}
              onChange={(e) => setRequiresPhoto(e.target.checked)}
            />
            Exige foto na hora
          </label>
          <div className="flex gap-2">
            <PanelButton type="submit" disabled={saving || !title.trim()}>
              {saving ? 'Salvando…' : 'Criar check'}
            </PanelButton>
            <PanelButton type="button" variant="outline" onClick={onCancelCompose}>
              Cancelar
            </PanelButton>
          </div>
        </form>
      ) : null}

      {confirmUnassign && canEdit ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm">
          <p className="min-w-0 flex-1 text-muted">
            Tirar da equipe? O cargo não recoloca sozinho.
          </p>
          <PanelButton type="button" disabled={unassigning} onClick={onUnassign}>
            {unassigning ? '…' : 'Tirar'}
          </PanelButton>
          <PanelButton
            type="button"
            variant="outline"
            disabled={unassigning}
            onClick={() => setConfirmUnassign(false)}
          >
            Cancelar
          </PanelButton>
        </div>
      ) : null}
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

function TeamNetworkPersonRow({
  person,
  hint,
  strong,
  canEdit,
  busy,
  onUnassign,
}: {
  person: TeamNetworkPerson
  hint?: string
  strong?: boolean
  canEdit: boolean
  busy: boolean
  onUnassign: (employeeId: string, name: string) => void
}) {
  return (
    <li className="flex items-center justify-between gap-2 text-sm">
      <span>
        <span className={strong ? 'font-medium' : undefined}>{person.name}</span>
        {hint ? <span className="ml-1 text-xs text-muted">{hint}</span> : null}
      </span>
      {canEdit ? (
        <button
          type="button"
          className="shrink-0 text-xs text-muted underline"
          disabled={busy}
          onClick={() => onUnassign(person.employee_id, person.name)}
        >
          {busy ? '…' : 'tirar'}
        </button>
      ) : null}
    </li>
  )
}

function TeamNetworkMap({
  teams,
  canEdit,
  busyUnassignId,
  onUnassign,
}: {
  teams: TeamNetworkRow[]
  canEdit: boolean
  busyUnassignId: string | null
  onUnassign: (employeeId: string, name: string) => void
}) {
  if (teams.every((t) => t.total === 0)) {
    return (
      <p className="text-sm text-muted">
        Rede vazia. Confira se Ops Fin, Gestor, RH e as equipes deles (recepção, estoque, func
        fin, equipe RH…) têm o cargo certo na Intranet.
      </p>
    )
  }

  return (
    <ul className="grid gap-3 md:grid-cols-3">
      {teams.map((t) => (
        <li key={t.id} className="rounded-2xl border border-border bg-background px-3 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t.label}</p>
          {t.cargos.map((slot) => (
            <div key={slot.id} className="mt-3">
              <p className="text-xs text-muted">
                {slot.is_lead ? 'Responsável · ' : ''}
                {slot.label}
              </p>
              {slot.people.length === 0 ? (
                <p
                  className={`mt-0.5 text-sm ${
                    slot.is_lead ? 'text-danger/80' : 'text-muted'
                  }`}
                >
                  {slot.is_lead
                    ? 'Sem lead — ajuste o cargo ou use o formulário abaixo'
                    : 'Ninguém vinculado ainda'}
                </p>
              ) : (
                <ul className="mt-0.5 space-y-0.5">
                  {slot.people.map((person) => (
                    <TeamNetworkPersonRow
                      key={person.employee_id}
                      person={person}
                      strong={slot.is_lead}
                      hint={
                        !slot.is_lead && person.total_tasks === 0 ? '· sem check' : undefined
                      }
                      canEdit={canEdit}
                      busy={busyUnassignId === person.employee_id}
                      onUnassign={onUnassign}
                    />
                  ))}
                </ul>
              )}
            </div>
          ))}
        </li>
      ))}
    </ul>
  )
}
