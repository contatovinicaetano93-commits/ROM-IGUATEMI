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

const CARGO_TRAILING_RE =
  /\s+(cabeleireir[oa]s?|manicures?|coloristas?|barbeiros?|esteticistas?|assistentes?|don[oa]s?|gerentes?|profissionais?)\s*$/i

const NAME_PARTICLES = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'di', 'du', 'del', 'della'])

/** Remove sufixos de cargo comuns em relatórios Avec (ex.: "Ana Silva - Cabeleireira"). */
export function stripCargoSuffix(name: string): string {
  return name
    .replace(CARGO_SUFFIX_RE, '')
    .replace(CARGO_PAREN_RE, '')
    .replace(CARGO_TRAILING_RE, '')
    .trim()
}

export function proNameTokens(key: string): string[] {
  return key.split(/\s+/).filter(Boolean)
}

/** Tokens úteis para match (ignora de/da/do…). */
export function significantNameTokens(key: string): string[] {
  return proNameTokens(key).filter((t) => !NAME_PARTICLES.has(t))
}

/** Primeiro + último token — útil quando 0021 manda nome completo e 0126 manda apelido+sobrenome. */
export function firstAndLastTokenKey(key: string): string | null {
  const tokens = proNameTokens(key)
  if (tokens.length < 2) return null
  return `${tokens[0]} ${tokens[tokens.length - 1]}`
}

/**
 * Chave canônica para fundir 0021↔0126: normaliza + tira cargo.
 * Pontos em apelidos Avec (`LUCAS.KAMPOS`) viram espaço via normalizeProKey.
 */
export function occupancyMergeKey(name: string): string {
  return normalizeProKey(stripCargoSuffix(name))
}

function editDistanceAtMost1(a: string, b: string): boolean {
  if (a === b) return true
  const la = a.length
  const lb = b.length
  if (Math.abs(la - lb) > 1) return false
  if (la === lb) {
    let diffs = 0
    for (let i = 0; i < la; i++) {
      if (a[i] !== b[i] && ++diffs > 1) return false
    }
    return diffs <= 1
  }
  const [shorter, longer] = la < lb ? [a, b] : [b, a]
  let i = 0
  let j = 0
  let skipped = 0
  while (i < shorter.length && j < longer.length) {
    if (shorter[i] === longer[j]) {
      i++
      j++
      continue
    }
    if (++skipped > 1) return false
    j++
  }
  return true
}

function sharedPrefixLen(a: string, b: string): number {
  const n = Math.min(a.length, b.length)
  let i = 0
  while (i < n && a[i] === b[i]) i++
  return i
}

/** Prenome / apelido vs primeiro token do nome completo. */
export function firstNameCompatible(nick: string, first: string, minPrefix = 3): boolean {
  if (!nick || !first) return false
  if (nick === first) return true
  const [short, long] = nick.length <= first.length ? [nick, first] : [first, nick]
  if (long.startsWith(short) && short.length >= minPrefix) return true
  if (long.endsWith(short) && short.length >= 4) return true
  // manu↔manoel: prefixo compartilhado ≥60% do apelido (evita jander↔janaina = 50%)
  if (short.length >= 4 && long.length >= 4) {
    const shared = sharedPrefixLen(short, long)
    if (shared >= 3 && shared / short.length >= 0.6) return true
  }
  if (short.length >= 5 && long.length >= 5 && editDistanceAtMost1(short, long)) return true
  return false
}

/** Sobrenome / token do meio: exato, typo ou inicial — sem prefixo frouxo. */
export function surnameCompatible(a: string, b: string): boolean {
  if (!a || !b) return false
  if (a === b) return true
  if (a.length === 1) return b.startsWith(a)
  if (b.length === 1) return a.startsWith(b)
  if (a.length >= 5 && b.length >= 5 && editDistanceAtMost1(a, b)) return true
  return false
}

const LEADING_COMPOUND = new Set(['maria', 'jose', 'ana', 'paulo', 'joao', 'luis', 'luiz'])

function primaryFirstToken(tokens: string[]): { first: string; rest: string[] } {
  if (tokens.length === 0) return { first: '', rest: [] }
  if (tokens.length >= 2 && LEADING_COMPOUND.has(tokens[0]!)) {
    return { first: tokens[1]!, rest: tokens.slice(2) }
  }
  return { first: tokens[0]!, rest: tokens.slice(1) }
}

function editDistance(a: string, b: string): number {
  if (a === b) return 0
  const la = a.length
  const lb = b.length
  if (la === 0) return lb
  if (lb === 0) return la
  const prev = new Array<number>(lb + 1)
  const cur = new Array<number>(lb + 1)
  for (let j = 0; j <= lb; j++) prev[j] = j
  for (let i = 1; i <= la; i++) {
    cur[0] = i
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + cost)
    }
    for (let j = 0; j <= lb; j++) prev[j] = cur[j]!
  }
  return prev[lb]!
}

/**
 * Apelido/nome curto do 0126 vs nome completo do 0021.
 * Âncora no prenome (1º token) + sobrenomes; evita dani↔dantas / jander↔janaina.
 */
