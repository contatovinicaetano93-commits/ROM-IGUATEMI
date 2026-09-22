import { describe, expect, it } from 'vitest'
import { resolveBottomNav } from '@/lib/intranet/bottom-nav'

describe('resolveBottomNav', () => {
  it('admin master: Home + Financeiro + Tarefas + Operação', () => {
    const { dock, more } = resolveBottomNav('admin', [])
    expect(dock.map((item) => item.href)).toEqual(['/', '/financeiro', '/flow', '/hoje'])
    expect(more.some((item) => item.href === '/pessoas')).toBe(true)
    expect(more.some((item) => item.href === '/auditoria')).toBe(true)
  })

  it('staff (profissional/recepção): Contatos + Agenda + Tarefas, sem financeiro', () => {
    const { dock, more } = resolveBottomNav('staff', [])
    expect(dock.map((item) => item.href)).toEqual(['/', '/contatos', '/pipeline', '/flow'])
    expect(more.some((item) => item.href === '/financeiro')).toBe(false)
    expect(more.some((item) => item.href === '/dashboard')).toBe(false)
    expect(more.some((item) => item.href === '/pessoas')).toBe(false)
    expect(more.some((item) => item.href === '/meu-faturamento')).toBe(true)
    expect(more.some((item) => item.href === '/recepcao')).toBe(true)
  })

  it('profissional com professional_name: sem Balcão/Pós-venda/Operação no Mais', () => {
    const { dock, more } = resolveBottomNav('staff', [], { professionalName: 'Alison' })
    expect(dock.map((item) => item.href)).toEqual(['/', '/contatos', '/pipeline', '/flow'])
    expect(more.some((item) => item.href === '/recepcao')).toBe(false)
    expect(more.some((item) => item.href === '/pos-venda')).toBe(false)
    expect(more.some((item) => item.href === '/hoje')).toBe(false)
    expect(more.some((item) => item.href === '/meu-faturamento')).toBe(true)
  })

  it('staff com financeiro extra promove o módulo permitido no Mais, não no dock cheio', () => {
    const { dock, more } = resolveBottomNav('staff', ['financeiro'])
    expect(dock.map((item) => item.href)).toEqual(['/', '/contatos', '/pipeline', '/flow'])
    expect(more.some((item) => item.href === '/financeiro')).toBe(true)
  })

  it('financeiro: Financeiro no dock; pipeline/contatos só com extra', () => {
    const { dock, more } = resolveBottomNav('financeiro', [])
    expect(dock.map((item) => item.href)).toEqual(['/', '/financeiro', '/relatorios', '/estoque'])
    expect(more.some((item) => item.href === '/pipeline')).toBe(false)
    expect(more.some((item) => item.href === '/contatos')).toBe(false)

    const withOps = resolveBottomNav('financeiro', ['pipeline', 'contatos', 'dashboard'])
    expect(withOps.dock.map((item) => item.href)).toEqual([
      '/',
      '/financeiro',
      '/dashboard',
      '/relatorios',
    ])
    expect(withOps.more.some((item) => item.href === '/pipeline')).toBe(true)
    expect(withOps.more.some((item) => item.href === '/contatos')).toBe(true)
  })

  it('estoque: Estoque + Tarefas + Operação', () => {
    const { dock, more } = resolveBottomNav('estoque', [])
    expect(dock.map((item) => item.href)).toEqual(['/', '/estoque', '/flow', '/hoje'])
    expect(more.some((item) => item.href === '/financeiro')).toBe(false)
  })

  it('mkt: Notícias + Contatos + Agenda', () => {
    const { dock } = resolveBottomNav('mkt', [])
    expect(dock.map((item) => item.href)).toEqual(['/', '/empresa', '/contatos', '/pipeline'])
  })

  it('sem role e sem openAuth: vazio', () => {
    expect(resolveBottomNav(null, [])).toEqual({ dock: [], more: [] })
  })
})
