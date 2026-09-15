import { NextRequest } from 'next/server'
import { err, ok } from '@/lib/api-response'
import { requireAdmin, requireSession } from '@/lib/auth'
import { createEmployee, listEmployees } from '@/lib/employees'
import { ensureFlowCatalog } from '@/lib/flow/store'
import { parseAreas, parseRole } from '@/lib/flow/workflow'

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
  const auth = await requireAdmin(req)
  if (!auth.ok) return err(auth.message, auth.status)
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return err('Dados inválidos', 400)
  const email = typeof body.email === 'string' ? body.email : ''
  const name = typeof body.name === 'string' ? body.name : ''
  const password = typeof body.password === 'string' ? body.password : ''
  if (!email || !name || !password) return err('Nome, e-mail e senha são obrigatórios', 400)
  try {
    await ensureFlowCatalog()
    const employee = await createEmployee({
      email,
      name,
      password,
      panel_role:
        body.panel_role === 'admin' ||
        body.panel_role === 'staff' ||
        body.panel_role === 'financeiro' ||
        body.panel_role === 'estoque' ||
        body.panel_role === 'mkt'
          ? body.panel_role
          : 'staff',
      flow_role: parseRole(body.flow_role ?? 'solicitante'),
      can_publish: Boolean(body.can_publish),
      companyIds: Array.isArray(body.companyIds) ? body.companyIds.map(String) : undefined,
      areaIds: parseAreas(body.areaIds),
    })
    return ok({ employee }, undefined, 201)
  } catch (error) {
    return err(error instanceof Error ? error.message : 'Falha ao criar colaborador', 400)
  }
}
