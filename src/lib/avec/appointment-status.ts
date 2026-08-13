/**
 * Classifica status textual da agenda Avec (0051 / webhook).
 * "Em Atendimento" / "A Realizar" = aberto — nunca pago.
 * "não pago" NÃO casa com \bpago\b.
 */

function norm(status: string): string {
  return status.toLowerCase()
}

export function isAvecNoShowStatus(status: string): boolean {
  return /falta|faltou|no[\s-]?show|noshow|ausente|n[aã]o compareceu|n[aã]o\s*atendid/.test(
    norm(status),
  )
}

export function isAvecNegativeOutcomeStatus(status: string): boolean {
  return /n[aã]o\s*(realiz|conclu|finaliz|atendid)/.test(norm(status))
}

export function isAvecCancelledStatus(status: string): boolean {
  return /cancel/.test(norm(status))
}

/** Explicit unpaid labels — must not match isAvecPaidStatus. */
export function isAvecUnpaidStatus(status: string): boolean {
  return /n[aã]o\s+pag/.test(norm(status))
}

export function isAvecOpenStatus(status: string): boolean {
  const s = norm(status)
  return /\batendimento\b/.test(s) || /\b(a|por|para)\s+realizar\b/.test(s)
}

/**
 * Pessoa no salão (comanda de verdade), não só “Agendado” futuro.
 * Em Atendimento / A Realizar / Aguardando / comanda / aberto.
 */
export function isAvecInSalonOpenStatus(status: string): boolean {
  const s = norm(status)
  if (!s) return false
  return (
    isAvecOpenStatus(s) ||
    /\baguard/.test(s) ||
    /\bcomanda\b/.test(s) ||
    /\babert/.test(s)
  )
}

/**
 * Comanda/encaixe aberto na agenda (sem necessariamente horário de booking).
 * Inclui Aguardando / Agendado / Em Atendimento / A Realizar.
 */
export function isAvecOpenComandaStatus(status: string): boolean {
  const s = norm(status)
  if (!s) return true // Avec às vezes manda linha aberta sem status
  if (isAvecCancelledStatus(s) || isAvecNoShowStatus(s) || isAvecNegativeOutcomeStatus(s)) {
    return false
  }
  if (isAvecPaidStatus(s)) return false
  return (
    isAvecOpenStatus(s) ||
    /\bagend/.test(s) ||
    /\baguard/.test(s) ||
    /\bcomanda\b/.test(s) ||
    /\babert/.test(s)
  )
}

export function isAvecPaidStatus(status: string): boolean {
  const s = norm(status)
  if (isAvecNoShowStatus(s)) return false
  if (isAvecNegativeOutcomeStatus(s)) return false
  if (isAvecUnpaidStatus(s)) return false
  if (isAvecOpenStatus(s)) return false
  return (
    /\bpago\b/.test(s) ||
    /\b(finaliz|conclu)\w*\b/.test(s) ||
    /\batendid[oa]s?\b/.test(s) ||
    /\brealizad[oa]s?\b/.test(s)
  )
}
