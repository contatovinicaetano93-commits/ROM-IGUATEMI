import type { AuthSession } from '@/lib/auth'
import type { ChecksTeamId } from '@/lib/checks-diario/types'
import { matchCargoPackage } from '@/lib/intranet/cargo-packages'
import type { EmployeeRecord } from '@/lib/employees'
import type { RequestArea } from '@/lib/flow/types'

/** Cargo package → equipe de checks (lead ou member). */
export function checksTeamFromCargoPackage(
  packageId: string | null | undefined,
): { team: ChecksTeamId; is_lead: boolean } | null {
  switch (packageId) {
    case 'ops_financeiro':
      return { team: 'ops_fin', is_lead: true }
    case 'func_financeiro':
      return { team: 'ops_fin', is_lead: false }
    case 'gestor_unidade':
      return { team: 'gestor_unidade', is_lead: true }
    case 'recepcao':
    case 'estoque_ops':
    case 'almoxarifado':
    case 'pos_venda':
    case 'limpeza':
      return { team: 'gestor_unidade', is_lead: false }
    case 'rh':
      return { team: 'rh', is_lead: true }
    case 'equipe_rh':
      return { team: 'rh', is_lead: false }
    default:
      return null
  }
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
