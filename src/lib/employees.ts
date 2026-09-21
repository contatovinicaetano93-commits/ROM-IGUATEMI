import 'server-only'

import { getIntranetSql } from '@/lib/db'
import type { AuthRole } from '@/lib/auth'
import type { FlowRole, RequestArea, User } from '@/lib/flow/types'
import { defaultAreasForRole, parseAreas, parseRole } from '@/lib/flow/workflow'
import { AuditLogger } from '@/lib/audit'
import { hashPassword, MIN_EMPLOYEE_PASSWORD } from '@/lib/intranet/password'
import { companiesForPanel } from '@/lib/intranet/companies'
import { ensureIntranetSchema } from '@/lib/intranet/ensure-schema'
import { extrasBeyondRole, parseGrantableModules, type GrantableModuleKey } from '@/lib/intranet/modules'
import { getRomPanelId } from '@/lib/brand'

export type EmployeeRecord = {
  id: string
  email: string
  name: string
  password_hash: string
  panel_role: AuthRole
  flow_role: FlowRole
  status: 'active' | 'inactive'
  can_publish: boolean
  /** Nome como aparece no Avec 0021 — usado em Meu faturamento. */
  professional_name: string | null
  companyIds: string[]
  areaIds: RequestArea[]
  modules: GrantableModuleKey[]
  created_at: string
}

function isMissingRelation(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error)
  return /intranet_employees|intranet_employee_modules|does not exist|relation|DATABASE_URL não configurada/i.test(msg)
}

function parsePanelRole(value: unknown): AuthRole {
  if (
    value === 'admin' ||
    value === 'staff' ||
    value === 'financeiro' ||
    value === 'estoque' ||
    value === 'mkt'
  ) {
    return value
  }
  return 'staff'
}

export async function findEmployeeByEmail(email: string): Promise<EmployeeRecord | null> {
  try {
    const sql = getIntranetSql()
    const rows = (await sql`
      select e.*,
        coalesce((select array_agg(company_id) from intranet_employee_companies c where c.employee_id = e.id), '{}') as company_ids,
        coalesce((select array_agg(area) from intranet_employee_areas a where a.employee_id = e.id), '{}') as area_ids,
        coalesce((select array_agg(module_key) from intranet_employee_modules m where m.employee_id = e.id), '{}') as module_keys
      from intranet_employees e
      where lower(e.email) = ${email.trim().toLowerCase()}
      limit 1
    `) as Array<Record<string, unknown>>
    const row = rows[0]
    if (!row) return null
    return mapEmployee(row)
  } catch (error) {
    if (isMissingRelation(error)) return null
    throw error
  }
}

export async function listEmployees(): Promise<Omit<EmployeeRecord, 'password_hash'>[]> {
  try {
    await ensureIntranetSchema()
    const sql = getIntranetSql()
    const rows = (await sql`
      select e.id, e.email, e.name, e.panel_role, e.flow_role, e.status, e.can_publish, e.professional_name, e.created_at,
        coalesce((select array_agg(company_id) from intranet_employee_companies c where c.employee_id = e.id), '{}') as company_ids,
        coalesce((select array_agg(area) from intranet_employee_areas a where a.employee_id = e.id), '{}') as area_ids,
        coalesce((select array_agg(module_key) from intranet_employee_modules m where m.employee_id = e.id), '{}') as module_keys
      from intranet_employees e
      order by e.name
    `) as Array<Record<string, unknown>>
    return rows.map((row) => {
      const mapped = mapEmployee({ ...row, password_hash: '' })
      const { password_hash: _passwordHash, ...rest } = mapped
      return rest
    })
  } catch (error) {
    if (isMissingRelation(error)) return []
    throw error
  }
}

