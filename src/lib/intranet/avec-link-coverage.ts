import { occupancyMergeKey } from '@/lib/director-report/match-pro'

/** Colaborador mínimo para cobertura de vínculo Avec (puro — sem DB). */
export type CoverageEmployee = {
  status: string
  panel_role: string
  professional_name: string | null | undefined
}

/** Profissional de piso (roster) mínimo. */
export type CoverageFloorPro = {
  name: string
  avec_pro_id: string | null | undefined
}

/**
 * Contagens de vínculo intranet ↔ Avec.
 * Percentuais ausentes → `null` (não inventa 0% quando o denominador é 0).
 */
export type AvecLinkCoverage = {
  staff_active: number
  staff_with_professional_name: number
  staff_without_professional_name: number
  /** null quando não há staff ativo */
  pct_staff_with_professional_name: number | null
  floor_roster_size: number
  floor_with_avec_pro_id: number
  floor_without_avec_pro_id: number
  /** null quando o roster de piso está vazio */
  pct_floor_with_avec_pro_id: number | null
  floor_linked_to_employee: number
  /** null quando o roster de piso está vazio */
  pct_floor_linked: number | null
}

/** Percentual 0–100 com 1 casa; denominador 0 → null. */
export function coveragePercent(part: number, whole: number): number | null {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0) return null
  return Math.round((part / whole) * 1000) / 10
}

/**
 * Agrega cobertura de vínculo a partir de employees + roster de piso.
 * Staff = `status=active` + `panel_role=staff`.
 * Linked = chave normalizada do `professional_name` casa com o nome do roster.
 */
export function computeAvecLinkCoverage(
  employees: readonly CoverageEmployee[],
  floorRoster: readonly CoverageFloorPro[],
): AvecLinkCoverage {
  const staff = employees.filter((e) => e.status === 'active' && e.panel_role === 'staff')
  let withName = 0
  for (const person of staff) {
    if (person.professional_name?.trim()) withName++
  }
  const withoutName = staff.length - withName

  const linkedKeys = new Set<string>()
  for (const person of employees) {
    if (person.status !== 'active') continue
    const name = person.professional_name?.trim()
    if (!name) continue
    const key = occupancyMergeKey(name)
    if (key) linkedKeys.add(key)
  }

  let withId = 0
  let linked = 0
  for (const pro of floorRoster) {
    if (pro.avec_pro_id?.trim()) withId++
    const key = occupancyMergeKey(pro.name)
    if (key && linkedKeys.has(key)) linked++
  }

  const floorSize = floorRoster.length
  return {
    staff_active: staff.length,
    staff_with_professional_name: withName,
    staff_without_professional_name: withoutName,
    pct_staff_with_professional_name: coveragePercent(withName, staff.length),
    floor_roster_size: floorSize,
    floor_with_avec_pro_id: withId,
    floor_without_avec_pro_id: floorSize - withId,
    pct_floor_with_avec_pro_id: coveragePercent(withId, floorSize),
    floor_linked_to_employee: linked,
    pct_floor_linked: coveragePercent(linked, floorSize),
  }
}
