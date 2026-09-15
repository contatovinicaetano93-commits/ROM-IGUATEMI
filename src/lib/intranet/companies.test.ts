import { describe, expect, it } from 'vitest'
import { companiesForPanel, isCompanyAllowedOnPanel } from '@/lib/intranet/companies'

describe('intranet companies por unidade', () => {
  it('Brasil tem Baru Brasil, Concept Brasil e Henrique e Romeo — sem Iguatemi', () => {
    const ids = companiesForPanel('brasil').map((c) => c.id)
    expect(ids).toEqual(['cmp_baru_brasil', 'cmp_concept_brasil', 'cmp_henrique_romeo'])
    expect(isCompanyAllowedOnPanel('brasil', 'cmp_baru_iguatemi')).toBe(false)
    expect(isCompanyAllowedOnPanel('brasil', 'cmp_academy')).toBe(false)
  })

  it('Iguatemi tem Baru Iguatemi, Concept Iguatemi e Henrique e Romeo — sem Brasil', () => {
    const ids = companiesForPanel('iguatemi').map((c) => c.id)
    expect(ids).toEqual(['cmp_baru_iguatemi', 'cmp_concept_iguatemi', 'cmp_henrique_romeo'])
    expect(isCompanyAllowedOnPanel('iguatemi', 'cmp_baru_brasil')).toBe(false)
  })
})
