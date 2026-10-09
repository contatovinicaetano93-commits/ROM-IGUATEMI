/** Remove acentos e lower — busca “recepcao” acha “recepção”. */
export function fold(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')
}

/** Tokens de busca: min 2 chars, folded, sem duplicata. */
export function searchTokens(query: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of fold(query).split(/[\s,;|/]+/)) {
    const token = raw.trim()
    if (token.length < 2 || seen.has(token)) continue
    seen.add(token)
    out.push(token)
  }
  return out
}

/** Normaliza keywords manuais + do texto. */
export function normalizeKeywords(raw: readonly string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of raw) {
    const key = fold(item.trim())
    if (key.length < 2 || seen.has(key)) continue
    seen.add(key)
    out.push(key)
  }
  return out.slice(0, 40)
}

const ROLE_HINTS = [
  'cabeleireiro',
  'cabeleireira',
  'manicure',
  'manicureista',
  'recepcao',
  'recepção',
  'auxiliar',
  'assistente',
  'colorista',
  'barbeiro',
  'esteticista',
  'maquiador',
  'maquiadora',
  'gerente',
  'rh',
  'financeiro',
  'estoque',
  'limpeza',
] as const

/** Extrai tags óbvias do texto do CV (sem IA). */
export function hintKeywordsFromText(text: string): string[] {
  const folded = fold(text)
  const found: string[] = []
  for (const hint of ROLE_HINTS) {
    if (folded.includes(fold(hint))) found.push(fold(hint))
  }
  return normalizeKeywords(found)
}
