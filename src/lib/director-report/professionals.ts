import { getRomPanelId } from '@/lib/brand'
import { BRASIL_DIRECTOR_PROFESSIONALS } from './professionals.brasil'
import { IGUATEMI_DIRECTOR_PROFESSIONALS } from './professionals.iguatemi'
import type { DirectorProfessional } from './types'

const ROSTERS: Record<string, DirectorProfessional[]> = {
  brasil: BRASIL_DIRECTOR_PROFESSIONALS,
  iguatemi: IGUATEMI_DIRECTOR_PROFESSIONALS,
}

/** Profissionais de piso (atendimento) — exclui marketing/contábil/almoxarifado etc. */
export const DIRECTOR_FLOOR_ROLES: DirectorProfessional['role'][] = ['hairstylist', 'makeup']

export function listDirectorProfessionals(
  activeOnly = true,
  opts?: { roles?: DirectorProfessional['role'][] },
): DirectorProfessional[] {
  const roster = ROSTERS[getRomPanelId()] ?? []
  const roles = opts?.roles
  return roster.filter((p) => {
    if (activeOnly && !p.active) return false
    if (roles && roles.length > 0 && !roles.includes(p.role)) return false
    return true
  })
}
