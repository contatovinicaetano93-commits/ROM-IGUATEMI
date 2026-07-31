import { describe, expect, it } from 'vitest'
import { resolveAvecFinishStatus } from '@/lib/avec/sync'

function baseStats(overrides: Partial<Parameters<typeof resolveAvecFinishStatus>[0]> = {}) {
  return {
    errors: [] as string[],
    warnings: [] as string[],
    clients_upserted: 0,
    appointments_synced: 0,
    attendances_synced: 0,
    revenue_rows: 0,
    cancellation_rows: 0,
    ...overrides,
  }
}

describe('resolveAvecFinishStatus', () => {
  it('retorna ok sem erros/hard warnings/abort', () => {
    expect(resolveAvecFinishStatus(baseStats({ revenue_rows: 3 }))).toBe('ok')
  })

  it('retorna error sem progresso core', () => {
    expect(resolveAvecFinishStatus(baseStats({ errors: ['boom'] }))).toBe('error')
  })

  it('retorna partial com progresso core + erro', () => {
    expect(
      resolveAvecFinishStatus(
        baseStats({ errors: ['boom'], appointments_synced: 2 }),
      ),
    ).toBe('partial')
  })

  it('retorna partial quando aborted mesmo sem core rows', () => {
    expect(resolveAvecFinishStatus(baseStats({ aborted: true, errors: ['x'] }))).toBe('partial')
  })

  it('trata warning soft de orçamento + abort como partial', () => {
    expect(
      resolveAvecFinishStatus(
        baseStats({
          aborted: true,
          warnings: ['sync: orçamento esgotado em P1 (abort limpo)'],
          revenue_rows: 1,
        }),
      ),
    ).toBe('partial')
  })

  it('trata hard warning como partial', () => {
    expect(
      resolveAvecFinishStatus(
        baseStats({
          warnings: ['Relatório atendimentos (0002) atingiu o limite de 80 páginas'],
        }),
      ),
    ).toBe('partial')
  })
})
