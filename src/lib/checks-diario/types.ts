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
