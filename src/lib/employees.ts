import 'server-only'

import { getSql } from '@/lib/db'
import type { AuthRole } from '@/lib/auth'
import type { FlowRole, RequestArea } from '@/lib/flow/types'
import { parseAreas, parseRole } from '@/lib/flow/workflow'
import { hashPassword, MIN_EMPLOYEE_PASSWORD } from '@/lib/intranet/password'
import { companiesForPanel } from '@/lib/intranet/companies'
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
  companyIds: string[]
  areaIds: RequestArea[]
}

function isMissingRelation(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error)
  return /intranet_employees|does not exist|relation|DATABASE_URL não configurada/i.test(msg)
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
    const sql = getSql()
    const rows = (await sql`
      select e.*,
        coalesce((select array_agg(company_id) from intranet_employee_companies c where c.employee_id = e.id), '{}') as company_ids,
        coalesce((select array_agg(area) from intranet_employee_areas a where a.employee_id = e.id), '{}') as area_ids
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
    const sql = getSql()
    const rows = (await sql`
      select e.id, e.email, e.name, e.panel_role, e.flow_role, e.status, e.can_publish,
        coalesce((select array_agg(company_id) from intranet_employee_companies c where c.employee_id = e.id), '{}') as company_ids,
        coalesce((select array_agg(area) from intranet_employee_areas a where a.employee_id = e.id), '{}') as area_ids
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
  companyIds?: string[]
  areaIds?: RequestArea[]
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
  const sql = getSql()
  const passwordHash = await hashPassword(input.password)
  const canPublish = Boolean(input.can_publish) || input.panel_role === 'admin' || input.panel_role === 'mkt'
  const rows = (await sql`
    insert into intranet_employees (email, name, password_hash, panel_role, flow_role, can_publish)
    values (
      ${input.email.trim().toLowerCase()},
      ${input.name.trim()},
      ${passwordHash},
      ${input.panel_role},
      ${flowRole},
      ${canPublish}
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
  const mapped = mapEmployee({
    ...created,
    company_ids: companyIds,
    area_ids: areas,
  })
  const { password_hash: _passwordHash, ...rest } = mapped
  return rest
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
    companyIds,
    areaIds,
  }
}
