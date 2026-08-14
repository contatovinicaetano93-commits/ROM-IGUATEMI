import { describe, expect, it } from 'vitest'
import { computeDayClientMix } from './day-client-mix'

/**
 * Smoke: a função exporta shape estável. Integração com DB fica no sync.
 * (vitest unit sem DB — só garante o módulo carrega.)
 */
describe('computeDayClientMix', () => {
  it('exporta função', () => {
    expect(typeof computeDayClientMix).toBe('function')
  })
})
