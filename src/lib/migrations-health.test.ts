import { describe, expect, it } from 'vitest'
import { migrationsPendingHealthOk } from './migrations'

describe('migrationsPendingHealthOk', () => {
  it('fica RED em produção quando há migrations pendentes', () => {
    expect(
      migrationsPendingHealthOk({ isProduction: true, pendingCount: 3 }),
    ).toBe(false)
  })

  it('fica verde em produção quando pending = 0', () => {
    expect(
      migrationsPendingHealthOk({ isProduction: true, pendingCount: 0 }),
    ).toBe(true)
  })

  it('não inventa vermelho fora de produção', () => {
    expect(
      migrationsPendingHealthOk({ isProduction: false, pendingCount: 5 }),
    ).toBe(true)
  })

  it('não inventa vermelho quando o probe falhou (null)', () => {
    expect(
      migrationsPendingHealthOk({ isProduction: true, pendingCount: null }),
    ).toBe(true)
  })
})
