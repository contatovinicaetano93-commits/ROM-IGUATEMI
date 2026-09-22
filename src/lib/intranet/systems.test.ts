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
  it('libera operação e gestão para o admin (sem Balcão/Pós/Operação no menu)', () => {
    const hrefs = systemsForAccess('admin').map((item) => item.href)
    expect(hrefs).toContain('/flow')
    expect(hrefs).toContain('/pipeline')
    expect(hrefs).toContain('/contatos')
    expect(hrefs).toContain('/financeiro')
    expect(hrefs).toContain('/dashboard')
    expect(hrefs).toContain('/auditoria')
    expect(hrefs).not.toContain('/hoje')
    expect(hrefs).not.toContain('/recepcao')
    expect(hrefs).not.toContain('/pos-venda')
  })

  it('staff operacional vê Balcão/Pós; mkt não — sem financeiro nem Visão', () => {
    const staff = systemsForAccess('staff').map((item) => item.href)
    expect(staff).toContain('/pipeline')
    expect(staff).toContain('/contatos')
    expect(staff).toContain('/meu-faturamento')
    expect(staff).toContain('/recepcao')
    expect(staff).toContain('/pos-venda')
    expect(staff).toContain('/hoje')
    expect(staff).not.toContain('/financeiro')

    const mkt = systemsForAccess('mkt').map((item) => item.href)
    expect(mkt).toContain('/pipeline')
    expect(mkt).toContain('/contatos')
    expect(mkt).toContain('/meu-faturamento')
    expect(mkt).not.toContain('/recepcao')
    expect(mkt).not.toContain('/pos-venda')
    expect(mkt).not.toContain('/hoje')
    expect(mkt).not.toContain('/financeiro')
    expect(mkt).not.toContain('/dashboard')
    expect(mkt).not.toContain('/auditoria')
    expect(mkt).not.toContain('/pessoas')
  })

  it('financeiro vê omie e estoque, sem pipeline nem shells de balcão', () => {
    const hrefs = systemsForAccess('financeiro').map((item) => item.href)
    expect(hrefs).toContain('/financeiro')
    expect(hrefs).toContain('/estoque')
    expect(hrefs).toContain('/meu-faturamento')
    expect(hrefs).not.toContain('/hoje')
    expect(hrefs).not.toContain('/recepcao')
    expect(hrefs).not.toContain('/pos-venda')
    expect(hrefs).not.toContain('/pipeline')
    expect(hrefs).not.toContain('/dashboard')
  })

  it('estoque vê estoque e faturamento, sem Operação/Balcão', () => {
    const hrefs = systemsForAccess('estoque').map((item) => item.href)
    expect(hrefs).toContain('/estoque')
    expect(hrefs).toContain('/meu-faturamento')
    expect(hrefs).not.toContain('/hoje')
    expect(hrefs).not.toContain('/recepcao')
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
