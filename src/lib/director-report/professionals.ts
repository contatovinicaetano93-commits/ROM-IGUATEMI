import { getRomPanelId } from '@/lib/brand'
import { BRASIL_DIRECTOR_PROFESSIONALS } from './professionals.brasil'
import { IGUATEMI_DIRECTOR_PROFESSIONALS } from './professionals.iguatemi'
import type { DirectorProfessional } from './types'

const ROSTERS: Record<string, DirectorProfessional[]> = {
  brasil: BRASIL_DIRECTOR_PROFESSIONALS,
  iguatemi: IGUATEMI_DIRECTOR_PROFESSIONALS,
}

export function listDirectorProfessionals(activeOnly = true): DirectorProfessional[] {
  const roster = ROSTERS[getRomPanelId()] ?? []
  return roster.filter((p) => (activeOnly ? p.active : true))
}