export async function createEmployee(input: {
  email: string
  name: string
  password: string
  panel_role: AuthRole
  flow_role: FlowRole
  can_publish?: boolean
  professional_name?: string | null
  companyIds?: string[]
  areaIds?: RequestArea[]
  modules?: GrantableModuleKey[]
}): Promise<Omit<EmployeeRecord, 'password_hash'>> {
  if (input.password.trim().length < MIN_EMPLOYEE_PASSWORD) {
    throw new Error(`A senha deve ter no mínimo ${MIN_EMPLOYEE_PASSWORD} caracteres.`)
  }
  const panel = getRomPanelId()
  const allowed = new Set(companiesForPanel(panel).map((c) => c.id))
  const companyIds = (input.companyIds ?? [...allowed]).filter((id) => allowed.has(id))
  if (companyIds.length === 0) throw new Error('Selecione ao menos uma empresa da unidade.')
  const areaIds = parseAreas(input.areaIds ?? [])
  const flowRole = parseRole(input.flow_role)
  await ensureIntranetSchema()
  const sql = getIntranetSql()
  const passwordHash = await hashPassword(input.password)
  const canPublish = Boolean(input.can_publish) || input.panel_role === 'admin' || input.panel_role === 'mkt'
  const professionalName =
    typeof input.professional_name === 'string' && input.professional_name.trim()
      ? input.professional_name.trim()
      : null
  const rows = (await sql`
    insert into intranet_employees (email, name, password_hash, panel_role, flow_role, can_publish, professional_name)
    values (
      ${input.email.trim().toLowerCase()},
      ${input.name.trim()},
      ${passwordHash},
      ${input.panel_role},
      ${flowRole},
      ${canPublish},
      ${professionalName}
    )
    returning *
  `) as Array<Record<string, unknown>>
  const created = rows[0]
  if (!created) throw new Error('Falha ao criar colaborador.')
  const id = String(created.id)
  for (const companyId of companyIds) {
    await sql`
      insert into intranet_employee_companies (employee_id, company_id)
      values (${id}::uuid, ${companyId})
      on conflict do nothing
    `
  }
  const areas = areaIds.length > 0 ? areaIds : flowRole === 'master' ? ['financeiro', 'manutencao', 'compras', 'rh'] : areaIds
  for (const area of areas) {
    await sql`
      insert into intranet_employee_areas (employee_id, area)
      values (${id}::uuid, ${area})
      on conflict do nothing
    `
  }
  const modules = extrasBeyondRole(input.panel_role, parseGrantableModules(input.modules))
  await replaceEmployeeModules(id, modules)
  const mapped = mapEmployee({
    ...created,
    company_ids: companyIds,
    area_ids: areas,
    module_keys: modules,
  })
  const { password_hash: _passwordHash, ...rest } = mapped
  return rest
}

export function employeeToFlowUser(person: Omit<EmployeeRecord, 'password_hash'>): User {
  return {
    id: person.id,
    name: person.name,
    email: person.email,
    role: person.flow_role,
    status: person.status,
    companyIds: person.companyIds,
    areaIds: person.areaIds,
    created: person.created_at,
  }
}

function isEmployeeId(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
}

export async function findEmployeeById(id: string): Promise<EmployeeRecord | null> {
  if (!isEmployeeId(id)) return null
  try {
    const sql = getIntranetSql()
    const rows = (await sql`
      select e.*,
        coalesce((select array_agg(company_id) from intranet_employee_companies c where c.employee_id = e.id), '{}') as company_ids,
        coalesce((select array_agg(area) from intranet_employee_areas a where a.employee_id = e.id), '{}') as area_ids,
        coalesce((select array_agg(module_key) from intranet_employee_modules m where m.employee_id = e.id), '{}') as module_keys
      from intranet_employees e
      where e.id = ${id}::uuid
      limit 1
    `) as Array<Record<string, unknown>>
    const row = rows[0]
    if (!row) return null
    return mapEmployee(row)
  } catch (error) {
    if (isMissingRelation(error)) return null
    throw error
  }
}

async function replaceEmployeeCompanies(id: string, companyIds: string[]): Promise<void> {
  const sql = getIntranetSql()
  await sql`delete from intranet_employee_companies where employee_id = ${id}::uuid`
  for (const companyId of companyIds) {
    await sql`
      insert into intranet_employee_companies (employee_id, company_id)
      values (${id}::uuid, ${companyId})
      on conflict do nothing
    `
  }
}

async function replaceEmployeeAreas(id: string, areaIds: RequestArea[]): Promise<void> {
  const sql = getIntranetSql()
  await sql`delete from intranet_employee_areas where employee_id = ${id}::uuid`
  for (const area of areaIds) {
    await sql`
      insert into intranet_employee_areas (employee_id, area)
      values (${id}::uuid, ${area})
      on conflict do nothing
    `
  }
}

async function replaceEmployeeModules(id: string, modules: GrantableModuleKey[]): Promise<void> {
  await ensureIntranetSchema()
  const sql = getIntranetSql()
  await sql`delete from intranet_employee_modules where employee_id = ${id}::uuid`
  for (const key of modules) {
    await sql`
      insert into intranet_employee_modules (employee_id, module_key)
      values (${id}::uuid, ${key})
      on conflict do nothing
    `
  }
}

async function countActiveMasters(): Promise<number> {
  const people = await listEmployees()
  return people.filter((person) => person.flow_role === 'master' && person.status === 'active').length
}

