import 'server-only'

import type { AuthSession } from '@/lib/auth'
import {
  resolveChecksAccess,
  checksTeamFromCargoPackage,
} from '@/lib/checks-diario/access'
import {
  checksToday,
  createChecksLog,
  createChecksTask,
  getChecksMembership,
  getChecksTask,
  listActiveEmployeesLite,
  listChecksMembers,
  listLogsForDay,
  listTasksForEmployees,
  updateChecksTask,
  upsertChecksMembership,
} from '@/lib/checks-diario/store'
import type {
  ChecksDiarioBoard,
  ChecksDiarioPersonBoard,
  ChecksTeamId,
} from '@/lib/checks-diario/types'
import { findEmployeeById, listEmployees } from '@/lib/employees'
import { matchCargoPackage } from '@/lib/intranet/cargo-packages'

export async function loadChecksAccess(session: AuthSession) {
  const employee = session.employeeId
    ? await findEmployeeById(session.employeeId)
    : null
  let membership = session.employeeId
    ? await getChecksMembership(session.employeeId)
    : null

  // Auto-vínculo pela cargo package se ainda não estiver na tabela
  if (session.employeeId && employee && !membership) {
    const pack = matchCargoPackage({
      panel_role: employee.panel_role,
      flow_role: employee.flow_role,
      modules: employee.modules,
      areaIds: employee.areaIds,
    })
    const inferred = checksTeamFromCargoPackage(pack?.id)
    if (inferred) {
      try {
        await upsertChecksMembership({
          employeeId: session.employeeId,
          team: inferred.team,
          isLead: inferred.is_lead,
        })
        membership = inferred
      } catch {
        membership = inferred
      }
    }
  }

  return {
    employee,
    membership,
    access: resolveChecksAccess({ session, employee, membership }),
  }
}

/** Upsert memberships from cargo packages so the board isn't empty until manual assign. */
async function syncMembershipsFromCargos() {
  const all = await listEmployees()
  for (const emp of all) {
    if (emp.status !== 'active') continue
    const pack = matchCargoPackage({
      panel_role: emp.panel_role,
      flow_role: emp.flow_role,
      modules: emp.modules,
      areaIds: emp.areaIds,
    })
    const inferred = checksTeamFromCargoPackage(pack?.id)
    if (!inferred) continue
    try {
      const existing = await getChecksMembership(emp.id)
      if (existing) continue
      await upsertChecksMembership({
        employeeId: emp.id,
        team: inferred.team,
        isLead: inferred.is_lead,
      })
    } catch {
      // Uma falha (CHECK/módulo) não pode derrubar o board inteiro.
    }
  }
}

export async function buildChecksBoard(args: {
  session: AuthSession
  day?: string
  team?: ChecksTeamId | 'all'
}): Promise<ChecksDiarioBoard> {
  const day = args.day ?? checksToday()
  const { access, membership } = await loadChecksAccess(args.session)
  if (!access.canView) throw new Error('Sem acesso aos Checks diários')

  const isMasterView = access.isAdminMaster || access.isDono || Boolean(membership?.is_lead)
  const teamFilter: ChecksTeamId | 'all' =
    access.scopedTeam && !access.isAdminMaster && !access.isDono
      ? access.scopedTeam
      : args.team && args.team !== 'all'
        ? args.team
        : 'all'

  let peopleRows: Array<{
    employee_id: string
    name: string
    email: string
    team: ChecksTeamId | null
    is_lead: boolean
  }> = []

  if (isMasterView) {
    await syncMembershipsFromCargos()
    const members = await listChecksMembers(
      teamFilter === 'all' ? null : teamFilter,
    )
    peopleRows = members.map((m) => ({
      employee_id: m.employee_id,
      name: m.name,
      email: m.email,
      team: m.team,
      is_lead: m.is_lead,
    }))
  } else if (args.session.employeeId) {
    const me = await findEmployeeById(args.session.employeeId)
    if (me) {
      peopleRows = [
        {
          employee_id: me.id,
          name: me.name,
          email: me.email,
          team: membership?.team ?? null,
          is_lead: false,
        },
      ]
    }
  }

  const ids = peopleRows.map((p) => p.employee_id)
  const [tasks, logs] = await Promise.all([
    listTasksForEmployees(ids),
    listLogsForDay(ids, day),
  ])

  const people: ChecksDiarioPersonBoard[] = peopleRows.map((p) => {
    const personTasks = tasks
      .filter((t) => t.employee_id === p.employee_id)
      .map((t) => {
        const logsToday = logs.filter((l) => l.task_id === t.id)
        return { ...t, logs_today: logsToday, done_count: logsToday.length }
      })
    const total = personTasks.length
    const done = personTasks.filter((t) => t.done_count > 0).length
    return {
      ...p,
      tasks: personTasks,
      done_tasks: done,
      total_tasks: total,
    }
  })

  let complete = 0
  let partial = 0
  let pending = 0
  for (const p of people) {
    if (p.total_tasks === 0) {
      pending += 1
      continue
    }
    if (p.done_tasks >= p.total_tasks) complete += 1
    else if (p.done_tasks > 0) partial += 1
    else pending += 1
  }

  return {
    day,
    can_edit: access.canEdit,
    is_master_view: isMasterView,
    my_employee_id: args.session.employeeId,
    team_filter: teamFilter,
    people,
    summary: {
      people: people.length,
      complete,
      partial,
      pending,
      logs_today: logs.length,
    },
  }
}

