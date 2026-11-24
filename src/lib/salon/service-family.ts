/**
 * Agrupa SKUs Avec com preço ("CORTE - 500,00", "REFLEXO 1390,00") numa
 * família estável para filtro na lista de Contatos.
 */

const PRICE_TAIL_RE =
  /\s*[-–—]?\s*(?:r\$\s*)?\d{1,5}(?:[.,]\d{2})?(?:\s*(?:tabela|tab\.?))?\s*$/i

export function normalizeServiceFamilyKey(name: string): string {
  let n = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
  n = n.replace(PRICE_TAIL_RE, '').trim()
  n = n.replace(/[^a-z0-9]+/g, ' ').trim()
  return n
}

/** Rótulo curto pra chip (Title Case + acentos comuns). */
export function serviceFamilyLabel(familyKey: string): string {
  const key = familyKey.trim().toLowerCase()
  if (!key) return ''
  const known: Record<string, string> = {
    corte: 'Corte',
    'corte consultoria mauri': 'Corte consultoria',
    'corte feminino': 'Corte feminino',
    'corte masculino': 'Corte masculino',
    'corte franja': 'Corte franja',
    reflexo: 'Reflexo',
    coloracao: 'Coloração',
    'coloracao global': 'Coloração global',
    escova: 'Escova',
    'baby liss': 'Babyliss',
    babyliss: 'Babyliss',
    alinhamento: 'Alinhamento',
    tratamento: 'Tratamento',
    lavagem: 'Lavagem',
    secagem: 'Secagem',
    'abertura de fundo': 'Abertura de fundo',
    avaliacao: 'Avaliação',
    retorno: 'Retorno',
  }
  if (known[key]) return known[key]
  return key
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

/** Família do SKU casa com a escolhida (após tirar preço). */
export function serviceFamilyMatches(serviceName: string, selectedFamily: string): boolean {
  const a = normalizeServiceFamilyKey(serviceName)
  const b = normalizeServiceFamilyKey(selectedFamily)
  return Boolean(a && b && a === b)
}

export function isBlankOrPlaceholderFamily(familyKey: string): boolean {
  const k = familyKey.trim().toLowerCase()
  return !k || k === 'atendimento' || k === 'servico' || k === 'visita' || k === 'service'
}
