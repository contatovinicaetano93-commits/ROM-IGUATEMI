/**
 * Match do nome do e-mail/PDF fiscal → linha da Folha.
 * Aceita nome completo e abreviações (M. G. DOS SANTOS).
 * Só devolve hit único — ambíguo = null (não aplica).
 */

import {
  firstNameCompatible,
  namesLooselyMatch,
  occupancyMergeKey,
  significantNameTokens,
  surnameCompatible,
} from '@/lib/director-report/match-pro'

/** Tokens de documento/mês que vêm no nome do PDF e não são pessoa. */
const TAX_NOISE_TOKENS = new Set([
  'darf',
  'das',
  'inss',
  'irrf',
  'guia',
  'mensalidade',
  'contabilidade',
  'contabil',
  'simples',
  'nacional',
  'parc',
  'parcela',
  'imposto',
  'impostos',
  'documento',
  'disponivel',
  'email',
])

function isInitialToken(token: string): boolean {
  return token.length === 1 && /^[a-z]$/.test(token)
}

/** SET26 / AGO2026 / 09-2026 — competência no arquivo, não nome. */
function isPeriodNoiseToken(token: string): boolean {
  if (/^\d{1,2}$/.test(token)) return true
  if (/^\d{4}$/.test(token)) return true
  if (/^(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)\d{2,4}$/.test(token)) {
    return true
  }
  return false
}

function queryNameTokens(queryKey: string): string[] {
  return significantNameTokens(queryKey).filter(
    (t) => !TAX_NOISE_TOKENS.has(t) && !isPeriodNoiseToken(t),
  )
}

/** Iniciais + sobrenome (ex.: M. G. DOS SANTOS). */
function folhaTaxInitialsMatch(queryKey: string, candidateKey: string): boolean {
  const qt = queryNameTokens(queryKey)
  const ct = significantNameTokens(candidateKey)
  if (qt.length < 2 || ct.length < 2) return false
  if (!qt.some(isInitialToken)) return false

  const qLast = qt[qt.length - 1]!
  if (isInitialToken(qLast) || qLast.length < 2) return false

  const cLast = ct[ct.length - 1]!
  const surnameOk =
    surnameCompatible(qLast, cLast) ||
    ct.some((t) => !isInitialToken(t) && t.length >= 2 && surnameCompatible(qLast, t))
  if (!surnameOk) return false

  const qLead = qt.slice(0, -1)
  const cLead = ct.slice(0, -1)
  let ci = 0
  for (const q of qLead) {
    let found = false
    while (ci < cLead.length) {
      const c = cLead[ci]!
      ci += 1
      if (isInitialToken(q)) {
        if (c.startsWith(q)) {
          found = true
          break
        }
        continue
      }
      if (firstNameCompatible(q, c, 2) || surnameCompatible(q, c)) {
        found = true
        break
      }
    }
    if (!found) return false
  }
  return true
}

export type FolhaTaxNameMatchTier = 'exact' | 'loose' | 'initials'

/** Melhor tier de match query→candidato, ou null. */
export function folhaTaxNameMatchTier(
  query: string,
  candidate: string,
): FolhaTaxNameMatchTier | null {
  const qKey = occupancyMergeKey(query)
  const cKey = occupancyMergeKey(candidate)
  if (!qKey || !cKey) return null
  if (qKey === cKey) return 'exact'
  if (namesLooselyMatch(qKey, cKey)) return 'loose'
  if (folhaTaxInitialsMatch(qKey, cKey)) return 'initials'
  return null
}

/**
 * Query (e-mail/PDF) casa com candidato (linha Folha)?
 * Inclui iniciais + sobrenome, além do match frouxo já usado no salão.
 */
export function folhaTaxNameMatches(query: string, candidate: string): boolean {
  return folhaTaxNameMatchTier(query, candidate) != null
}

/**
 * Nome da linha Folha que casa de forma única.
 * Prioridade: exact > loose > initials (evita Mauri Lima roubar Mauricio…).
 */
export function findUniqueFolhaTaxLineName(
  lineNames: readonly string[],
  professionalName: string,
): string | null {
  const exact: string[] = []
  const loose: string[] = []
  const initials: string[] = []
  const seenExact = new Set<string>()
  const seenLoose = new Set<string>()
  const seenInitials = new Set<string>()

  for (const name of lineNames) {
    const tier = folhaTaxNameMatchTier(professionalName, name)
    if (!tier) continue
    const key = occupancyMergeKey(name) || name
    if (tier === 'exact') {
      if (seenExact.has(key)) continue
      seenExact.add(key)
      exact.push(name)
      continue
    }
    if (tier === 'loose') {
      if (seenLoose.has(key) || seenExact.has(key)) continue
      seenLoose.add(key)
      loose.push(name)
      continue
    }
    if (seenInitials.has(key) || seenExact.has(key) || seenLoose.has(key)) continue
    seenInitials.add(key)
    initials.push(name)
  }

  if (exact.length === 1) return exact[0]!
  if (exact.length > 1) return null
  if (loose.length === 1) return loose[0]!
  if (loose.length > 1) return null
  if (initials.length === 1) return initials[0]!
  return null
}
