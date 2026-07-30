import { describe, expect, it } from 'vitest'
import {
  isOmieNonOperatingCategoryCode,
  isOmieNonOperatingExpense,
} from '@/lib/omie/expense-filter'

describe('omie expense-filter (chart-aware BR/IG)', () => {
  it('exclui TED / movimentações 2.16.*', () => {
    expect(isOmieNonOperatingCategoryCode('2.16.99')).toBe(true)
    expect(
      isOmieNonOperatingExpense({
        source: 'omie',
        categoryCode: '2.16.99',
        description: 'Serviços (salão) · TED entre contas',
      }),
    ).toBe(true)
  })

  it('exclui adiantamento/distribuição 2.17.* (BR e IG)', () => {
    expect(isOmieNonOperatingCategoryCode('2.17.99')).toBe(true)
    expect(
      isOmieNonOperatingExpense({
        source: 'omie',
        categoryCode: '2.17.99',
        categoryName: 'Adiantamento de Lucro',
      }),
    ).toBe(true)
  })

  it('não exclui 2.18 amortização do BR só pelo código', () => {
    expect(isOmieNonOperatingCategoryCode('2.18.99')).toBe(false)
  })

  it('exclui adiantamento IG 2.18 pelo nome da categoria', () => {
    expect(
      isOmieNonOperatingExpense({
        source: 'omie',
        categoryCode: '2.18.99',
        categoryName: 'Adiantamento de Lucro',
        description: 'Serviços (salão) · Adiantamento de Lucro · 52.920.265/0001-01',
      }),
    ).toBe(true)
  })

  it('exclui mútuos e distribuição de lucro por nome', () => {
    expect(
      isOmieNonOperatingExpense({
        source: 'omie',
        categoryCode: '2.16.93',
        description: 'Serviços (salão) · Mutuo Baru Iguatemi',
      }),
    ).toBe(true)
    expect(
      isOmieNonOperatingExpense({
        source: 'omie',
        categoryCode: '2.17.99',
        description: 'Serviços (salão) · Distribuição de Lucro',
      }),
    ).toBe(true)
  })

  it('mantém despesas operacionais', () => {
    expect(isOmieNonOperatingCategoryCode('2.11.99')).toBe(false)
    expect(isOmieNonOperatingCategoryCode('2.10.99')).toBe(false)
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
