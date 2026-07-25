import type { DirectorProfessional } from './types'

/** Normaliza nome para match flexível (acentos, case, espaços). */
export function normalizeProKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

const CARGO_SUFFIX_RE =
  /\s*[-–—|,/]\s*(cabeleireir[oa]s?|manicures?|coloristas?|barbeiros?|esteticistas?|assistentes?|don[oa]s?|gerentes?|profissionais?|nail\s*designers?|make\s*up|maquiadores?)\b.*$/i

const CARGO_PAREN_RE =
  /\s*\((cabeleireir[oa]s?|manicures?|coloristas?|barbeiros?|esteticistas?|assistentes?|don[oa]s?|gerentes?|profissionais?|nail\s*designers?|make\s*up|maquiadores?)\)\s*$/i

/** Remove sufixos de cargo comuns em relatórios Avec (ex.: "Ana Silva - Cabeleireira"). */
export function stripCargoSuffix(name: string): string {
  return name.replace(CARGO_SUFFIX_RE, '').replace(CARGO_PAREN_RE, '').trim()
}

export function proNameTokens(key: string): string[] {
  return key.split(/\s+/).filter(Boolean)
}

/** Partículas PT — ignoradas no match por subconjunto de tokens. */
const NAME_PARTICLES = new Set(['de', 'da', 'do', 'dos', 'das', 'e', 'di', 'du', 'del', 'della'])

/** Tokens significativos (sem de/da/do…) para casar apelido ⊂ nome completo. */
export function significantNameTokens(key: string): string[] {
  return proNameTokens(key).filter((t) => !NAME_PARTICLES.has(t))
}

/**
 * True se os tokens significativos do nome curto estão contidos no longo
 * e o primeiro token (prenome) coincide — ex.: "mauricio carvalho" ⊂ "mauricio de carvalho lima".
 */
export function isSignificantTokenSubset(shortKey: string, longKey: string): boolean {
  const shortToks = significantNameTokens(shortKey)
  const longToks = significantNameTokens(longKey)
  if (shortToks.length < 2 || longToks.length < 2) return false
  if (shortToks[0] !== longToks[0]) return false
  if (shortToks.length > longToks.length) return false
  const longSet = new Set(longToks)
  return shortToks.every((t) => longSet.has(t))
}

/** Primeiro + último token — útil quando 0021 manda nome completo e 0126 manda apelido+sobrenome. */
export function firstAndLastTokenKey(key: string): string | null {
  const tokens = proNameTokens(key)
  if (tokens.length < 2) return null
  return `${tokens[0]} ${tokens[tokens.length - 1]}`
}

/** first+last só com tokens significativos (pula "da"/"de" no meio do sobrenome). */
export function firstAndLastSignificantKey(key: string): string | null {
  const tokens = significantNameTokens(key)
  if (tokens.length < 2) return null
  return `${tokens[0]} ${tokens[tokens.length - 1]}`
}

/** Distância de edição (Levenshtein) — só para tokens curtos de sobrenome. */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  const prev = new Array<number>(b.length + 1)
  const cur = new Array<number>(b.length + 1)
  for (let j = 0; j <= b.length; j++) prev[j] = j
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      cur[j] = Math.min(cur[j - 1]! + 1, prev[j]! + 1, prev[j - 1]! + cost)
    }
    for (let j = 0; j <= b.length; j++) prev[j] = cur[j]!
  }
  return prev[b.length]!
}

/**
 * Prenome igual + sobrenome do nome curto ≈ algum token do longo (≤1 edição, len≥4).
 * Ex.: "lucas kampos" ↔ "lucas campos de macedo" (kampos≈campos).
 */
export function isFuzzyLastSignificantMatch(a: string, b: string): boolean {
  const ta = significantNameTokens(a)
  const tb = significantNameTokens(b)
  if (ta.length < 2 || tb.length < 2) return false
  if (ta[0] !== tb[0]) return false
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta]
  const needle = short[short.length - 1]!
  if (needle.length < 4) return false
  return long.slice(1).some((tok) => tok.length >= 4 && editDistance(needle, tok) <= 1)
}

