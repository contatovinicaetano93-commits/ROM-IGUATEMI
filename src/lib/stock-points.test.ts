import { describe, expect, it } from 'vitest'
import {
  almoxQtyFromAvec,
  assertTransferOk,
  sumPointQtys,
} from '@/lib/stock-points'

describe('almoxQtyFromAvec', () => {
  it('Almox = Avec − pisos quando cabe', () => {
    expect(almoxQtyFromAvec(100, 40)).toEqual({ almox: 60, drift: 0 })
    expect(almoxQtyFromAvec(10, 0)).toEqual({ almox: 10, drift: 0 })
  })

  it('pisos acima do Avec → Almox 0 + drift', () => {
    expect(almoxQtyFromAvec(50, 80)).toEqual({ almox: 0, drift: 30 })
  })
})

describe('assertTransferOk', () => {
  it('bloqueia piso→piso na fase 1', () => {
    expect(
      assertTransferOk({ fromKind: 'piso', toKind: 'piso', fromQty: 5, quantity: 1 }),
    ).toMatch(/Almoxarifado/)
  })

  it('permite Almox→piso e piso→Almox', () => {
    expect(
      assertTransferOk({ fromKind: 'almox', toKind: 'piso', fromQty: 5, quantity: 2 }),
    ).toBeNull()
    expect(
      assertTransferOk({ fromKind: 'piso', toKind: 'almox', fromQty: 3, quantity: 1 }),
    ).toBeNull()
  })

  it('bloqueia saldo insuficiente', () => {
    expect(
      assertTransferOk({ fromKind: 'almox', toKind: 'piso', fromQty: 1, quantity: 2 }),
    ).toMatch(/insuficiente/)
  })
})

describe('sumPointQtys', () => {
  it('soma saldos', () => {
    expect(sumPointQtys([{ qty: 1 }, { qty: 2.5 }, { qty: 0 }])).toBe(3.5)
  })
})
