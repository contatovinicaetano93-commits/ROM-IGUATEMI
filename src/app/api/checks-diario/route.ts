import { NextRequest } from 'next/server'
import { err, ok } from '@/lib/api-response'
import { requireSession } from '@/lib/auth'
import { hasPanelModule, parseGrantableModules } from '@/lib/intranet/modules'
import {
  assignMemberToTeam,
  buildChecksBoard,
  loadChecksAccess,
  unassignMemberFromTeam,
} from '@/lib/checks-diario/service'
import {
  CHECKS_CARGOS,
  CHECKS_TEAMS,
  parseChecksCargoId,
  type ChecksTeamId,
} from '@/lib/checks-diario/types'

function canUseChecks(session: { role: string; modules?: unknown }): boolean {
  const role = session.role as 'admin' | 'staff' | 'financeiro' | 'estoque' | 'mkt'
  return hasPanelModule(role, parseGrantableModules(session.modules), 'checks_diario')
}

function parseTeam(raw: unknown): ChecksTeamId | 'all' | null {
  if (raw === 'all' || raw == null || raw === '') return 'all'
  if (typeof raw !== 'string') return null
  return CHECKS_TEAMS.some((t) => t.id === raw) ? (raw as ChecksTeamId) : null
}

export async function GET(req: NextRequest) {
  const auth = await requireSession(req)
  if (!auth.ok) return err(auth.message, auth.status)
  if (!canUseChecks(auth.session)) return err('Acesso restrito a Checks diários', 403)

  const url = new URL(req.url)
  const day = url.searchParams.get('day') || undefined
  const team = parseTeam(url.searchParams.get('team'))
  if (team === null) return err('Equipe inválida', 400)

  try {
    const board = await buildChecksBoard({
      session: auth.session,
      day,
      team,
    })
    const { access } = await loadChecksAccess(auth.session)
    return ok({
      board,
      teams: CHECKS_TEAMS,
      cargos: CHECKS_CARGOS,
      access: {
        can_edit: access.canEdit,
        is_dono: access.isDono,
        is_admin_master: access.isAdminMaster,
        scoped_team: access.scopedTeam,
      },
    })
  } catch (error) {
    return err(error instanceof Error ? error.message : 'Falha ao carregar checks', 500)
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireSession(req)
  if (!auth.ok) return err(auth.message, auth.status)
  if (!canUseChecks(auth.session)) return err('Acesso restrito a Checks diários', 403)

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return err('Dados inválidos', 400)

  const action = typeof body.action === 'string' ? body.action : ''
  try {
    if (action === 'assign_member') {
      const employeeId = typeof body.employee_id === 'string' ? body.employee_id : ''
      const cargo = parseChecksCargoId(body.cargo)
      const team = parseTeam(body.team)
      if (!employeeId || (!cargo && (!team || team === 'all'))) {
        return err('Informe colaborador e cargo', 400)
      }
      await assignMemberToTeam({
        session: auth.session,
        employeeId,
        cargo,
        team: team && team !== 'all' ? team : undefined,
        isLead: body.is_lead === true,
      })
      return ok({ ok: true })
    }
    if (action === 'unassign_member') {
      const employeeId = typeof body.employee_id === 'string' ? body.employee_id : ''
      if (!employeeId) return err('Informe o colaborador', 400)
      await unassignMemberFromTeam({
        session: auth.session,
        employeeId,
      })
      return ok({ ok: true })
    }
    return err('Ação inválida', 400)
  } catch (error) {
    return err(error instanceof Error ? error.message : 'Falha na ação', 400)
  }
}
