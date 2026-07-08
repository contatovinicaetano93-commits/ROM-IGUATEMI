export type AvecSyncMode = 'fast' | 'full'

export type AvecReportTier = 'A' | 'B' | 'C'

export type AvecMapperKind =
  | 'clients'
  | 'appointments'
  | 'attendances'
  | 'revenue'
  | 'cancellations'
  | 'raw'

export interface AvecReportDef {
  id: string
  tier: AvecReportTier
  name: string
  mapper: AvecMapperKind
  schedule: 'daily' | 'fast' | 'weekly' | 'on_demand'
  envKey?: string
}

const CORE: AvecReportDef[] = [
  { id: '0004', tier: 'A', name: 'Clientes', mapper: 'clients', schedule: 'daily' },
  { id: '0051', tier: 'A', name: 'Agendamentos', mapper: 'appointments', schedule: 'fast' },
  { id: '0002', tier: 'A', name: 'Atendidos', mapper: 'attendances', schedule: 'fast' },
  {
    id: 'revenue',
    tier: 'A',
    name: 'Faturamento',
    mapper: 'revenue',
    schedule: 'fast',
    envKey: 'AVEC_REPORT_REVENUE',
  },
  {
    id: 'cancellations',
    tier: 'A',
    name: 'Cancelados / No-show',
    mapper: 'cancellations',
    schedule: 'fast',
    envKey: 'AVEC_REPORT_CANCELLATIONS',
  },
]

export function getAvecReportRegistry(): AvecReportDef[] {
  return CORE
}

export function getDailyReports(): AvecReportDef[] {
  return CORE.filter((r) => r.schedule === 'daily' || r.schedule === 'fast')
}

export function getFastReports(): AvecReportDef[] {
  return CORE.filter((r) => r.schedule === 'fast')
}

export function resolveReportId(def: AvecReportDef): string | null {
  if (def.envKey) {
    const fromEnv = process.env[def.envKey]
    if (!fromEnv?.trim()) return null
    return fromEnv.trim()
  }
  return def.id
}

export function isReportConfigured(def: AvecReportDef): boolean {
  if (!def.envKey) return true
  return Boolean(process.env[def.envKey]?.trim())
}
