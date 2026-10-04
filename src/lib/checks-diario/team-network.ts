import {
  CHECKS_CARGOS,
  CHECKS_TEAMS,
  resolveChecksCargo,
  type ChecksCargoId,
  type ChecksTeamId,
} from '@/lib/checks-diario/types'

export type TeamNetworkPerson = {
  employee_id: string
  name: string
  team: ChecksTeamId | null
  is_lead: boolean
  cargo?: ChecksCargoId | null
  total_tasks?: number
}

export type TeamNetworkCargoSlot = {
  id: ChecksCargoId | 'other'
  label: string
  is_lead: boolean
  people: TeamNetworkPerson[]
}

export type TeamNetworkRow = (typeof CHECKS_TEAMS)[number] & {
  cargos: TeamNetworkCargoSlot[]
  leads: TeamNetworkPerson[]
  members: TeamNetworkPerson[]
  total: number
}

function slotIdForPerson(
  person: TeamNetworkPerson,
  team: ChecksTeamId,
): ChecksCargoId | 'other' {
  return (
    resolveChecksCargo({
      cargo: person.cargo,
      team,
      is_lead: person.is_lead,
    }) ?? 'other'
  )
}

/** Agrupa o board em cargos por time (responsável + equipe do gestor). */
export function buildTeamNetwork(
  people: readonly TeamNetworkPerson[],
  teamFilter: ChecksTeamId | 'all' = 'all',
): TeamNetworkRow[] {
  const visibleTeams =
    teamFilter !== 'all' ? CHECKS_TEAMS.filter((t) => t.id === teamFilter) : CHECKS_TEAMS
  return visibleTeams.map((t) => {
    const inTeam = people.filter((p) => p.team === t.id)
    const used = new Set<string>()
    const cargos: TeamNetworkCargoSlot[] = CHECKS_CARGOS.filter((c) => c.team === t.id).map(
      (c) => {
        const slotPeople = inTeam.filter((p) => slotIdForPerson(p, t.id) === c.id)
        for (const person of slotPeople) used.add(person.employee_id)
        return {
          id: c.id,
          label: c.label,
          is_lead: c.is_lead,
          people: slotPeople,
        }
      },
    )
    const leftovers = inTeam.filter((p) => !used.has(p.employee_id))
    if (leftovers.length > 0) {
      cargos.push({
        id: 'other',
        label: 'Outros na equipe',
        is_lead: false,
        people: leftovers,
      })
    }
    const leads = cargos.filter((c) => c.is_lead).flatMap((c) => c.people)
    const members = cargos.filter((c) => !c.is_lead).flatMap((c) => c.people)
    return { ...t, cargos, leads, members, total: inTeam.length }
  })
}
