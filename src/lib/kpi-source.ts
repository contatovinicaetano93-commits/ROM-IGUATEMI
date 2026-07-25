/**
 * Rótulos curtos de fonte para KPIs (glossário / confiança do número).
 * Use só quando o dado for Avec, proxy, incompleto ou desatualizado —
 * não poluir o hero com chips.
 */

export type KpiSourceKind =
  | 'avec'
  | 'proxy'
  | 'manual'
  | 'rom'
  | 'incomplete'
  | 'stale'

/** Português curto — aparece sob o valor do KPI. */
export const KPI_SOURCE_PT: Record<KpiSourceKind, string> = {
  avec: 'Avec',
  proxy: 'proxy',
  manual: 'manual',
  rom: 'ROM',
  incomplete: 'incompleto',
  stale: 'desatualizado',
}

export function formatKpiSources(...kinds: KpiSourceKind[]): string {
  const seen = new Set<string>()
  const parts: string[] = []
  for (const k of kinds) {
    const label = KPI_SOURCE_PT[k]
    if (seen.has(label)) continue
    seen.add(label)
    parts.push(label)
  }
  return parts.join(' · ')
}

/** Deriva hint de sync (parcial / stale) a partir do status do badge Avec. */
export function kpiSourceFromSyncStatus(
  status: string | null | undefined,
): KpiSourceKind | null {
  if (status === 'partial') return 'incomplete'
  if (status === 'stale') return 'stale'
  return null
}
