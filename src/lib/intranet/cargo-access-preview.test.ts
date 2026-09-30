import { describe, expect, it } from 'vitest'
import {
  cargoAccessPreviewLabels,
  includedShellLabelsForRole,
} from '@/lib/intranet/cargo-access-preview'
import { cargoPackageById } from '@/lib/intranet/cargo-packages'

describe('cargoAccessPreviewLabels', () => {
  it('profissional lista agenda, contatos e meu faturamento — sem Balcão/Pós-venda/Operação', () => {
    const pack = cargoPackageById('profissional')
    expect(pack).not.toBeNull()
    if (!pack) return
    expect(cargoAccessPreviewLabels(pack)).toEqual([
      'Agenda do dia',
      'Contatos',
      'Meu faturamento',
    ])
  })

  it('recepção e pós-venda também ficam em Agenda + Contatos', () => {
    for (const id of ['recepcao', 'pos_venda'] as const) {
      const pack = cargoPackageById(id)
      expect(pack).not.toBeNull()
      if (!pack) return
      const labels = cargoAccessPreviewLabels(pack)
      expect(labels).toContain('Meu faturamento')
      expect(labels).toContain('Agenda do dia')
      expect(labels).toContain('Contatos')
      expect(labels).not.toContain('Recepção')
      expect(labels).not.toContain('Pós-venda')
      expect(labels).not.toContain('Operação do dia')
    }
  })

  it('func financeiro mostra finanças + agenda (extra) + faturamento — sem shells de balcão', () => {
    const pack = cargoPackageById('func_financeiro')
    expect(pack).not.toBeNull()
    if (!pack) return
    const labels = cargoAccessPreviewLabels(pack)
    expect(labels).toContain('Financeiro')
    expect(labels).toContain('Estoque')
    expect(labels).toContain('Relatórios')
    expect(labels).toContain('Agenda do dia')
    expect(labels).toContain('Meu faturamento')
    expect(labels).not.toContain('Operação do dia')
    expect(labels).not.toContain('Recepção')
    expect(labels).not.toContain('Pós-venda')
    expect(labels).not.toContain('Contatos')
  })

  it('estoque ops não inventa agenda/contatos nem Operação', () => {
    const pack = cargoPackageById('estoque_ops')
    expect(pack).not.toBeNull()
    if (!pack) return
    const labels = cargoAccessPreviewLabels(pack)
    expect(labels).toContain('Estoque')
    expect(labels).toContain('Meu faturamento')
    expect(labels).not.toContain('Operação do dia')
    expect(labels).not.toContain('Agenda do dia')
    expect(labels).not.toContain('Contatos')
  })

  it('admin master sem Balcão/Pós/Operação no preview', () => {
    const pack = cargoPackageById('master')
    expect(pack).not.toBeNull()
    if (!pack) return
    const labels = cargoAccessPreviewLabels(pack)
    expect(labels).toContain('Agenda do dia')
    expect(labels).toContain('Contatos')
    expect(labels).toContain('Visão analítica')
    expect(labels).not.toContain('Operação do dia')
    expect(labels).not.toContain('Recepção')
    expect(labels).not.toContain('Pós-venda')
  })
})

describe('includedShellLabelsForRole', () => {
  it('qualquer papel: só Meu faturamento como shell (sem Balcão/Pós/Operação)', () => {
    expect(includedShellLabelsForRole('staff')).toEqual(['Meu faturamento'])
    expect(includedShellLabelsForRole('financeiro')).toEqual(['Meu faturamento'])
    expect(includedShellLabelsForRole('admin')).toEqual(['Meu faturamento'])
  })
})
