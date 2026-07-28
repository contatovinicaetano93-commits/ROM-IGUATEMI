import { afterEach, describe, expect, it } from 'vitest'
import { listDirectorProfessionals, DIRECTOR_FLOOR_ROLES } from './professionals'

const ORIGINAL_PANEL = process.env.ROM_PANEL

afterEach(() => {
  process.env.ROM_PANEL = ORIGINAL_PANEL
})

describe('listDirectorProfessionals — roster por unidade', () => {
  it('ROM_PANEL=brasil retorna o roster ATIVO do Lake (salao 40613)', () => {
    process.env.ROM_PANEL = 'brasil'
    const pros = listDirectorProfessionals()
    expect(pros.length).toBeGreaterThan(300)
    expect(pros.every((p) => p.active)).toBe(true)
    expect(pros.some((p) => p.name.includes('Vitor Moreira'))).toBe(true)
    expect(pros.some((p) => p.avec_pro_id === '830330')).toBe(true)
  })

  it('ROM_PANEL=iguatemi retorna o roster ATIVO do Lake (salao 99801)', () => {
    process.env.ROM_PANEL = 'iguatemi'
    const pros = listDirectorProfessionals()
    expect(pros.length).toBeGreaterThan(200)
    expect(pros.every((p) => p.active)).toBe(true)
    expect(pros.some((p) => p.name.includes('Beto Fortes'))).toBe(true)
  })

  it('floorOnly roles reduz o roster Iguatemi aos profissionais de piso', () => {
    process.env.ROM_PANEL = 'iguatemi'
    const floor = listDirectorProfessionals(true, { roles: DIRECTOR_FLOOR_ROLES })
    expect(floor.length).toBeGreaterThan(40)
    expect(floor.length).toBeLessThan(120)
    expect(floor.every((p) => DIRECTOR_FLOOR_ROLES.includes(p.role))).toBe(true)
  })

  it('cada painel devolve só o próprio roster (ids não se misturam)', () => {
    process.env.ROM_PANEL = 'iguatemi'
    const iguatemiIds = new Set(listDirectorProfessionals(false).map((p) => p.id))
    process.env.ROM_PANEL = 'brasil'
    const brasilIds = new Set(listDirectorProfessionals(false).map((p) => p.id))
    const overlap = [...brasilIds].filter((id) => iguatemiIds.has(id))
    expect(overlap).toEqual([])
  })
})