/**
 * Chave canônica para fundir 0021↔0126: normaliza + tira cargo.
 */
export function occupancyMergeKey(name: string): string {
  return normalizeProKey(stripCargoSuffix(name))
}

/**
 * Procura profissional já no mapa por chave exata, first+last, ou prefixo.
 * Só retorna se houver exatamente um candidato — não inventa match ambíguo.
 */
export function findNearProInMap<T>(
  byPro: Map<string, T>,
  rawName: string,
): { key: string; value: T } | null {
  const key = occupancyMergeKey(rawName)
  if (!key) return null

  const exact = byPro.get(key)
  if (exact) return { key, value: exact }

  const fl = firstAndLastTokenKey(key)
  const flSig = firstAndLastSignificantKey(key)
  const candidates: { key: string; value: T }[] = []

  for (const [k, value] of byPro) {
    if (!k) continue
    if (k === key) return { key: k, value }

    const kFl = firstAndLastTokenKey(k)
    if (fl && kFl && fl === kFl) {
      candidates.push({ key: k, value })
      continue
    }

    const kFlSig = firstAndLastSignificantKey(k)
    if (flSig && kFlSig && flSig === kFlSig) {
      candidates.push({ key: k, value })
      continue
    }

    // Apelido ⊂ nome completo (ex.: "mauricio carvalho" ⊂ "mauricio de carvalho lima").
    if (isSignificantTokenSubset(key, k) || isSignificantTokenSubset(k, key)) {
      candidates.push({ key: k, value })
      continue
    }

    // Sobrenome com typo leve (kampos/campos) — só se único.
    if (isFuzzyLastSignificantMatch(key, k)) {
      candidates.push({ key: k, value })
      continue
    }

    // Prefixo / contains unidirecional (ex.: "vitor" ↔ "vitor m").
    if (key.startsWith(k + ' ') || k.startsWith(key + ' ')) {
      candidates.push({ key: k, value })
    }
  }

  // Dedup por key
  const unique = new Map(candidates.map((c) => [c.key, c]))
  if (unique.size === 1) {
    const only = [...unique.values()][0]!
    return only
  }
  return null
}

/**
 * Associa nome Avec → profissional do portfólio.
 * Ordem: avec_pro_id exato → chave normalizada → contém / prefixo.
 */
export function matchDirectorProfessional(
  avecName: string,
  professionals: DirectorProfessional[],
): DirectorProfessional | null {
  const raw = avecName.trim()
  if (!raw) return null

  const byId = professionals.find((p) => p.avec_pro_id && p.avec_pro_id === raw)
  if (byId) return byId

  const key = occupancyMergeKey(raw)
  if (!key) return null

  const exact = professionals.find((p) => occupancyMergeKey(p.name) === key)
  if (exact) return exact

  const fl = firstAndLastTokenKey(key)
  const flSig = firstAndLastSignificantKey(key)

  // Match parcial por prefixo/substring / first+last / subconjunto (ex.: "Vitor M" ↔ "Vitor").
  // Se mais de um profissional do portfólio bater com o mesmo nome parcial
  // (ex.: dois "Lucas"), não adivinha — melhor faturamento não atribuído do
  // que atribuído ao profissional errado silenciosamente.
  const partialMatches = professionals.filter((p) => {
    const pk = occupancyMergeKey(p.name)
    if (!pk) return false
    if (key === pk || key.startsWith(pk + ' ') || pk.startsWith(key + ' ') || key.includes(pk)) {
      return true
    }
    const pFl = firstAndLastTokenKey(pk)
    if (fl && pFl && fl === pFl) return true
    const pFlSig = firstAndLastSignificantKey(pk)
    if (flSig && pFlSig && flSig === pFlSig) return true
    if (isSignificantTokenSubset(key, pk) || isSignificantTokenSubset(pk, key)) return true
    return isFuzzyLastSignificantMatch(key, pk)
  })
  return partialMatches.length === 1 ? partialMatches[0]! : null
}
