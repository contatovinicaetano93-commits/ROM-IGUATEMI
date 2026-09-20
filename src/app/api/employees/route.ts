import { NextRequest } from 'next/server'
import { err, ok } from '@/lib/api-response'
import { requireSession } from '@/lib/auth'
import { createEmployee, listEmployees } from '@/lib/employees'
import { ensureFlowCatalog } from '@/lib/flow/store'
import { requireFlowMaster } from '@/lib/flow/require-master'
import { announceEmployeeCreated } from '@/lib/intranet/employee-created'
import { parseGrantableModules } from '@/lib/intranet/modules'
import { parseAreas, parseRole } from '@/lib/flow/workflow'
import { Logger } from '@/lib/logger'

const logger = new Logger('EmployeesApi')

export async function GET(req: NextRequest) {
  const auth = await requireSession(req)
  if (!auth.ok) return err(auth.message, auth.status)
  try {
    const employees = await listEmployees()
    return ok({ employees })
  } catch (error) {
    return err(error instanceof Error ? error.message : 'Falha ao listar pessoas', 500)
  }
}

export async function POST(req: NextRequest) {
  const session = await requireSession(req)
  if (!session.ok) return err(session.message, session.status)
  const isPanelAdmin = session.session.role === 'admin'
  const auth = isPanelAdmin ? session : await requireFlowMaster(req)
  if (!auth.ok) return err(auth.message, auth.status)
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return err('Dados inválidos', 400)
  const email = typeof body.email === 'string' ? body.email : ''
  const name = typeof body.name === 'string' ? body.name : ''
  const password = typeof body.password === 'string' ? body.password : ''
  if (!email || !name || !password) return err('Nome, e-mail e senha são obrigatórios', 400)
  try {
    await ensureFlowCatalog()
    const requestedPanelRole =
      body.panel_role === 'admin' ||
      body.panel_role === 'staff' ||
      body.panel_role === 'financeiro' ||
      body.panel_role === 'estoque' ||
      body.panel_role === 'mkt'
        ? body.panel_role
        : 'staff'
    const employee = await createEmployee({
      email,
      name,
      password,
      panel_role: isPanelAdmin ? requestedPanelRole : 'staff',
      flow_role: parseRole(body.flow_role ?? 'solicitante'),
      can_publish: isPanelAdmin ? Boolean(body.can_publish) : false,
      professional_name:
        isPanelAdmin && typeof body.professional_name === 'string' ? body.professional_name : null,
      companyIds: Array.isArray(body.companyIds) ? body.companyIds.map(String) : undefined,
      areaIds: parseAreas(body.areaIds),
      modules: isPanelAdmin ? parseGrantableModules(body.modules) : [],
    })
    try {
      await announceEmployeeCreated({
        actor: { email: auth.session.user, role: auth.session.role },
        employee,
      })
    } catch (announceError) {
      logger.warn('Falha ao anunciar criação de colaborador', {
        employeeId: employee.id,
        error: announceError instanceof Error ? announceError.message : String(announceError),
      })
    }
    return ok({ employee }, undefined, 201)
  } catch (error) {
    return err(error instanceof Error ? error.message : 'Falha ao criar colaborador', 400)
  }
}
