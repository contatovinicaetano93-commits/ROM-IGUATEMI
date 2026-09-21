import { describe, expect, it } from 'vitest'
import {
  filterByOwnedContactIds,
  filterByProfessionalName,
  professionalNameOwns,
  professionalNamesMatch,
  professionalScopeCacheKey,
} from '@/lib/intranet/professional-scope'

describe('professionalNamesMatch', () => {
  it('ignora case e acentos', () => {
    expect(professionalNamesMatch('Alison Alvarez', 'alison alvarez')).toBe(true)
    expect(professionalNamesMatch('José Silva', 'jose silva')).toBe(true)
  })

  it('rejeita nomes diferentes', () => {
    expect(professionalNamesMatch('Alison Alvarez', 'Allan Vinicius')).toBe(false)
    expect(professionalNamesMatch('Alison', null)).toBe(false)
  })
})

describe('professionalNameOwns', () => {
  it('casa Romeu com Romeu Felipe (variantes Avec)', () => {
    expect(professionalNameOwns('Romeu', 'Romeu Felipe')).toBe(true)
    expect(professionalNameOwns('Romeu Felipe', 'Romeu Felipe')).toBe(true)
    expect(professionalNameOwns('romeu felipe', 'Romeu Felipe')).toBe(true)
  })

  it('não casa profissional errado', () => {
    expect(professionalNameOwns('Aline Jabur', 'Romeu Felipe')).toBe(false)
    expect(professionalNameOwns(null, 'Romeu Felipe')).toBe(false)
  })
})

describe('filterByProfessionalName', () => {
  it('mantém só a agenda do profissional (inclui variante frouxa)', () => {
    const rows = [
      { id: '1', professional_name: 'Alison Alvarez' },
      { id: '2', professional_name: 'Aline Jabur' },
      { id: '3', professional_name: 'alison alvarez' },
      { id: '4', professional_name: 'Alison' },
    ]
    expect(filterByProfessionalName(rows, 'Alison Alvarez').map((r) => r.id)).toEqual([
      '1',
      '3',
      '4',
    ])
  })
})

describe('filterByOwnedContactIds', () => {
  it('mantém só contatos do conjunto do profissional', () => {
    const rows = [
      { contact_id: 'a', contact_phone: '11999990001' },
      { contact_id: 'b', contact_phone: '11999990002' },
      { contact_id: 'c', contact_phone: '11999990003' },
    ]
    expect(filterByOwnedContactIds(rows, ['a', 'c']).map((r) => r.contact_id)).toEqual(['a', 'c'])
  })

  it('lista vazia de owned → nada', () => {
    expect(filterByOwnedContactIds([{ contact_id: 'a' }], [])).toEqual([])
  })
})

describe('professionalScopeCacheKey', () => {
  it('normaliza acentos e distingue unidade', () => {
    expect(professionalScopeCacheKey(null)).toBe('all')
    expect(professionalScopeCacheKey('José Silva')).toBe(professionalScopeCacheKey('jose silva'))
    expect(professionalScopeCacheKey('Alison')).not.toBe('all')
  })
})
