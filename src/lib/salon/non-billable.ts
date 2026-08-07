/**
 * Heurística para isolar teste / cortesia do Pipeline operacional.
 * Não há flag canônica no Avec — usa nome do serviço, contato, notes e preço zero pago.
 *
 * "TESTE DE MECHAS" (e similares) é serviço real de coloração — não é teste de sistema.
 */

export type NonBillableKind = 'teste' | 'cortesia'

export type NonBillableRow = {
  name?: string | null
  notes?: string | null
  contact_name?: string | null
  last_price?: number | null
  last_done_at?: string | null
  /** Presente no pipeline: se posterior a last_done_at, last_price é de visita anterior. */
  scheduled_at?: string | null
}

function blobOf(row: NonBillableRow): string {
  return [row.name, row.notes, row.contact_name]
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    .join(' ')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
}

/** Serviços Avec com "teste" no nome que são procedimento (faturável), não QA. */
function isProceduralTesteService(blob: string): boolean {
  return (
    /\bteste\s+de\s+mechas?\b/.test(blob) ||
    /\bteste\s+de\s+cor\b/.test(blob) ||
    /\bteste\s+de\s+color/.test(blob) ||
    /\bteste\s+de\s+alisamento\b/.test(blob) ||
    /\bteste\s+de\s+quimica\b/.test(blob)
  )
}

function isCourtesyBlob(blob: string): boolean {
  return (
    /\bcortesias?\b/.test(blob) ||
    /\bcourtesy\b/.test(blob) ||
    /\bbrinde\b/.test(blob) ||
    /\bamostra\b/.test(blob) ||
    /\bgentileza\b/.test(blob)
  )
}

function isQaTestBlob(blob: string): boolean {
  if (isProceduralTesteService(blob)) return false
  return (
    /\bcliente\s*teste\b/.test(blob) ||
    /\bagenda\s*teste\b/.test(blob) ||
    /\btestes?\b/.test(blob) ||
    /\btest\b/.test(blob)
  )
}

/** Classifica linha como teste ou cortesia; null = atendimento normal. */
export function classifyNonBillable(row: NonBillableRow): NonBillableKind | null {
  const blob = blobOf(row)

  // Cortesia primeiro — serviço "CORTESIA" deve ir para o card do meio.
  if (isCourtesyBlob(blob)) return 'cortesia'

  if (isQaTestBlob(blob)) return 'teste'

  // Só com visita marcada como feita nesta ocorrência: preço 0 costuma ser cortesia no Avec.
  // Rebooking aberto após cortesia ainda carrega last_done_at/last_price históricos — ignorar.
  if (
    row.last_done_at &&
    row.last_price != null &&
    Number(row.last_price) === 0 &&
    (!row.scheduled_at || row.scheduled_at <= row.last_done_at)
  ) {
    return 'cortesia'
  }

  return null
}

export function isNonBillable(row: NonBillableRow): boolean {
  return classifyNonBillable(row) != null
}
