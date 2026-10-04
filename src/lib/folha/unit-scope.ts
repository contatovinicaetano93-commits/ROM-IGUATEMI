/**
 * Isola a Folha na unidade do painel.
 *
 * O 8123 sem `salao_id` devolve as duas unidades no mesmo token Avec.
 * Dual-unidade (Alan, Jefferson…) permanece nos dois painéis; exclusivo da
 * outra (Alison Alvarez no IG, Beto Fortes no BR) cai fora. Nome que não
 * está em nenhum roster permanece — contratação nova / cargo sem Lake.
 */

import { namesLooselyMatch, occupancyMergeKey } from '@/lib/director-report/match-pro'
import { BRASIL_DIRECTOR_PROFESSIONALS } from '@/lib/director-report/professionals.brasil'
import { IGUATEMI_DIRECTOR_PROFESSIONALS } from '@/lib/director-report/professionals.iguatemi'
import type { DirectorProfessional } from '@/lib/director-report/types'
import type { RomPanelId } from '@/lib/brand'
import type { CommissionProfessionalRow } from '@/lib/salon/commission-metrics'

const ROSTERS: Record<RomPanelId, readonly DirectorProfessional[]> = {
  brasil: BRASIL_DIRECTOR_PROFESSIONALS,
  iguatemi: IGUATEMI_DIRECTOR_PROFESSIONALS,
}

function otherFolhaPanel(panel: RomPanelId): RomPanelId {
  switch (panel) {
    case 'brasil':
      return 'iguatemi'
    case 'iguatemi':
      return 'brasil'
    default: {
      const _exhaustive: never = panel
      return _exhaustive
    }
  }
}

/** Match único no roster: chave canônica ou namesLooselyMatch sem ambiguidade. */
export function folhaNameMatchesRoster(
  name: string,
  roster: readonly DirectorProfessional[],
): boolean {
  const key = occupancyMergeKey(name)
  if (!key) return false
  if (roster.some((p) => occupancyMergeKey(p.name) === key)) return true
  let hits = 0
  for (const p of roster) {
    if (namesLooselyMatch(key, occupancyMergeKey(p.name))) {
      hits += 1
      if (hits > 1) return false
    }
  }
  return hits === 1
}

/**
 * Home roster → fica. Exclusivo da outra unidade → sai. Desconhecido → fica.
 */
export function folhaNameBelongsToPanel(panel: RomPanelId, name: string): boolean {
  if (!name.trim()) return false
  if (folhaNameMatchesRoster(name, ROSTERS[panel])) return true
  if (folhaNameMatchesRoster(name, ROSTERS[otherFolhaPanel(panel)])) return false
  return true
}

export function filterFolhaProfessionalsForPanel(
  panel: RomPanelId,
  professionals: readonly CommissionProfessionalRow[],
): CommissionProfessionalRow[] {
  return professionals.filter((p) => folhaNameBelongsToPanel(panel, p.name))
}

export function folhaPeriodNeedsUnitScope(
  panel: RomPanelId,
  row: {
    lines: readonly { name: string }[]
    source_professionals: readonly { name: string }[]
  },
): boolean {
  return (
    row.source_professionals.some((p) => !folhaNameBelongsToPanel(panel, p.name)) ||
    row.lines.some((line) => !folhaNameBelongsToPanel(panel, line.name))
  )
}
