import { describe, expect, it } from 'vitest'
import {
  isAvecOpenStatus,
  isAvecPaidStatus,
  isAvecUnpaidStatus,
} from '@/lib/avec/appointment-status'

describe('isAvecPaidStatus', () => {
  it('reconhece pago / finalizado / atendido', () => {
    expect(isAvecPaidStatus('pago')).toBe(true)
    expect(isAvecPaidStatus('Pago')).toBe(true)
    expect(isAvecPaidStatus('finalizado')).toBe(true)
    expect(isAvecPaidStatus('atendido')).toBe(true)
    expect(isAvecPaidStatus('realizada')).toBe(true)
  })

  it('não trata "não pago" / "nao pago" como pago', () => {
    expect(isAvecUnpaidStatus('não pago')).toBe(true)
    expect(isAvecUnpaidStatus('nao pago')).toBe(true)
    expect(isAvecPaidStatus('não pago')).toBe(false)
    expect(isAvecPaidStatus('nao pago')).toBe(false)
    expect(isAvecPaidStatus('status: não pago')).toBe(false)
  })

  it('não trata Em Atendimento / A Realizar como pago', () => {
    expect(isAvecOpenStatus('em atendimento')).toBe(true)
    expect(isAvecPaidStatus('em atendimento')).toBe(false)
    expect(isAvecPaidStatus('a realizar')).toBe(false)
  })
})
