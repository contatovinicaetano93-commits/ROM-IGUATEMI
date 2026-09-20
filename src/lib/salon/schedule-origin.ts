/** Marcador em client_services.notes — distingue booking vs comanda/encaixe. */
export const COMANDA_ORIGIN_TAG = '[[rom:comanda]]'
export const COMANDA_SERVICE_NAME = 'Comanda / atendimento'

export type ScheduleOrigin = 'agenda' | 'comanda'

export function isComandaOrigin(service: {
  notes?: string | null
  name?: string | null
}): boolean {
  if (service.notes?.includes(COMANDA_ORIGIN_TAG)) return true
  if ((service.name ?? '').trim() === COMANDA_SERVICE_NAME) return true
  return false
}

/**
 * Serviço marcado como cortesia na agenda Avec (nome tipicamente "CORTESIA"
 * ou "PROFISSIONAL - CORTESIA").
 */
export function isCortesiaService(service: {
  name?: string | null
  notes?: string | null
  category?: string | null
  product?: string | null
}): boolean {
  const hay = [service.name, service.notes, service.category, service.product]
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    .join('\n')
    .toLowerCase()
  return hay.includes('cortesia')
}

/** Mantém notas do usuário e liga/desliga o marcador de origem. */
export function notesWithScheduleOrigin(
  notes: string | null | undefined,
  origin: ScheduleOrigin,
): string | null {
  const base = (notes ?? '')
    .replace(new RegExp(`\\s*${COMANDA_ORIGIN_TAG.replace(/[[\]]/g, '\\$&')}\\s*`, 'g'), ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (origin === 'comanda') {
    return base ? `${COMANDA_ORIGIN_TAG} ${base}` : COMANDA_ORIGIN_TAG
  }
  return base || null
}
