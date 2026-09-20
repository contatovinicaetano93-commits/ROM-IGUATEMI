import { describe, expect, it } from 'vitest'
import { HOME_SHORTCUTS, flowAreaSystems, systemsForAccess } from '@/lib/intranet/systems'

describe('home shortcuts', () => {
  it('mostra Meus Sistemas, políticas, onboarding e suporte', () => {
    expect(HOME_SHORTCUTS.map((item) => item.label)).toEqual([
      'Meus Sistemas',
      'Documentos e Políticas',
      'Onboarding',
      'Suporte',
    ])
    expect(HOME_SHORTCUTS.map((item) => item.href)).toEqual([
      '/sistemas',
      '/empresa#politicas',
      '/onboarding',
      '/ajuda',
    ])
  })
})

describe('systemsForAccess', () => {
  it('libera operação e gestão para o admin', () => {
    const hrefs = systemsForAccess('admin').map((item) => item.href)
    expect(hrefs).toContain('/flow')
    expect(hrefs).toContain('/pipeline')
    expect(hrefs).toContain('/financeiro')
    expect(hrefs).toContain('/dashboard')
    expect(hrefs).toContain('/auditoria')
  })

  it('staff e mkt veem operação, sem financeiro nem Visão analítica', () => {
    for (const role of ['staff', 'mkt'] as const) {
      const hrefs = systemsForAccess(role).map((item) => item.href)
      expect(hrefs).toContain('/pipeline')
      expect(hrefs).toContain('/contatos')
      expect(hrefs).toContain('/meu-faturamento')
      expect(hrefs).toContain('/recepcao')
      expect(hrefs).toContain('/pos-venda')
      expect(hrefs).not.toContain('/financeiro')
      expect(hrefs).not.toContain('/dashboard')
      expect(hrefs).not.toContain('/auditoria')
      expect(hrefs).not.toContain('/pessoas')
    }
  })

  it('financeiro vê hoje, omie e estoque, sem pipeline', () => {
    const hrefs = systemsForAccess('financeiro').map((item) => item.href)
    expect(hrefs).toContain('/hoje')
    expect(hrefs).toContain('/financeiro')
    expect(hrefs).toContain('/estoque')
    expect(hrefs).not.toContain('/pipeline')
    expect(hrefs).not.toContain('/dashboard')
  })

  it('estoque vê só frente de caixa e estoque além da intranet', () => {
    const hrefs = systemsForAccess('estoque').map((item) => item.href)
    expect(hrefs).toContain('/hoje')
    expect(hrefs).toContain('/estoque')
    expect(hrefs).not.toContain('/financeiro')
    expect(hrefs).not.toContain('/pipeline')
  })

  it('lista as áreas do Flow liberadas para a pessoa', () => {
    expect(flowAreaSystems(['compras', 'rh']).map((item) => item.label)).toEqual([
      'Solicitação compras',
      'Solicitação RH',
    ])
  })

  it('systemsForAccess soma extras ao pacote do papel', () => {
    const hrefs = systemsForAccess('staff', ['financeiro', 'dashboard']).map((item) => item.href)
    expect(hrefs).toContain('/pipeline')
    expect(hrefs).toContain('/financeiro')
    expect(hrefs).toContain('/dashboard')
    expect(hrefs).not.toContain('/relatorios')
  })
})
