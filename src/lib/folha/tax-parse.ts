/**
 * Extrai DARF / DAS / mensalidade de texto de e-mail (paste, IMAP, PDF anexo).
 * Não depende de credenciais — o cron IMAP entrega subject+body+filenames aqui.
 */

import { extractCnpjFromText } from '@/lib/folha/tax-cnpj'

export type FolhaTaxKind = 'darf' | 'das' | 'mensalidade' | 'other'

export type ParsedFolhaTaxDocument = {
  kind: FolhaTaxKind
  amount: number | null
  professional_name: string | null
  /** 14 dígitos quando o documento traz CNPJ legível. */
  cnpj: string | null
  confidence: 'high' | 'medium' | 'low'
}

/** R$ 1.234,56 | 1234,56 | 1234.56 */
export function parseBrlAmount(raw: string): number | null {
  const m = raw.match(/R\$\s*([\d.]+,\d{2})|([\d.]+,\d{2})|(\d+\.\d{2})/)
  if (!m) return null
  const token = (m[1] ?? m[2] ?? m[3] ?? '').trim()
  if (!token) return null
  if (token.includes(',')) {
    const n = Number(token.replace(/\./g, '').replace(',', '.'))
    return Number.isFinite(n) ? n : null
  }
  const n = Number(token)
  return Number.isFinite(n) ? n : null
}

function detectKind(text: string): FolhaTaxKind {
  const t = text.toLowerCase()
  if (/\bdarf\b/.test(t)) return 'darf'
  if (/\bdas\b/.test(t) || /simples nacional/.test(t)) return 'das'
  if (/mensalidade/.test(t) && /contab/.test(t)) return 'mensalidade'
  if (/mensalidade/.test(t)) return 'mensalidade'
  return 'other'
}

/** Tenta achar "Profissional: Nome" / "Nome: Fulano" perto do valor. */
function guessProfessionalName(text: string): string | null {
  const patterns = [
    /profissional\s*[:\-]\s*([A-Za-zÀ-ÿ' ]{3,80})/i,
    /contribuinte\s*[:\-]\s*([A-Za-zÀ-ÿ' ]{3,80})/i,
    /nome\s*[:\-]\s*([A-Za-zÀ-ÿ' ]{3,80})/i,
  ]
  for (const re of patterns) {
    const m = text.match(re)
    const name = m?.[1]?.trim()
    if (name && !/darf|das|valor|cpf/i.test(name)) return name
  }
  return null
}

function guessNameFromFilename(fileName: string): string | null {
  const base = fileName
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[_]+/g, ' ')
    .trim()
  const head = (base.split(/\s[-–—]\s/)[0] ?? '').trim()
  if (head.length >= 3 && !/darf|das|guia|mensalidade|simples|inss|parc/i.test(head)) {
    return head
  }
  return null
}

export function parseFolhaTaxEmail(input: {
  subject?: string | null
  body: string
  filenames?: string[] | null
}): ParsedFolhaTaxDocument {
  const subject = input.subject?.trim() ?? ''
  const body = input.body.trim()
  const files = (input.filenames ?? []).join('\n')
  const blob = `${subject}\n${files}\n${body}`
  const kind = detectKind(blob)

  // Prefer amount near the kind keyword; fallback first money in text.
  let amount: number | null = null
  const kindRe =
    kind === 'darf'
      ? /darf[\s\S]{0,80}?(R\$\s*[\d.]+,\d{2}|[\d.]+,\d{2})/i
      : kind === 'das'
        ? /das[\s\S]{0,80}?(R\$\s*[\d.]+,\d{2}|[\d.]+,\d{2})/i
        : kind === 'mensalidade'
          ? /mensalidade[\s\S]{0,80}?(R\$\s*[\d.]+,\d{2}|[\d.]+,\d{2})/i
          : null
  if (kindRe) {
    const near = blob.match(kindRe)
    if (near?.[1]) amount = parseBrlAmount(near[1])
  }
  if (amount == null) amount = parseBrlAmount(blob)

  const professional_name =
    guessProfessionalName(blob) ??
    (input.filenames ?? []).map(guessNameFromFilename).find((n) => n != null) ??
    null
  const cnpj = extractCnpjFromText(blob)
  const confidence: ParsedFolhaTaxDocument['confidence'] =
    kind !== 'other' && amount != null
      ? cnpj || professional_name
        ? 'high'
        : 'medium'
      : 'low'

  return { kind, amount, professional_name, cnpj, confidence }
}

/** Mapeia tipo do e-mail → campo em folha_extras (Q1 / dia 20). */
export function taxKindToExtrasKey(
  kind: FolhaTaxKind,
): 'darf' | 'das' | 'mensalidade_contabilidade' | null {
  switch (kind) {
    case 'darf':
      return 'darf'
    case 'das':
      return 'das'
    case 'mensalidade':
      return 'mensalidade_contabilidade'
    case 'other':
      return null
    default: {
      const _exhaustive: never = kind
      return _exhaustive
    }
  }
}
