/**
 * Alíquotas da Planilha Base RH (apresentação Folha).
 * Fonte: fixtures/rh-commission-rates.json (abas BRASIL / IGUATEMI).
 */

import type { RomPanelId } from '@/lib/brand'
import ratesJson from '@/lib/folha/fixtures/rh-commission-rates.json'

export type RhCommissionRow = {
  name: string
  cpf: string | null
  cnpj: string | null
  cargo: string | null
  comissao: number | null
}

type RatesFile = {
  brasil: RhCommissionRow[]
  iguatemi: RhCommissionRow[]
}

const RATES = ratesJson as RatesFile

function foldName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function digits(value: string | null | undefined): string {
  return (value ?? '').replace(/\D/g, '')
}

export function listRhCommissionRates(panel: RomPanelId): readonly RhCommissionRow[] {
  return panel === 'iguatemi' ? RATES.iguatemi : RATES.brasil
}

/**
 * Fallback por cargo quando o nome não está na Planilha Base (moda da planilha).
 */
export function defaultComissaoForCargo(cargo: string | null | undefined): number | null {
  const s = (cargo ?? '').trim().toLowerCase()
  if (!s) return null
  if (s.includes('assist') || s.includes('multiplica')) return 0.1
  if (s.includes('color')) return 0.13
  if (s.includes('maqui')) return 0.6
  if (s.includes('manic')) return 0.5
  if (s.includes('estetic')) return 0.5
  if (s.includes('cabel') || s.includes('profissional')) return 0.5
  return null
}

/**
 * Resolve alíquota do profissional na Planilha Base.
 * Ordem: CNPJ → CPF → nome normalizado → fallback por cargo.
 */
export function resolveRhCommissionRate(args: {
  panel: RomPanelId
  name: string | null | undefined
  cpf?: string | null
  cnpj?: string | null
  cargo?: string | null
}): number | null {
  const rows = listRhCommissionRates(args.panel)
  const cnpj = digits(args.cnpj)
  if (cnpj.length >= 14) {
    const hit = rows.find((r) => digits(r.cnpj) === cnpj && r.comissao != null)
    if (hit?.comissao != null) return hit.comissao
  }
  const cpf = digits(args.cpf)
  if (cpf.length >= 11) {
    const hit = rows.find((r) => digits(r.cpf) === cpf && r.comissao != null)
    if (hit?.comissao != null) return hit.comissao
  }
  const key = foldName(args.name ?? '')
  if (key) {
    const hit = rows.find((r) => foldName(r.name) === key && r.comissao != null)
    if (hit?.comissao != null) return hit.comissao
  }
  return defaultComissaoForCargo(args.cargo)
}
