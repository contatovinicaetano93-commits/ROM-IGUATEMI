export type AtivacaoCondition = 'comercial' | 'servicos'
export type AtivacaoStatus = 'confirmed' | 'cancelled'

export type BrandActivation = {
  id: string
  day: string
  start_time: string
  brand: string
  condition: AtivacaoCondition
  notes: string | null
  status: AtivacaoStatus
  created_by_employee_id: string | null
  created_by_name: string
  created_by_role: string
  cancelled_by_name: string | null
  cancelled_at: string | null
  created_at: string
  updated_at: string
}

export type CreateBrandActivationInput = {
  day: string
  start_time: string
  brand: string
  condition: AtivacaoCondition
  notes?: string | null
  created_by_employee_id?: string | null
  created_by_name: string
  created_by_role: string
}

export function parseAtivacaoCondition(value: unknown): AtivacaoCondition | null {
  if (value === 'comercial' || value === 'servicos') return value
  return null
}

export function conditionLabel(condition: AtivacaoCondition): string {
  switch (condition) {
    case 'comercial':
      return 'Condição comercial'
    case 'servicos':
      return 'Condição de serviços'
    default: {
      const _exhaustive: never = condition
      return _exhaustive
    }
  }
}

/** Aceita HH:MM ou HH:MM:SS; devolve HH:MM. */
export function normalizeStartTime(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const raw = value.trim()
  const m = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/.exec(raw)
  if (!m) return null
  return `${m[1]}:${m[2]}`
}

export function isIsoDay(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

export function isIsoMonth(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}$/.test(value)
}
