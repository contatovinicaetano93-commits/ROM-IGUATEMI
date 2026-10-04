import { describe, expect, it } from 'vitest'
import {
  CHECKS_CARGOS,
  CHECKS_TEAMS,
  checksCargoById,
  parseChecksCargoId,
  resolveChecksCargo,
} from '@/lib/checks-diario/types'

describe('CHECKS_CARGOS', () => {
  it('cada time tem o cargo do gestor e pelo menos um cargo da equipe', () => {
    for (const team of CHECKS_TEAMS) {
      const cargos = CHECKS_CARGOS.filter((c) => c.team === team.id)
      expect(cargos.some((c) => c.is_lead)).toBe(true)
      expect(cargos.some((c) => !c.is_lead)).toBe(true)
    }
  })

  it('equipe do gestor de unidade inclui recepção, estoque, almoxarifado, pós-venda e limpeza', () => {
    const ids = CHECKS_CARGOS.filter((c) => c.team === 'gestor_unidade' && !c.is_lead).map(
      (c) => c.id,
    )
    expect(ids).toEqual([
      'recepcao',
      'estoque_ops',
      'almoxarifado',
      'pos_venda',
      'limpeza',
    ])
  })

  it('parseChecksCargoId rejeita time-lead genérico', () => {
    expect(parseChecksCargoId('gestor_unidade')).toBe('gestor_unidade')
    expect(parseChecksCargoId('ops_fin')).toBeNull()
    expect(parseChecksCargoId('recepcao')).toBe('recepcao')
    expect(checksCargoById('profissional')).toBeNull()
  })

  it('resolveChecksCargo usa o cargo gravado e cai no lead do time', () => {
    expect(
      resolveChecksCargo({
        cargo: 'recepcao',
        team: 'gestor_unidade',
        is_lead: false,
      }),
    ).toBe('recepcao')
    expect(
      resolveChecksCargo({
        cargo: null,
        team: 'gestor_unidade',
        is_lead: true,
      }),
    ).toBe('gestor_unidade')
    expect(
      resolveChecksCargo({
        cargo: null,
        team: 'gestor_unidade',
        is_lead: false,
      }),
    ).toBeNull()
  })
})