export function namesLooselyMatch(aKey: string, bKey: string): boolean {
  const ta = significantNameTokens(aKey)
  const tb = significantNameTokens(bKey)
  if (ta.length === 0 || tb.length === 0) return false

  const [shorter, longer] = ta.length <= tb.length ? [ta, tb] : [tb, ta]
  const { first: longFirst } = primaryFirstToken(longer)

  // Apelido único (JANDER) ou colado (GABRIELPERTANELA).
  if (shorter.length === 1) {
    const nick = shorter[0]!
    if (nick.length < 4) return false

    // Colado prenome+sobrenome — exige resto ≈ último sobrenome (senão todo Gabriel casa).
    if (
      longer.length >= 2 &&
      longFirst.length >= 4 &&
      nick.startsWith(longFirst) &&
      nick.length >= longFirst.length + 4
    ) {
      const rem = nick.slice(longFirst.length)
      const last = longer[longer.length - 1]!
      return surnameCompatible(rem, last) || editDistance(rem, last) <= 2
    }

    // Apelido curto vs prenome — não aceitar nick muito maior que o prenome
    // (evita gabrielpertanela ↔ gabriela via prefixo compartilhado).
    if (nick.length > longFirst.length + 3) return false
    return firstNameCompatible(nick, longFirst)
  }

  const shortFirst = shorter[0]!
  const shortRest = shorter.slice(1)
  // Com sobrenome extra, aceita prefixo curto (lu↔luiza, ma↔marina).
  if (!firstNameCompatible(shortFirst, longFirst, shortRest.length > 0 ? 2 : 3)) return false

  const pool = longer.filter((t) => t !== longFirst)
  const used = new Set<number>()
  for (const s of shortRest) {
    let found = -1
    for (let i = 0; i < pool.length; i++) {
      if (used.has(i)) continue
      if (surnameCompatible(s, pool[i]!)) {
        found = i
        break
      }
    }
    if (found < 0) return false
    used.add(found)
  }
  return true
}

/**
 * Procura profissional já no mapa por chave exata, first+last, prefixo ou tokens frouxos.
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
  const candidates: { key: string; value: T }[] = []

  for (const [k, value] of byPro) {
    if (!k) continue
    if (k === key) return { key: k, value }

    const kFl = firstAndLastTokenKey(k)
    if (fl && kFl && fl === kFl) {
      candidates.push({ key: k, value })
      continue
    }

    // Prefixo / contains unidirecional (ex.: "vitor" ↔ "vitor m").
    if (key.startsWith(k + ' ') || k.startsWith(key + ' ')) {
      candidates.push({ key: k, value })
      continue
    }

    // Apelido 0126 ↔ nome completo 0021 (ex.: dani.mariniello ↔ daniela mariniello).
    if (namesLooselyMatch(key, k)) {
      candidates.push({ key: k, value })
    }
  }

  const unique = new Map(candidates.map((c) => [c.key, c]))
  if (unique.size === 1) {
    return [...unique.values()][0]!
  }
  return null
}

export type OccupancyMergeable = {
  name: string
  revenue: number
  attended: number
  ticket_avg: number
  occupancy: number | null
}

/**
 * Funde linhas órfãs de lotação (0126 apelido, sem faturamento) nas linhas de
 * faturamento (0021). Usado no sync e na leitura — corrige snapshots já gravados.
 */
export function coalesceProfessionalsOccupancy<T extends OccupancyMergeable>(pros: T[]): T[] {
  if (pros.length <= 1) return pros

  const withMoney: T[] = []
  const orphans: T[] = []
  for (const p of pros) {
    if (p.revenue > 0 || p.attended > 0) withMoney.push(p)
    else if (p.occupancy != null) orphans.push(p)
  }
  if (orphans.length === 0) return pros

  const byPro = new Map<string, T>()
  for (const p of withMoney) {
    const key = occupancyMergeKey(p.name)
    if (!key) continue
    const prev = byPro.get(key)
    if (!prev || p.revenue > prev.revenue) byPro.set(key, p)
  }

  const consumed = new Set<T>()
  for (const orphan of orphans) {
    const hit = findNearProInMap(byPro, orphan.name)
    if (!hit) continue
    if (hit.value.occupancy == null) hit.value.occupancy = orphan.occupancy
    consumed.add(orphan)
  }

  const leftoverOrphans = orphans.filter((o) => !consumed.has(o))
  return [...byPro.values(), ...leftoverOrphans].sort((a, b) => b.revenue - a.revenue)
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

  // Match parcial por prefixo/substring / first+last / tokens frouxos.
  // Se mais de um profissional do portfólio bater, não adivinha.
  const partialMatches = professionals.filter((p) => {
    const pk = occupancyMergeKey(p.name)
    if (!pk) return false
    if (key === pk || key.startsWith(pk + ' ') || pk.startsWith(key + ' ') || key.includes(pk)) {
      return true
    }
    const pFl = firstAndLastTokenKey(pk)
    if (fl && pFl && fl === pFl) return true
    return namesLooselyMatch(key, pk)
  })
  return partialMatches.length === 1 ? partialMatches[0]! : null
}
