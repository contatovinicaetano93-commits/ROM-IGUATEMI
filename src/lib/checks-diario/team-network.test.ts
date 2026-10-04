import { describe, expect, it } from 'vitest'
import { buildTeamNetwork } from '@/lib/checks-diario/team-network'

describe('buildTeamNetwork', () => {
  it('mostra Lead → membros por time', () => {
    const rows = buildTeamNetwork([
      {
        employee_id: '1',
        name: 'Ana',
        team: 'gestor_unidade',
        is_lead: true,
      },
      {
        employee_id: '2',
        name: 'Bia',
        team: 'gestor_unidade',
        is_lead: false,
      },
      {
        employee_id: '3',
        name: 'Carla',
        team: 'rh',
        is_lead: true,
      },
    ])
    const gestor = rows.find((r) => r.id === 'gestor_unidade')
    const rh = rows.find((r) => r.id === 'rh')
    const ops = rows.find((r) => r.id === 'ops_fin')
    expect(gestor?.leads.map((p) => p.name)).toEqual(['Ana'])
    expect(gestor?.members.map((p) => p.name)).toEqual(['Bia'])
    expect(rh?.leads.map((p) => p.name)).toEqual(['Carla'])
    expect(ops?.total).toBe(0)
    expect(gestor?.cargos.map((c) => c.id)).toEqual([
      'gestor_unidade',
      'recepcao',
      'estoque_ops',
      'almoxarifado',
      'pos_venda',
      'limpeza',
      'other',
    ])
    expect(gestor?.cargos.find((c) => c.id === 'other')?.people.map((p) => p.name)).toEqual([
      'Bia',
    ])
  })

  it('encaixa membro no cargo da equipe, não só no time do gestor', () => {
    const rows = buildTeamNetwork([
      {
        employee_id: '1',
        name: 'Ana',
        team: 'gestor_unidade',
        is_lead: true,
        cargo: 'gestor_unidade',
      },
      {
        employee_id: '2',
        name: 'Bia',
        team: 'gestor_unidade',
        is_lead: false,
        cargo: 'recepcao',
      },
      {
        employee_id: '3',
        name: 'Dora',
        team: 'gestor_unidade',
        is_lead: false,
        cargo: 'limpeza',
      },
    ])
    const gestor = rows.find((r) => r.id === 'gestor_unidade')
    expect(gestor?.cargos.find((c) => c.id === 'recepcao')?.people.map((p) => p.name)).toEqual([
      'Bia',
    ])
    expect(gestor?.cargos.find((c) => c.id === 'limpeza')?.people.map((p) => p.name)).toEqual([
      'Dora',
    ])
    expect(gestor?.cargos.find((c) => c.id === 'estoque_ops')?.people).toEqual([])
  })

  it('respeita filtro de uma equipe', () => {
    const rows = buildTeamNetwork(
      [
        { employee_id: '1', name: 'Ana', team: 'gestor_unidade', is_lead: true },
        { employee_id: '2', name: 'Carla', team: 'rh', is_lead: true },
      ],
      'rh',
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]?.id).toBe('rh')
  })
})
