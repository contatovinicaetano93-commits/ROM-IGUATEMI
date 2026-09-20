import { describe, expect, it } from 'vitest'
import {
  CARGO_PACKAGES,
  cargoPackageById,
  matchCargoPackage,
  modulesForCargo,
} from '@/lib/intranet/cargo-packages'
import { extrasBeyondRole } from '@/lib/intranet/modules'

describe('cargo packages', () => {
  it('tem os cargos do ecossistema ROM', () => {
    expect(CARGO_PACKAGES.map((item) => item.id)).toEqual([
      'master',
      'ops_financeiro',
      'solicitante_amplo',
      'gestor_unidade',
      'gestor_baru',
      'dono',
      'rh',
      'mkt',
      'recepcao',
      'estoque_ops',
      'almoxarifado',
      'profissional',
    ])
  })

  it('gestor Baru pede só financeiro e compras no Flow', () => {
    const pack = cargoPackageById('gestor_baru')
    expect(pack?.areaIds).toEqual(['financeiro', 'compras'])
    expect(pack?.panel_role).toBe('staff')
    expect(pack?.flow_role).toBe('solicitante')
  })

  it('ops financeiro ganha agenda e visão além do pacote financeiro', () => {
    const pack = cargoPackageById('ops_financeiro')
    expect(pack).not.toBeNull()
    if (!pack) return
    expect(modulesForCargo(pack)).toEqual([
      'pipeline',
      'contatos',
      'financeiro',
      'estoque',
      'relatorios',
      'dashboard',
    ])
    expect(extrasBeyondRole(pack.panel_role, pack.extras)).toEqual(['pipeline', 'contatos', 'dashboard'])
  })

  it('reconhecimento na lista: Rodrigo e profissional', () => {
    expect(
      matchCargoPackage({
        panel_role: 'financeiro',
        flow_role: 'master',
        modules: ['pipeline', 'contatos', 'dashboard'],
        areaIds: ['financeiro', 'manutencao', 'compras', 'rh'],
      })?.id,
    ).toBe('ops_financeiro')

    expect(
      matchCargoPackage({
        panel_role: 'staff',
        flow_role: 'solicitante',
        modules: [],
        areaIds: ['compras'],
      })?.id,
    ).toBe('profissional')
  })

  it('não rotula overlap fraco de extras ou áreas', () => {
    expect(
      matchCargoPackage({
        panel_role: 'staff',
        flow_role: 'solicitante',
        modules: ['dashboard'],
        areaIds: ['compras'],
      }),
    ).toBeNull()

    expect(
      matchCargoPackage({
        panel_role: 'staff',
        flow_role: 'solicitante',
        modules: ['dashboard'],
        areaIds: ['manutencao'],
      }),
    ).toBeNull()

    expect(
      matchCargoPackage({
        panel_role: 'staff',
        flow_role: 'solicitante',
        modules: [],
        areaIds: [],
      }),
    ).toBeNull()
  })
})
