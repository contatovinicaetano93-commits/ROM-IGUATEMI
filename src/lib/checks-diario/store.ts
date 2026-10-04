import 'server-only'

import { getIntranetSql } from '@/lib/db'
import type {
  ChecksDiarioLog,
  ChecksDiarioTask,
  ChecksTeamId,
} from '@/lib/checks-diario/types'
import { ensureGrantableModuleKeyCheck } from '@/lib/intranet/ensure-module-key-check'

function todayIsoSaoPaulo(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

let tableReady: Promise<void> | null = null

export async function ensureChecksDiarioTables() {
  if (!tableReady) {
    tableReady = (async () => {
      // Checks FK → intranet_employees; usa o mesmo banco da intranet.
      const sql = getIntranetSql()
      await ensureGrantableModuleKeyCheck(sql)
      await sql`
        create table if not exists checks_diario_members (
          employee_id uuid primary key references intranet_employees (id) on delete cascade,
          team text not null check (team in ('ops_fin', 'gestor_unidade', 'rh')),
          is_lead boolean not null default false,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now()
        )
      `
      await sql`
        create index if not exists checks_diario_members_team_idx
          on checks_diario_members (team)
      `
      await sql`
        create table if not exists checks_diario_tasks (
          id uuid primary key default gen_random_uuid(),
          employee_id uuid not null references intranet_employees (id) on delete cascade,
          title text not null,
          description text,
          sort_order int not null default 0,
          requires_photo boolean not null default false,
          active boolean not null default true,
          created_by_employee_id uuid references intranet_employees (id) on delete set null,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now()
        )
      `
      await sql`
        create index if not exists checks_diario_tasks_employee_idx
          on checks_diario_tasks (employee_id, active, sort_order)
      `
      await sql`
        create table if not exists checks_diario_logs (
          id uuid primary key default gen_random_uuid(),
          task_id uuid not null references checks_diario_tasks (id) on delete cascade,
          employee_id uuid not null references intranet_employees (id) on delete cascade,
          day date not null,
          completed_at timestamptz not null default now(),
          note text,
          photo_url text,
          photo_captured_at timestamptz,
          created_at timestamptz not null default now()
        )
      `
      await sql`
        create index if not exists checks_diario_logs_day_idx
          on checks_diario_logs (day, employee_id)
      `
      await sql`
        create index if not exists checks_diario_logs_task_day_idx
          on checks_diario_logs (task_id, day)
      `
    })().catch((err) => {
      tableReady = null
      throw err
    })
  }
  await tableReady
}

function dayFromRow(raw: unknown): string {
  if (typeof raw === 'string') return raw.slice(0, 10)
  if (raw instanceof Date) return raw.toISOString().slice(0, 10)
  return String(raw ?? '').slice(0, 10)
}

function isoFromRow(raw: unknown): string {
  if (raw instanceof Date) return raw.toISOString()
  if (typeof raw === 'string') return new Date(raw).toISOString()
  return new Date().toISOString()
}

export async function getChecksMembership(
  employeeId: string,
): Promise<{ team: ChecksTeamId; is_lead: boolean } | null> {
  await ensureChecksDiarioTables()
  const sql = getIntranetSql()
  const rows = await sql`
    select team, is_lead from checks_diario_members where employee_id = ${employeeId} limit 1
  `
  const row = rows[0] as { team: ChecksTeamId; is_lead: boolean } | undefined
  if (!row) return null
  return { team: row.team, is_lead: Boolean(row.is_lead) }
}

/** Concede módulo checks_diario; nunca derruba o fluxo se o CHECK ainda estiver velho. */
async function grantChecksDiarioModule(employeeId: string): Promise<void> {
  const sql = getIntranetSql()
  await ensureGrantableModuleKeyCheck(sql)
  await sql`
    insert into intranet_employee_modules (employee_id, module_key)
    values (${employeeId}::uuid, 'checks_diario')
    on conflict do nothing
  `
}

export async function upsertChecksMembership(args: {
  employeeId: string
  team: ChecksTeamId
  isLead: boolean
}) {
  await ensureChecksDiarioTables()
  const sql = getIntranetSql()
  await sql`
    insert into checks_diario_members (employee_id, team, is_lead, updated_at)
    values (${args.employeeId}, ${args.team}, ${args.isLead}, now())
    on conflict (employee_id) do update set
      team = excluded.team,
      is_lead = excluded.is_lead,
      updated_at = now()
  `
  // Módulo é best-effort: membership já basta pro board; sessão precisa re-login.
  try {
    await grantChecksDiarioModule(args.employeeId)
  } catch {
    // CHECK antigo / corrida — ensure acima costuma corrigir no próximo request.
  }
}

export async function listChecksMembers(team?: ChecksTeamId | null) {
  await ensureChecksDiarioTables()
  const sql = getIntranetSql()
  if (team) {
    return (await sql`
      select m.employee_id, m.team, m.is_lead, e.name, e.email, e.status
      from checks_diario_members m
      join intranet_employees e on e.id = m.employee_id
      where m.team = ${team} and e.status = 'active'
      order by m.is_lead desc, e.name asc
    `) as Array<{
      employee_id: string
      team: ChecksTeamId
      is_lead: boolean
      name: string
      email: string
      status: string
    }>
  }
  return (await sql`
    select m.employee_id, m.team, m.is_lead, e.name, e.email, e.status
    from checks_diario_members m
    join intranet_employees e on e.id = m.employee_id
    where e.status = 'active'
    order by m.team, m.is_lead desc, e.name asc
  `) as Array<{
    employee_id: string
    team: ChecksTeamId
    is_lead: boolean
    name: string
    email: string
    status: string
  }>
}

export async function listActiveEmployeesLite() {
  const sql = getIntranetSql()
  return (await sql`
    select id, name, email, panel_role, flow_role
    from intranet_employees
    where status = 'active'
    order by name asc
  `) as Array<{
    id: string
    name: string
    email: string
    panel_role: string
    flow_role: string
  }>
}

function mapTask(row: Record<string, unknown>): ChecksDiarioTask {
  return {
    id: String(row.id),
    employee_id: String(row.employee_id),
    title: String(row.title),
    description: row.description != null ? String(row.description) : null,
    sort_order: Number(row.sort_order ?? 0),
    requires_photo: Boolean(row.requires_photo),
    active: Boolean(row.active),
  }
}

function mapLog(row: Record<string, unknown>): ChecksDiarioLog {
  return {
    id: String(row.id),
    task_id: String(row.task_id),
    employee_id: String(row.employee_id),
    day: dayFromRow(row.day),
    completed_at: isoFromRow(row.completed_at),
    note: row.note != null ? String(row.note) : null,
    photo_url: row.photo_url != null ? String(row.photo_url) : null,
    photo_captured_at:
      row.photo_captured_at != null ? isoFromRow(row.photo_captured_at) : null,
  }
}

export async function listTasksForEmployees(employeeIds: string[]) {
  await ensureChecksDiarioTables()
  if (employeeIds.length === 0) return [] as ChecksDiarioTask[]
  const sql = getIntranetSql()
  const rows = await sql`
    select * from checks_diario_tasks
    where employee_id in ${sql(employeeIds)} and active = true
    order by sort_order asc, created_at asc
  `
  return (rows as Record<string, unknown>[]).map(mapTask)
}

export async function listLogsForDay(employeeIds: string[], day: string) {
  await ensureChecksDiarioTables()
  if (employeeIds.length === 0) return [] as ChecksDiarioLog[]
  const sql = getIntranetSql()
  const rows = await sql`
    select * from checks_diario_logs
    where employee_id in ${sql(employeeIds)} and day = ${day}::date
    order by completed_at asc
  `
  return (rows as Record<string, unknown>[]).map(mapLog)
}

export async function createChecksTask(args: {
  employeeId: string
  title: string
  description?: string | null
  sortOrder?: number
  requiresPhoto?: boolean
  createdByEmployeeId?: string | null
}) {
  await ensureChecksDiarioTables()
  const sql = getIntranetSql()
  const title = args.title.trim()
  if (!title) throw new Error('Título obrigatório')
  const rows = await sql`
    insert into checks_diario_tasks (
      employee_id, title, description, sort_order, requires_photo, created_by_employee_id
    ) values (
      ${args.employeeId},
      ${title},
      ${args.description?.trim() || null},
      ${args.sortOrder ?? 0},
      ${args.requiresPhoto === true},
      ${args.createdByEmployeeId ?? null}
    )
    returning *
  `
  return mapTask(rows[0] as Record<string, unknown>)
}

export async function updateChecksTask(args: {
  taskId: string
  title?: string
  description?: string | null
  sortOrder?: number
  requiresPhoto?: boolean
  active?: boolean
}) {
  await ensureChecksDiarioTables()
  const sql = getIntranetSql()
  const current = await sql`select * from checks_diario_tasks where id = ${args.taskId} limit 1`
  if (!current[0]) throw new Error('Tarefa não encontrada')
  const cur = current[0] as Record<string, unknown>
  const rows = await sql`
    update checks_diario_tasks set
      title = ${args.title?.trim() || String(cur.title)},
      description = ${
        args.description !== undefined
          ? args.description?.trim() || null
          : (cur.description as string | null)
      },
      sort_order = ${args.sortOrder ?? Number(cur.sort_order ?? 0)},
      requires_photo = ${
        args.requiresPhoto !== undefined
          ? args.requiresPhoto
          : Boolean(cur.requires_photo)
      },
      active = ${args.active !== undefined ? args.active : Boolean(cur.active)},
      updated_at = now()
    where id = ${args.taskId}
    returning *
  `
  return mapTask(rows[0] as Record<string, unknown>)
}

export async function getChecksTask(taskId: string) {
  await ensureChecksDiarioTables()
  const sql = getIntranetSql()
  const rows = await sql`select * from checks_diario_tasks where id = ${taskId} limit 1`
  if (!rows[0]) return null
  return mapTask(rows[0] as Record<string, unknown>)
}

/** Foto ao vivo: captured_at deve estar perto de agora (±3 min). */
export function assertLivePhotoCapture(capturedAtIso: string | null | undefined) {
  if (!capturedAtIso) throw new Error('Foto ao vivo obrigatória — tire a foto agora')
  const captured = Date.parse(capturedAtIso)
  if (!Number.isFinite(captured)) throw new Error('Timestamp da foto inválido')
  const driftMs = Math.abs(Date.now() - captured)
  if (driftMs > 3 * 60 * 1000) {
    throw new Error('Foto antiga rejeitada — tire a foto no momento do check')
  }
}

export async function createChecksLog(args: {
  taskId: string
  employeeId: string
  note?: string | null
  photoUrl?: string | null
  photoCapturedAt?: string | null
  day?: string
}) {
  await ensureChecksDiarioTables()
  const task = await getChecksTask(args.taskId)
  if (!task || !task.active) throw new Error('Tarefa não encontrada')
  if (task.employee_id !== args.employeeId) {
    throw new Error('Esta tarefa não é sua')
  }
  if (task.requires_photo) {
    assertLivePhotoCapture(args.photoCapturedAt)
    if (!args.photoUrl?.trim()) throw new Error('Foto obrigatória neste check')
  }
  const day = args.day ?? todayIsoSaoPaulo()
  const sql = getIntranetSql()
  const rows = await sql`
    insert into checks_diario_logs (
      task_id, employee_id, day, note, photo_url, photo_captured_at
    ) values (
      ${args.taskId},
      ${args.employeeId},
      ${day}::date,
      ${args.note?.trim() || null},
      ${args.photoUrl?.trim() || null},
      ${args.photoCapturedAt ?? null}
    )
    returning *
  `
  return mapLog(rows[0] as Record<string, unknown>)
}

export { todayIsoSaoPaulo as checksToday }
