import { describe, expect, it } from 'vitest'
import {
  hintKeywordsFromText,
  normalizeKeywords,
  searchTokens,
} from '@/lib/curriculos/search'

describe('curriculos search helpers', () => {
  it('tokeniza query ignorando miúdos', () => {
    expect(searchTokens('  Manicure, spa  ')).toEqual(['manicure', 'spa'])
    expect(searchTokens('a b xx')).toEqual(['xx'])
  })

  it('normaliza keywords', () => {
    expect(normalizeKeywords([' Manicure ', 'manicure', 'SPA'])).toEqual([
      'manicure',
      'spa',
    ])
  })

  it('extrai hints de cargo do texto', () => {
    const keys = hintKeywordsFromText('Experiência como Manicure e Recepção em spa')
    expect(keys).toContain('manicure')
    expect(keys).toContain('recepcao')
  })
})
