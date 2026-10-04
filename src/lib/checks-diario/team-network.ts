import { CHECKS_TEAMS, type ChecksTeamId } from '@/lib/checks-diario/types'

export type TeamNetworkPerson = {
  employee_id: string
  name: string
  team: ChecksTeamId | null
  is_lead: boolean
  total_tasks?: number
}

export type TeamNetworkRow = (typeof CHECKS_TEAMS)[number] & {
  leads: TeamNetworkPerson[]
  members: TeamNetworkPerson[]
  total: number
}

/** Agrupa o board em Lead → membros por time (filtro opcional). */
export function buildTeamNetwork(
  people: readonly TeamNetworkPerson[],
  teamFilter: ChecksTeamId | 'all' = 'all',
): TeamNetworkRow[] {
  const visibleTeams =
    teamFilter !== 'all' ? CHECKS_TEAMS.filter((t) => t.id === teamFilter) : CHECKS_TEAMS
  return visibleTeams.map((t) => {
    const inTeam = people.filter((p) => p.team === t.id)
    const leads = inTeam.filter((p) => p.is_lead)
    const members = inTeam.filter((p) => !p.is_lead)
    return { ...t, leads, members, total: inTeam.length }
  })
}
