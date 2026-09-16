import { NextRequest } from 'next/server'
import { err, ok } from '@/lib/api-response'
import { updateEmployeeAccess } from '@/lib/employees'
import { requireFlowMaster } from '@/lib/flow/require-master'
import { parseAreas, parseRole } from '@/lib/flow/workflow'

export async function PATCH(req: NextRequest) {
  const auth = await requireFlowMaster(req)
  if (!auth.ok) return err(auth.message, auth.status)
  const body = await req.json().catch(() => null)
  const userId = typeof body?.userId === 'string' ? body.userId : ''
  if (!userId) return err('Informe o usuário', 400)
  try {
    const employee = await updateEmployeeAccess(
      auth.flowUser,
      userId,
      parseRole(body.role),
      Array.isArray(body.companyIds) ? body.companyIds.map(String) : [],
      parseAreas(body.areaIds),
    )
    return ok({ employee })
  } catch (error) {
    return err(error instanceof Error ? error.message : 'Falha ao atualizar o acesso', 400)
  }
}
