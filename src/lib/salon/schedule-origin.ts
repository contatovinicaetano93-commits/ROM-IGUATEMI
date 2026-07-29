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
