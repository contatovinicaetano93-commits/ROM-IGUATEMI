import { findNearProInMap, occupancyMergeKey } from '@/lib/director-report/match-pro'
import type { P1ProfessionalRow } from '@/lib/salon/p1-metrics'

export type MeuFaturamentoMetrics = {
  matched_name: string | null
  revenue: number | null
  attended: number | null
  ticket_avg: number | null
  occupancy: number | null
}

/**
 * Resolve o faturamento do profissional no snapshot P1.
 * Ausência de match ou snapshot → null (não inventa 0).
 * R$ 0 real do Avec só aparece quando a linha existe.
 */
export function resolveMeuFaturamento(
  professionals: readonly P1ProfessionalRow[],
  linkName: string | null | undefined,
): MeuFaturamentoMetrics {
  const name = linkName?.trim() ?? ''
  if (!name || professionals.length === 0) {
    return {
      matched_name: null,
      revenue: null,
      attended: null,
      ticket_avg: null,
      occupancy: null,
    }
  }
  const byPro = new Map<string, P1ProfessionalRow>()
  for (const row of professionals) {
    const key = occupancyMergeKey(row.name)
    if (!key) continue
    if (!byPro.has(key)) byPro.set(key, row)
  }
  const hit = findNearProInMap(byPro, name)
  if (!hit) {
    return {
      matched_name: null,
      revenue: null,
      attended: null,
      ticket_avg: null,
      occupancy: null,
    }
  }
  return {
    matched_name: hit.value.name,
    revenue: hit.value.revenue,
    attended: hit.value.attended,
    ticket_avg: hit.value.ticket_avg,
    occupancy: hit.value.occupancy,
  }
}
