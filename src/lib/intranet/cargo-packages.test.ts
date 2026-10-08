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
      'func_financeiro',
      'solicitante_amplo',
      'gestor_unidade',
      'gestor_baru',
      'dono',
      'rh',
      'equipe_rh',
      'mkt',
      'recepcao',
      'pos_venda',
      'estoque_ops',
      'almoxarifado',
      'limpeza',
      'profissional',
    ])
  })

  it('gestor Baru pede só financeiro e compras no Flow', () => {
    const pack = cargoPackageById('gestor_baru')
    expect(pack?.areaIds).toEqual(['financeiro', 'compras'])
    expect(pack?.panel_role).toBe('staff')
    expect(pack?.flow_role).toBe('solicitante')
  })

  it('gestor unidade e mkt ganham Ativações', () => {
    const gestor = cargoPackageById('gestor_unidade')
    expect(gestor).not.toBeNull()
    if (!gestor) return
    expect(gestor.extras).toEqual(['dashboard', 'ativacoes', 'checks_diario'])
    expect(modulesForCargo(gestor)).toContain('ativacoes')
    expect(modulesForCargo(gestor)).toContain('checks_diario')

    const mkt = cargoPackageById('mkt')
    expect(mkt).not.toBeNull()
    if (!mkt) return
    expect(modulesForCargo(mkt)).toContain('ativacoes')
  })

  it('ops financeiro ganha agenda e visão além do pacote financeiro', () => {
    const pack = cargoPackageById('ops_financeiro')
    expect(pack).not.toBeNull()
    if (!pack) return
    expect(modulesForCargo(pack)).toEqual([
      'pipeline',
      'contatos',
      'financeiro',
      'folha',
      'estoque',
      'relatorios',
      'dashboard',
      'checks_diario',
    ])
    expect(extrasBeyondRole(pack.panel_role, pack.extras)).toEqual([
      'pipeline',
      'contatos',
      'folha',
      'dashboard',
      'checks_diario',
    ])
  })

  it('RH ganha Folha e Currículos além do pacote staff', () => {
    const pack = cargoPackageById('rh')
    expect(pack).not.toBeNull()
    if (!pack) return
    expect(modulesForCargo(pack)).toContain('folha')
    expect(modulesForCargo(pack)).toContain('curriculos')
    expect(extrasBeyondRole(pack.panel_role, pack.extras)).toEqual([
      'folha',
      'checks_diario',
      'curriculos',
    ])
  })

  it('func financeiro: KPIs e dia a dia sem adminar Flow', () => {
    const pack = cargoPackageById('func_financeiro')
    expect(pack).not.toBeNull()
    if (!pack) return
    expect(pack.panel_role).toBe('financeiro')
    expect(pack.flow_role).toBe('solicitante')
    expect(pack.areaIds).toEqual(['financeiro', 'compras'])
    expect(modulesForCargo(pack)).toEqual([
      'pipeline',
      'financeiro',
      'estoque',
      'relatorios',
      'checks_diario',
    ])
    expect(extrasBeyondRole(pack.panel_role, pack.extras)).toEqual([
      'pipeline',
      'checks_diario',
    ])
  })

  it('limpeza e equipe RH entram no checks diário; equipe RH também em currículos', () => {
    expect(cargoPackageById('limpeza')?.extras).toEqual(['checks_diario'])
    expect(cargoPackageById('equipe_rh')?.extras).toEqual(['checks_diario', 'curriculos'])
    expect(cargoPackageById('equipe_rh')?.areaIds).toEqual(['rh'])
  })

  it('reconhecimento na lista: Rodrigo, func fin e profissional', () => {
    expect(
      matchCargoPackage({
        panel_role: 'financeiro',
        flow_role: 'master',
        modules: ['pipeline', 'contatos', 'dashboard', 'folha', 'checks_diario'],
        areaIds: ['financeiro', 'manutencao', 'compras', 'rh'],
      })?.id,
    ).toBe('ops_financeiro')

    expect(
      matchCargoPackage({
        panel_role: 'financeiro',
        flow_role: 'solicitante',
        modules: ['pipeline', 'checks_diario'],
        areaIds: ['financeiro', 'compras'],
      })?.id,
    ).toBe('func_financeiro')

    expect(
      matchCargoPackage({
        panel_role: 'staff',
        flow_role: 'solicitante',
        modules: [],
        areaIds: ['compras'],
      })?.id,
    ).toBe('profissional')
  })
})
