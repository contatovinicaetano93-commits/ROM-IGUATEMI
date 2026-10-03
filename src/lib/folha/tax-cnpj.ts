/**
 * CNPJ no fluxo fiscal Folha: normaliza, extrai do PDF/e-mail e resolve
 * razão social da base mestre → linha da Folha (via match de nome).
 */

import { occupancyMergeKey } from '@/lib/director-report/match-pro'
import { FOLHA_TAX_CNPJ_MASTER } from '@/lib/folha/tax-cnpj-master'
import { findUniqueFolhaTaxLineName } from '@/lib/folha/tax-name-match'

const MASTER_BY_CNPJ = new Map(
  FOLHA_TAX_CNPJ_MASTER.map((e) => [e.cnpj, e] as const),
)

/**
 * Razão social ≠ nome da linha Folha — aliases curados (só hit único seguro).
 * Chave = CNPJ 14 dígitos.
 */
const FOLHA_TAX_CNPJ_ALIASES: Readonly<Record<string, readonly string[]>> = {
  // ALVAREZ FARIA CABELEIREIROS EIRELI → Alison Alvarez
  '14435894000157': ['Alison Alvarez'],
  // G M COLONNO CABELEIREIRO → Gustavo Colonno
  '42351027000179': ['Gustavo Colonno'],
  // LUCIMARY CABELEIREIRA - ME → Lucimary Cossenzo
  '19364259000140': ['Lucimary Cossenzo'],
  // MARCELO SABINO LUIZ JUNIOR → Marcelo Sabino Luis Junior
  '43011350000166': ['Marcelo Sabino Luis Junior'],
  // MARIA APARECIDA RODRIGUES SOUSA → Maria Aparecida Rodrigues
  '33581108000174': ['Maria Aparecida Rodrigues'],
  // MARIA AUXILIADORA RIBEIRO ALVES MANICURE → … Alci
  '07038057000129': ['Maria Auxiliadora Ribeiro Alves Alci'],
  // MARIA LUIZA BRITO SILVA CARVALHO CABELEI → Maria Luiza Brito Silva Carvalho
  '19037228000184': ['Maria Luiza Brito Silva Carvalho'],
  // ALBUQUERQUE CABELEIREIROS → Alan Fernando (só se único nas linhas)
  '11106752000158': [
    'Alan Fernando De Albuquerque',
    'Alan  Fernando De Albuquerque',
  ],
}

/** Só dígitos; null se não for CNPJ de 14 posições. */
export function normalizeCnpjDigits(raw: string | null | undefined): string | null {
  if (!raw) return null
  const d = raw.replace(/\D/g, '')
  return d.length === 14 ? d : null
}

/**
 * CNPJ usável como chave: 14 dígitos, não repetido, filial ≠ 0000.
 * (Filial 0000 na base mestre = placeholder / incompleto.)
 */
export function isUsableFolhaTaxCnpj(digits: string | null | undefined): boolean {
  if (!digits || !/^\d{14}$/.test(digits)) return false
  if (/^(\d)\1{13}$/.test(digits)) return false
  if (digits.slice(8, 12) === '0000') return false
  return true
}

const CNPJ_MASK_RE =
  /\b(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})\b/g

/** Extrai o primeiro CNPJ usável do texto (máscara ou 14 dígitos). */
export function extractCnpjFromText(text: string): string | null {
  if (!text.trim()) return null
  for (const m of text.matchAll(CNPJ_MASK_RE)) {
    const digits = normalizeCnpjDigits(m[1])
    if (isUsableFolhaTaxCnpj(digits)) return digits
  }
  // 14 dígitos colados (sem máscara), evita pegar telefone/CEP curtos
  for (const m of text.matchAll(/\b(\d{14})\b/g)) {
    if (isUsableFolhaTaxCnpj(m[1])) return m[1]!
  }
  return null
}

export function lookupFolhaTaxCnpjMaster(cnpjDigits: string) {
  return MASTER_BY_CNPJ.get(cnpjDigits) ?? null
}

/** Ruído societário / CPF colado na razão social. */
export function legalNameToMatchQuery(legalName: string): string {
  let s = legalName.trim()
  s = s.replace(/\b\d{11}\b/g, ' ')
  s = s.replace(
    /\b(LTDA|EIRELI|EPP|S\.?A\.?|S\/A|SS|ME)\b/gi,
    ' ',
  )
  s = s.replace(
    /\b(CABELEIREIR(?:O|A|OS|AS)|CAB(?:ELEIREIRO)?|SERV(?:ICOS?)?|COM[EÉ]RCIO|BELEZA|MAKEUP|EST[EÉ]TICA|HAIR|COMPANY|CONCEPT|DESENVOLVIMENTO|EDUCA[CÇ][AÃ]O|BEM[\s-]?ESTAR|SIGNATURA)\b/gi,
    ' ',
  )
  s = s.replace(/\s*[-–—,/]+\s*/g, ' ')
  s = s.replace(/\s+/g, ' ').trim()
  return s
}

/**
 * Resolve linha Folha: CNPJ (base mestre → nome) tem prioridade;
 * senão nome/iniciais do documento.
 */
export function resolveFolhaTaxLineName(args: {
  lineNames: readonly string[]
  professionalName?: string | null
  cnpj?: string | null
}): string | null {
  const cnpj = normalizeCnpjDigits(args.cnpj)
  if (isUsableFolhaTaxCnpj(cnpj)) {
    const aliases = FOLHA_TAX_CNPJ_ALIASES[cnpj!]
    if (aliases) {
      const hits: string[] = []
      const seen = new Set<string>()
      for (const alias of aliases) {
        const aliasKey = occupancyMergeKey(alias)
        const onPeriod = args.lineNames.find(
          (n) => n === alias || (aliasKey != null && occupancyMergeKey(n) === aliasKey),
        )
        if (!onPeriod) continue
        const key = occupancyMergeKey(onPeriod) || onPeriod
        if (seen.has(key)) continue
        seen.add(key)
        hits.push(onPeriod)
      }
      if (hits.length === 1) return hits[0]!
    }
    const entry = lookupFolhaTaxCnpjMaster(cnpj!)
    if (entry) {
      const queries = [entry.legalName, legalNameToMatchQuery(entry.legalName)].filter(
        (q, i, arr) => q.length >= 3 && arr.indexOf(q) === i,
      )
      for (const q of queries) {
        const hit = findUniqueFolhaTaxLineName(args.lineNames, q)
        if (hit) return hit
      }
    }
  }

  const name = args.professionalName?.trim()
  if (name) {
    return findUniqueFolhaTaxLineName(args.lineNames, name)
  }
  return null
}