export async function ensureCanEditEmployee(
  session: AuthSession,
  targetEmployeeId: string,
) {
  const { access, membership } = await loadChecksAccess(session)
  if (!access.canEdit) throw new Error('Sem permissão para editar checks')
  if (access.isAdminMaster) return
  if (!membership?.is_lead || !membership.team) {
    throw new Error('Sem permissão para editar checks')
  }
  const target = await getChecksMembership(targetEmployeeId)
  if (!target || target.team !== membership.team) {
    throw new Error('Só pode editar tarefas da sua equipe')
  }
}

export async function assignMemberToTeam(args: {
  session: AuthSession
  employeeId: string
  team: ChecksTeamId
  isLead?: boolean
}) {
  const { access } = await loadChecksAccess(args.session)
  if (!access.canEdit) throw new Error('Sem permissão')
  if (!access.isAdminMaster && access.scopedTeam !== args.team) {
    throw new Error('Só pode gerir sua equipe')
  }
  await upsertChecksMembership({
    employeeId: args.employeeId,
    team: args.team,
    isLead: args.isLead === true,
  })
}

export async function createTaskForEmployee(args: {
  session: AuthSession
  employeeId: string
  title: string
  description?: string | null
  sortOrder?: number
  requiresPhoto?: boolean
}) {
  await ensureCanEditEmployee(args.session, args.employeeId)
  return createChecksTask({
    employeeId: args.employeeId,
    title: args.title,
    description: args.description,
    sortOrder: args.sortOrder,
    requiresPhoto: args.requiresPhoto,
    createdByEmployeeId: args.session.employeeId,
  })
}

export async function patchTaskForEmployee(args: {
  session: AuthSession
  taskId: string
  title?: string
  description?: string | null
  sortOrder?: number
  requiresPhoto?: boolean
  active?: boolean
}) {
  const current = await getChecksTask(args.taskId)
  if (!current) throw new Error('Tarefa não encontrada')
  await ensureCanEditEmployee(args.session, current.employee_id)
  return updateChecksTask({
    taskId: args.taskId,
    title: args.title,
    description: args.description,
    sortOrder: args.sortOrder,
    requiresPhoto: args.requiresPhoto,
    active: args.active,
  })
}

export async function completeMyCheck(args: {
  session: AuthSession
  taskId: string
  note?: string | null
  photoUrl?: string | null
  photoCapturedAt?: string | null
}) {
  if (!args.session.employeeId) throw new Error('Sessão sem colaborador')
  return createChecksLog({
    taskId: args.taskId,
    employeeId: args.session.employeeId,
    note: args.note,
    photoUrl: args.photoUrl,
    photoCapturedAt: args.photoCapturedAt,
  })
}

export async function listAssignableEmployees(session: AuthSession) {
  const { access } = await loadChecksAccess(session)
  if (!access.canEdit && !access.isDono) return []
  const all = await listActiveEmployeesLite()
  if (access.isAdminMaster || access.isDono) return all
  if (!access.scopedTeam) return []
  const members = await listChecksMembers(access.scopedTeam)
  const ids = new Set(members.map((m) => m.employee_id))
  return all.filter((e) => ids.has(e.id))
}

/** Resumo para o card Minhas tarefas na home. */
export async function checksHomeSummary(session: AuthSession): Promise<{
  pending: number
  total: number
  label: string
  href: string
} | null> {
  try {
    const board = await buildChecksBoard({ session })
    const me = board.people.find((p) => p.employee_id === session.employeeId)
    if (!me) {
      if (board.is_master_view) {
        return {
          pending: board.summary.pending + board.summary.partial,
          total: board.summary.people,
          label: `${board.summary.complete}/${board.summary.people} ok hoje`,
          href: '/checks-diario',
        }
      }
      return null
    }
    const pendingTasks = me.tasks.filter((t) => t.done_count === 0).length
    return {
      pending: pendingTasks,
      total: me.total_tasks,
      label:
        me.total_tasks === 0
          ? 'Sem checks hoje'
          : `${me.done_tasks}/${me.total_tasks} checks`,
      href: '/checks-diario',
    }
  } catch {
    return null
  }
}
