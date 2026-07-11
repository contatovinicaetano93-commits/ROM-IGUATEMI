import { describe, expect, it } from 'vitest'
import { matchDirectorProfessional, normalizeProKey } from './match-pro'
import type { DirectorProfessional } from './types'

const pros: DirectorProfessional[] = [
  { id: 'pro-dani-mariniello', name: 'Dani Mariniello', avec_pro_id: '99', role: 'hairstylist', active: true },
  { id: 'pro-vitor-m', name: 'Vitor M', avec_pro_id: null, role: 'hairstylist', active: true },
  { id: 'pro-walter-leal', name: 'Walter Leal', avec_pro_id: null, role: 'hairstylist', active: true },
]

describe('normalizeProKey', () => {
  it('remove acentos e case', () => {
    expect(normalizeProKey('Maurício Carvalho')).toBe('mauricio carvalho')
  })
})

describe('matchDirectorProfessional', () => {
  it('casa por avec_pro_id', () => {
    expect(matchDirectorProfessional('99', pros)?.id).toBe('pro-dani-mariniello')
  })

  it('casa nome completo', () => {
    expect(matchDirectorProfessional('DANI MARINIELLO', pros)?.id).toBe('pro-dani-mariniello')
  })

  it('casa prefixo / primeiro nome', () => {
    expect(matchDirectorProfessional('Dani', pros)?.id).toBe('pro-dani-mariniello')
    expect(matchDirectorProfessional('Walter', pros)?.id).toBe('pro-walter-leal')
  })

  it('casa Vitor M', () => {
    expect(matchDirectorProfessional('Vitor M', pros)?.id).toBe('pro-vitor-m')
  })

  it('não adivinha quando dois profissionais colidem no mesmo primeiro nome', () => {
    const withCollision: DirectorProfessional[] = [
      ...pros,
      { id: 'pro-lucas-kampos', name: 'Lucas Kampos', avec_pro_id: null, role: 'hairstylist', active: true },
      { id: 'pro-lucas-sales', name: 'Lucas Sales', avec_pro_id: null, role: 'hairstylist', active: true },
    ]
    expect(matchDirectorProfessional('Lucas', withCollision)).toBeNull()
    // nome completo continua funcionando normalmente, sem ambiguidade
    expect(matchDirectorProfessional('Lucas Kampos', withCollision)?.id).toBe('pro-lucas-kampos')
    expect(matchDirectorProfessional('Lucas Sales', withCollision)?.id).toBe('pro-lucas-sales')
  })
})
