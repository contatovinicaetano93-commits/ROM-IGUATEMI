export type AvecSyncMode = 'fast' | 'full'

export type AvecReportTier = 'A' | 'B' | 'C'

export type AvecMapperKind =
  | 'clients'
  | 'appointments'
  | 'attendances'
  | 'revenue'
  | 'cancellations'
  | 'professionals_revenue'
  | 'professionals_occupancy'
  | 'top_services'
  | 'reactivation'
  | 'acquisition'
  | 'booking_channels'
  | 'packages'
  | 'ratings'
  | 'birthdays'
  | 'return_rate'
  | 'new_clients_period'
  | 'revenue_curve'
  | 'director_return'
  | 'raw'

export interface AvecReportDef {
  id: string
  tier: AvecReportTier
  name: string
  mapper: AvecMapperKind
  /** fast = camada A no cron; daily = B/C no full */
  schedule: 'fast' | 'daily' | 'weekly' | 'on_demand'
  envKey?: string
}

/**
 * Mapa A→B→C (Cérebro: Hoje → Semana → Comercial).
 * Sem 0081, comissões, estoque, NF.
 */
const CORE: AvecReportDef[] = [
  // A — Hoje (cron fast)
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
    id: '0052',
    tier: 'A',
    name: 'Cancelados / no-show',
    mapper: 'cancellations',
    schedule: 'fast',
    envKey: 'AVEC_REPORT_CANCELLATIONS',
  },
  // A — fundação (só full)
  { id: '0004', tier: 'A', name: 'Clientes', mapper: 'clients', schedule: 'daily' },

  // B — Semana (só full)
  { id: '0021', tier: 'B', name: 'Fat. por profissional', mapper: 'professionals_revenue', schedule: 'daily' },
  { id: '0126', tier: 'B', name: 'Ocupação', mapper: 'professionals_occupancy', schedule: 'daily' },
  { id: '0032', tier: 'B', name: 'Top serviços', mapper: 'top_services', schedule: 'daily' },
  { id: '0107', tier: 'B', name: 'Sem retorno', mapper: 'reactivation', schedule: 'daily' },
  {
    id: '0011',
    tier: 'B',
    name: 'Retorno por profissional (diretoria)',
    mapper: 'director_return',
    schedule: 'on_demand',
    envKey: 'AVEC_REPORT_DIRECTOR_RETURN',
  },
  { id: '0003', tier: 'B', name: 'Como nos conheceram', mapper: 'acquisition', schedule: 'daily' },
  { id: '0007', tier: 'B', name: 'Taxa de retorno', mapper: 'return_rate', schedule: 'daily' },
  { id: '0017', tier: 'B', name: 'Novos no período', mapper: 'new_clients_period', schedule: 'daily' },
  {
    id: '0088',
    tier: 'B',
    name: 'Evolução diária',
    mapper: 'revenue_curve',
    schedule: 'daily',
    envKey: 'AVEC_REPORT_REVENUE_CURVE',
  },

  // C — Comercial (só full)
  { id: '0056', tier: 'C', name: 'Agenda por canal', mapper: 'booking_channels', schedule: 'daily' },
  { id: '0061', tier: 'C', name: 'Pacotes', mapper: 'packages', schedule: 'daily' },
  { id: '0104', tier: 'C', name: 'Avaliações', mapper: 'ratings', schedule: 'daily' },
  { id: '0001', tier: 'C', name: 'Aniversariantes', mapper: 'birthdays', schedule: 'daily' },
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
    const fromEnv = process.env[def.envKey]?.trim()
    if (fromEnv) return fromEnv
    if (/^\d{4}$/.test(def.id)) return def.id
    return null
  }
  return def.id
}

export function isReportConfigured(def: AvecReportDef): boolean {
  return resolveReportId(def) != null
}
