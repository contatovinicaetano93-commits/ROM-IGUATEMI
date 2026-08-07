/**
 * Heurística para isolar teste / cortesia do Pipeline operacional.
 * Não há flag canônica no Avec — usa nome do serviço, contato, notes e preço zero pago.
 */

export type NonBillableKind = 'teste' | 'cortesia'

export type NonBillableRow = {
  name?: string | null
  notes?: string | null
  contact_name?: string | null
  last_price?: number | null
  last_done_at?: string | null
}

function blobOf(row: NonBillableRow): string {
  return [row.name, row.notes, row.contact_name]
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    .join(' ')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
}

/** Classifica linha como teste ou cortesia; null = atendimento normal. */
export function classifyNonBillable(row: NonBillableRow): NonBillableKind | null {
  const blob = blobOf(row)

  // Teste antes de cortesia (ex.: "teste cortesia").
  if (
    /\btestes?\b/.test(blob) ||
    /\btest\b/.test(blob) ||
    /\bcliente\s*teste\b/.test(blob) ||
    /\bagenda\s*teste\b/.test(blob)
  ) {
    return 'teste'
  }

  if (
    /\bcortesias?\b/.test(blob) ||
    /\bcourtesy\b/.test(blob) ||
    /\bbrinde\b/.test(blob) ||
    /\bamostra\b/.test(blob) ||
    /\bgentileza\b/.test(blob)
  ) {
    return 'cortesia'
  }

  // Só com visita marcada como feita: preço 0 costuma ser cortesia no Avec.
  if (row.last_done_at && row.last_price != null && Number(row.last_price) === 0) {
    return 'cortesia'
  }

  return null
}

export function isNonBillable(row: NonBillableRow): boolean {
  return classifyNonBillable(row) != null
}
