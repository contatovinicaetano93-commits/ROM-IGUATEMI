import type { AuthSession } from '@/lib/auth'
import {
  checksCargoById,
  type ChecksCargoId,
  type ChecksTeamId,
} from '@/lib/checks-diario/types'
import { matchCargoPackage } from '@/lib/intranet/cargo-packages'
import type { EmployeeRecord } from '@/lib/employees'
import type { RequestArea } from '@/lib/flow/types'

/** Cargo package → equipe de checks (lead ou member). */
export function checksTeamFromCargoPackage(
  packageId: string | null | undefined,
): { team: ChecksTeamId; is_lead: boolean; cargo: ChecksCargoId } | null {
  const cargo = checksCargoById(packageId)
  if (!cargo) return null
  return { team: cargo.team, is_lead: cargo.is_lead, cargo: cargo.id }
}

export function isChecksDono(session: AuthSession, employee: EmployeeRecord | null): boolean {
  if (!employee) return false
  const pack = matchCargoPackage({
    panel_role: employee.panel_role,
    flow_role: employee.flow_role,
    modules: employee.modules,
    areaIds: employee.areaIds as RequestArea[] | undefined,
  })
  return pack?.id === 'dono'
}

export function isChecksAdminMaster(session: AuthSession): boolean {
  return session.role === 'admin'
}

export type ChecksAccess = {
  canView: boolean
  canEdit: boolean
  /** null = todas as equipes (master/dono) */
  scopedTeam: ChecksTeamId | null
  isDono: boolean
  isAdminMaster: boolean
}

export function canManageChecksTeam(
  access: Pick<ChecksAccess, 'canEdit' | 'isAdminMaster' | 'scopedTeam'>,
  team: ChecksTeamId,
): boolean {
  if (!access.canEdit) return false
  if (access.isAdminMaster) return true
  return access.scopedTeam === team
}

/** Cargo só auto-coloca quem ainda não tem linha em checks_diario_members (ativa ou não). */
export function shouldAutoAssignFromCargo(hasMembershipRecord: boolean): boolean {
  return !hasMembershipRecord
}

export function resolveChecksAccess(args: {
  session: AuthSession
  employee: EmployeeRecord | null
  membership: { team: ChecksTeamId; is_lead: boolean } | null
}): ChecksAccess {
  const admin = isChecksAdminMaster(args.session)
  const dono = isChecksDono(args.session, args.employee)
  if (admin) {
    return {
      canView: true,
      canEdit: true,
      scopedTeam: null,
      isDono: false,
      isAdminMaster: true,
    }
  }
  if (dono) {
    return {
      canView: true,
      canEdit: false,
      scopedTeam: null,
      isDono: true,
      isAdminMaster: false,
    }
  }
  if (args.membership?.is_lead) {
    return {
      canView: true,
      canEdit: true,
      scopedTeam: args.membership.team,
      isDono: false,
      isAdminMaster: false,
    }
  }
  // Colaborador: vê só o próprio dia (scopedTeam = team for board filter of self)
  if (args.membership) {
    return {
      canView: true,
      canEdit: false,
      scopedTeam: args.membership.team,
      isDono: false,
      isAdminMaster: false,
    }
  }
  // Sem membership mas com módulo: ainda pode ver a própria tela (tarefas atribuídas)
  return {
    canView: true,
    canEdit: false,
    scopedTeam: null,
    isDono: false,
    isAdminMaster: false,
  }
}
