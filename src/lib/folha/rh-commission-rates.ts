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
 * Resolve alíquota do profissional na Planilha Base.
 * Ordem: CNPJ → CPF → nome normalizado.
 * Linha achada com alíquota em branco, ou nome fora da planilha → null.
 * Cargo não inventa % (KPI ausente).
 */
export function resolveRhCommissionRate(args: {
  panel: RomPanelId
  name: string | null | undefined
  cpf?: string | null
  cnpj?: string | null
  /** Ignorado de propósito: não há moda por cargo. */
  cargo?: string | null
}): number | null {
  const rows = listRhCommissionRates(args.panel)
  const cnpj = digits(args.cnpj)
  if (cnpj.length >= 14) {
    const hit = rows.find((r) => digits(r.cnpj) === cnpj)
    if (hit) return hit.comissao
  }
  const cpf = digits(args.cpf)
  if (cpf.length >= 11) {
    const hit = rows.find((r) => digits(r.cpf) === cpf)
    if (hit) return hit.comissao
  }
  const key = foldName(args.name ?? '')
  if (key) {
    const hit = rows.find((r) => foldName(r.name) === key)
    if (hit) return hit.comissao
  }
  return null
}
