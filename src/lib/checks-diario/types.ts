export type ChecksTeamId = 'ops_fin' | 'gestor_unidade' | 'rh'

export type ChecksDiarioTask = {
  id: string
  employee_id: string
  title: string
  description: string | null
  sort_order: number
  requires_photo: boolean
  active: boolean
}

export type ChecksDiarioLog = {
  id: string
  task_id: string
  employee_id: string
  day: string
  completed_at: string
  note: string | null
  photo_url: string | null
  photo_captured_at: string | null
}

export type ChecksDiarioPersonBoard = {
  employee_id: string
  name: string
  email: string
  team: ChecksTeamId | null
  is_lead: boolean
  /** Cargo da equipe (recepção, func fin…), não só o time do gestor. */
  cargo: ChecksCargoId | null
  tasks: Array<
    ChecksDiarioTask & {
      logs_today: ChecksDiarioLog[]
      done_count: number
    }
  >
  done_tasks: number
  total_tasks: number
}

export type ChecksDiarioBoard = {
  day: string
  can_edit: boolean
  is_master_view: boolean
  my_employee_id: string | null
  team_filter: ChecksTeamId | 'all'
  people: ChecksDiarioPersonBoard[]
  summary: {
    people: number
    complete: number
    partial: number
    pending: number
    no_routine: number
    with_routine: number
    logs_today: number
  }
}

export const CHECKS_TEAMS: readonly {
  id: ChecksTeamId
  label: string
  leadLabel: string
  memberHint: string
}[] = [
  {
    id: 'ops_fin',
    label: 'Ops financeiro',
    leadLabel: 'Ops Fin',
    memberHint: 'Func fin',
  },
  {
    id: 'gestor_unidade',
    label: 'Gestor unidade',
    leadLabel: 'Gestor unidade',
    memberHint: 'Recepção · Estoque · Almoxarifado · Pós-venda · Limpeza',
  },
  {
    id: 'rh',
    label: 'RH',
    leadLabel: 'RH',
    memberHint: 'Equipe RH',
  },
] as const

/** Cargos que entram nos Checks: o responsável e a equipe de cada gestor. */
export type ChecksCargoId =
  | 'ops_financeiro'
  | 'func_financeiro'
  | 'gestor_unidade'
  | 'recepcao'
  | 'estoque_ops'
  | 'almoxarifado'
  | 'pos_venda'
  | 'limpeza'
  | 'rh'
  | 'equipe_rh'

export type ChecksCargoDef = {
  id: ChecksCargoId
  team: ChecksTeamId
  is_lead: boolean
  label: string
}

export const CHECKS_CARGOS: readonly ChecksCargoDef[] = [
  {
    id: 'ops_financeiro',
    team: 'ops_fin',
    is_lead: true,
    label: 'Ops financeiro',
  },
  {
    id: 'func_financeiro',
    team: 'ops_fin',
    is_lead: false,
    label: 'Funcionário financeiro',
  },
  {
    id: 'gestor_unidade',
    team: 'gestor_unidade',
    is_lead: true,
    label: 'Gestor(a) de unidade',
  },
  {
    id: 'recepcao',
    team: 'gestor_unidade',
    is_lead: false,
    label: 'Recepção',
  },
  {
    id: 'estoque_ops',
    team: 'gestor_unidade',
    is_lead: false,
    label: 'Estoque',
  },
  {
    id: 'almoxarifado',
    team: 'gestor_unidade',
    is_lead: false,
    label: 'Almoxarifado',
  },
  {
    id: 'pos_venda',
    team: 'gestor_unidade',
    is_lead: false,
    label: 'Pós-venda',
  },
  {
    id: 'limpeza',
    team: 'gestor_unidade',
    is_lead: false,
    label: 'Limpeza',
  },
  { id: 'rh', team: 'rh', is_lead: true, label: 'RH' },
  {
    id: 'equipe_rh',
    team: 'rh',
    is_lead: false,
    label: 'Equipe RH',
  },
] as const

export function checksCargoById(
  id: string | null | undefined,
): ChecksCargoDef | null {
  if (!id) return null
  return CHECKS_CARGOS.find((c) => c.id === id) ?? null
}

export function parseChecksCargoId(raw: unknown): ChecksCargoId | null {
  if (typeof raw !== 'string') return null
  return checksCargoById(raw)?.id ?? null
}

export function checksCargosForTeam(team: ChecksTeamId): ChecksCargoDef[] {
  return CHECKS_CARGOS.filter((c) => c.team === team)
}

export function checksCargoLabel(id: ChecksCargoId | null | undefined): string {
  return checksCargoById(id)?.label ?? '—'
}

/** Cargo gravado, ou o cargo-lead do time se só sabemos que é responsável. */
export function resolveChecksCargo(args: {
  cargo?: string | null
  team: ChecksTeamId | null
  is_lead: boolean
}): ChecksCargoId | null {
  if (!args.team) return null
  const stored = checksCargoById(args.cargo)
  if (stored && stored.team === args.team) return stored.id
  if (args.is_lead) {
    return CHECKS_CARGOS.find((c) => c.team === args.team && c.is_lead)?.id ?? null
  }
  return null
}
