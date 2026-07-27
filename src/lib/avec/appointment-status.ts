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
