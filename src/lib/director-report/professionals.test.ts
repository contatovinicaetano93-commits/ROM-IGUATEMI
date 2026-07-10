import { afterEach, describe, expect, it } from 'vitest'
import { listDirectorProfessionals } from './professionals'

const ORIGINAL_PANEL = process.env.ROM_PANEL

afterEach(() => {
  process.env.ROM_PANEL = ORIGINAL_PANEL
})

describe('listDirectorProfessionals — roster por unidade', () => {
  it('ROM_PANEL=brasil retorna o roster real do Brasil', () => {
    process.env.ROM_PANEL = 'brasil'
    const pros = listDirectorProfessionals()
    expect(pros.length).toBeGreaterThan(0)
    expect(pros.some((p) => p.name === 'Vitor M')).toBe(true)
  })

  it('ROM_PANEL=iguatemi retorna vazio (roster ainda não preenchido) sem quebrar', () => {
    process.env.ROM_PANEL = 'iguatemi'
    expect(listDirectorProfessionals()).toEqual([])
  })

  it('nunca mistura os dois rosters', () => {
    process.env.ROM_PANEL = 'iguatemi'
    const iguatemiNames = listDirectorProfessionals(false).map((p) => p.name)
    process.env.ROM_PANEL = 'brasil'
    const brasilNames = listDirectorProfessionals(false).map((p) => p.name)
    const overlap = brasilNames.filter((n) => iguatemiNames.includes(n))
    expect(overlap).toEqual([])
  })
})
