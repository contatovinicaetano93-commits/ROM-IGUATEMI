import { describe, expect, it } from 'vitest'
import {
  isOmieNonOperatingCategoryCode,
  isOmieNonOperatingExpense,
} from '@/lib/omie/expense-filter'

describe('omie expense-filter', () => {
  it('exclui TED / transferências 2.16.*', () => {
    expect(isOmieNonOperatingCategoryCode('2.16.99')).toBe(true)
    expect(isOmieNonOperatingCategoryCode('2.16')).toBe(true)
    expect(
      isOmieNonOperatingExpense({
        source: 'omie',
        categoryCode: '2.16.99',
        description: 'Serviços (salão) · TED entre contas',
      }),
    ).toBe(true)
  })

  it('exclui adiantamento de lucro 2.18.*', () => {
    expect(isOmieNonOperatingCategoryCode('2.18.99')).toBe(true)
    expect(
      isOmieNonOperatingExpense({
        source: 'omie',
        description: 'Serviços (salão) · Adiantamento de Lucro · 52.920.265/0001-01',
      }),
    ).toBe(true)
  })

  it('mantém despesas operacionais', () => {
    expect(isOmieNonOperatingCategoryCode('2.11.99')).toBe(false)
    expect(isOmieNonOperatingCategoryCode('2.04.02')).toBe(false)
    expect(
      isOmieNonOperatingExpense({
        source: 'omie',
        categoryCode: '2.11.99',
        description: 'Serviços (salão) · Comissões Parceiros',
      }),
    ).toBe(false)
    expect(
      isOmieNonOperatingExpense({
        source: 'manual',
        description: 'TED entre contas',
      }),
    ).toBe(false)
  })
})
