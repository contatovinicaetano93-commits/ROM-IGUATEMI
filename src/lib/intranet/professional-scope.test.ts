import { describe, expect, it } from 'vitest'
import {
  filterByProfessionalName,
  professionalNamesMatch,
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

describe('filterByProfessionalName', () => {
  it('mantém só a agenda do profissional', () => {
    const rows = [
      { id: '1', professional_name: 'Alison Alvarez' },
      { id: '2', professional_name: 'Aline Jabur' },
      { id: '3', professional_name: 'alison alvarez' },
    ]
    expect(filterByProfessionalName(rows, 'Alison Alvarez').map((r) => r.id)).toEqual(['1', '3'])
  })
})