export async function updateEmployeeAccess(
  actor: User,
  userId: string,
  role: FlowRole,
  companyIds: string[],
  areaIds: RequestArea[],
): Promise<Omit<EmployeeRecord, 'password_hash'>> {
  if (actor.role !== 'master') {
    throw new Error('Apenas o master pode editar acessos.')
  }
  const current = await findEmployeeById(userId)
  if (!current) throw new Error('Usuário não encontrado.')
  const resolvedRole = parseRole(role)
  const panel = getRomPanelId()
  const allowed = new Set(companiesForPanel(panel).map((item) => item.id))
  const resolvedCompanies = companyIds.filter((id) => allowed.has(id))
  if (resolvedCompanies.length === 0) throw new Error('Selecione ao menos uma empresa da unidade.')
  const resolvedAreas = defaultAreasForRole(resolvedRole, areaIds)
  if (actor.id === userId && resolvedRole !== 'master') {
    throw new Error('Você não pode remover o próprio perfil de master.')
  }
  if (current.flow_role === 'master' && resolvedRole !== 'master') {
    const masters = await countActiveMasters()
    if (masters <= 1) throw new Error('É preciso manter ao menos um master.')
  }
  const sql = getIntranetSql()
  await sql`
    update intranet_employees
    set flow_role = ${resolvedRole}, updated_at = now()
    where id = ${userId}::uuid
  `
  await replaceEmployeeCompanies(userId, resolvedCompanies)
  await replaceEmployeeAreas(userId, resolvedAreas)
  await AuditLogger.log(actor.email, actor.role, 'UPDATE_USER', `flow:user:${userId}`, {
    from: current.flow_role,
    to: resolvedRole,
    companies: resolvedCompanies,
    areas: resolvedAreas,
  })
  const updated = await findEmployeeById(userId)
  if (!updated) throw new Error('Usuário não encontrado.')
  const { password_hash: _passwordHash, ...rest } = updated
  return rest
}

export async function updateEmployeeModules(
  actorEmail: string,
  actorRole: AuthRole,
  userId: string,
  selected: readonly GrantableModuleKey[],
  professionalName?: string | null,
): Promise<Omit<EmployeeRecord, 'password_hash'>> {
  const current = await findEmployeeById(userId)
  if (!current) throw new Error('Usuário não encontrado.')
  const extras = extrasBeyondRole(current.panel_role, parseGrantableModules(selected))
  await replaceEmployeeModules(userId, extras)
  if (professionalName !== undefined) {
    await ensureIntranetSchema()
    const sql = getIntranetSql()
    const nextName =
      typeof professionalName === 'string' && professionalName.trim() ? professionalName.trim() : null
    await sql`
      update intranet_employees
      set professional_name = ${nextName}, updated_at = now()
      where id = ${userId}::uuid
    `
  }
  await AuditLogger.log(actorEmail, actorRole, 'UPDATE_USER', `intranet:modules:${userId}`, {
    from: current.modules,
    to: extras,
    professional_name: professionalName === undefined ? undefined : professionalName,
  })
  const updated = await findEmployeeById(userId)
  if (!updated) throw new Error('Usuário não encontrado.')
  const { password_hash: _passwordHash, ...rest } = updated
  return rest
}

export async function toggleEmployeeStatus(actor: User, userId: string): Promise<void> {
  if (actor.id === userId) {
    throw new Error('Você não pode desativar o próprio acesso.')
  }
  const current = await findEmployeeById(userId)
  if (!current) throw new Error('Usuário não encontrado.')
  const next = current.status === 'active' ? 'inactive' : 'active'
  const sql = getIntranetSql()
  await sql`
    update intranet_employees
    set status = ${next}, updated_at = now()
    where id = ${userId}::uuid
  `
}

export async function revokeEmployeeAccess(actor: User, userId: string): Promise<void> {
  if (actor.role !== 'master') {
    throw new Error('Apenas o master pode excluir acessos.')
  }
  if (actor.id === userId) {
    throw new Error('Você não pode excluir o próprio acesso.')
  }
  const current = await findEmployeeById(userId)
  if (!current) throw new Error('Usuário não encontrado.')
  if (current.flow_role === 'master' && current.status === 'active') {
    const others = (await listEmployees()).filter(
      (person) => person.id !== userId && person.flow_role === 'master' && person.status === 'active',
    )
    if (others.length === 0) throw new Error('É preciso manter ao menos um master ativo.')
  }
  const sql = getIntranetSql()
  await sql`
    update intranet_employees
    set status = 'inactive', updated_at = now()
    where id = ${userId}::uuid
  `
  await AuditLogger.log(actor.email, actor.role, 'REVOKE_USER', `flow:user:${userId}`, {
    from: current.status,
    to: 'inactive',
  })
}

function mapEmployee(row: Record<string, unknown>): EmployeeRecord {
  const companyIds = Array.isArray(row.company_ids)
    ? row.company_ids.map(String)
    : typeof row.company_ids === 'string'
      ? row.company_ids.replace(/[{}]/g, '').split(',').filter(Boolean)
      : []
  const areaIds = parseAreas(
    Array.isArray(row.area_ids)
      ? row.area_ids
      : typeof row.area_ids === 'string'
        ? row.area_ids.replace(/[{}]/g, '').split(',').filter(Boolean)
        : [],
  )
  return {
    id: String(row.id),
    email: String(row.email),
    name: String(row.name),
    password_hash: String(row.password_hash ?? ''),
    panel_role: parsePanelRole(row.panel_role),
    flow_role: parseRole(row.flow_role),
    status: row.status === 'inactive' ? 'inactive' : 'active',
    can_publish: Boolean(row.can_publish),
    professional_name:
      typeof row.professional_name === 'string' && row.professional_name.trim()
        ? row.professional_name.trim()
        : null,
    companyIds,
    areaIds,
    modules: parseGrantableModules(row.module_keys),
    created_at: String(row.created_at ?? ''),
  }
}
