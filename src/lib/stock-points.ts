/** Locais ROM de distribuição — Almox (retirada) + Piso 1/2/3. */

export const ROM_POINT_CODES = ['almox', 'piso_1', 'piso_2', 'piso_3'] as const
export type RomPointCode = (typeof ROM_POINT_CODES)[number]

export type RomPointKind = 'almox' | 'piso'

export const ROM_POINT_SEED: ReadonlyArray<{
  rom_code: RomPointCode
  rom_kind: RomPointKind
  name: string
}> = [
  { rom_code: 'almox', rom_kind: 'almox', name: 'Almoxarifado' },
  { rom_code: 'piso_1', rom_kind: 'piso', name: 'Piso 1' },
  { rom_code: 'piso_2', rom_kind: 'piso', name: 'Piso 2' },
  { rom_code: 'piso_3', rom_kind: 'piso', name: 'Piso 3' },
]

export type PointBalanceRow = {
  location_id: string
  rom_code: string | null
  rom_kind: RomPointKind | null
  name: string
  qty: number
}

/**
 * Almox = Avec − soma dos pisos.
 * Se os pisos passam do Avec, Almox fica 0 e sobra drift (inventário corrige).
 */
export function almoxQtyFromAvec(avecQty: number, floorsSum: number): {
  almox: number
  drift: number
} {
  const avec = Number.isFinite(avecQty) ? Math.max(0, avecQty) : 0
  const floors = Number.isFinite(floorsSum) ? Math.max(0, floorsSum) : 0
  const raw = avec - floors
  if (raw >= 0) return { almox: raw, drift: 0 }
  return { almox: 0, drift: Math.round((floors - avec) * 1000) / 1000 }
}

export function sumPointQtys(rows: readonly { qty: number }[]): number {
  return rows.reduce((acc, row) => acc + (Number(row.qty) || 0), 0)
}

export function assertTransferOk(input: {
  fromKind: RomPointKind | null
  toKind: RomPointKind | null
  fromQty: number
  quantity: number
}): string | null {
  if (!(input.quantity > 0)) return 'Quantidade inválida'
  if (input.fromQty < input.quantity) return 'Saldo insuficiente na origem'
  // Fase 1: distribuição típica Almox → Piso (retorno Piso → Almox ok).
  if (input.fromKind === 'piso' && input.toKind === 'piso') {
    return 'Na fase 1, transfira pelo Almoxarifado (Piso → Almox → Piso)'
  }
  return null
}
