import { describe, expect, it } from 'vitest'
import { resolveBottomNav } from '@/lib/intranet/bottom-nav'

describe('resolveBottomNav', () => {
  it('admin master: Home + Dia + Financeiro + Tarefas (sem Operação/Balcão/Pós)', () => {
    const { dock, more } = resolveBottomNav('admin', [])
    expect(dock.map((item) => item.href)).toEqual(['/', '/resumo-do-dia', '/financeiro', '/flow'])
    expect(more.some((item) => item.href === '/pessoas')).toBe(true)
    expect(more.some((item) => item.href === '/auditoria')).toBe(true)
    expect(more.some((item) => item.href === '/rh')).toBe(true)
    expect(more.some((item) => item.href === '/treinamentos')).toBe(true)
    expect(dock.some((item) => item.href === '/resumo-do-dia')).toBe(true)
    expect(more.some((item) => item.href === '/hoje')).toBe(false)
    expect(more.some((item) => item.href === '/recepcao')).toBe(false)
    expect(more.some((item) => item.href === '/pos-venda')).toBe(false)
  })

  it('staff: Dia + Contatos + Agenda; sem Balcão/Pós/Operação', () => {
    const { dock, more } = resolveBottomNav('staff', [])
    expect(dock.map((item) => item.href)).toEqual(['/', '/resumo-do-dia', '/contatos', '/pipeline'])
    expect(more.some((item) => item.href === '/financeiro')).toBe(false)
    expect(more.some((item) => item.href === '/dashboard')).toBe(false)
    expect(more.some((item) => item.href === '/pessoas')).toBe(false)
    expect(more.some((item) => item.href === '/rh')).toBe(false)
    expect(more.some((item) => item.href === '/treinamentos')).toBe(false)
    expect(more.some((item) => item.href === '/meu-faturamento')).toBe(true)
    expect(dock.some((item) => item.href === '/resumo-do-dia')).toBe(true)
    expect(more.some((item) => item.href === '/recepcao')).toBe(false)
    expect(more.some((item) => item.href === '/pos-venda')).toBe(false)
    expect(more.some((item) => item.href === '/hoje')).toBe(false)
  })

  it('profissional com professional_name: Dia no dock; sem Balcão/Pós/Operação no Mais', () => {
    const { dock, more } = resolveBottomNav('staff', [], { professionalName: 'Alison' })
    expect(dock.map((item) => item.href)).toEqual(['/', '/resumo-do-dia', '/contatos', '/pipeline'])
    expect(more.some((item) => item.href === '/recepcao')).toBe(false)
    expect(more.some((item) => item.href === '/pos-venda')).toBe(false)
    expect(more.some((item) => item.href === '/hoje')).toBe(false)
    expect(more.some((item) => item.href === '/rh')).toBe(false)
    expect(more.some((item) => item.href === '/treinamentos')).toBe(false)
    expect(more.some((item) => item.href === '/meu-faturamento')).toBe(true)
  })

  it('staff com financeiro extra promove o módulo permitido no Mais, não no dock cheio', () => {
    const { dock, more } = resolveBottomNav('staff', ['financeiro'])
    expect(dock.map((item) => item.href)).toEqual(['/', '/resumo-do-dia', '/contatos', '/pipeline'])
    expect(more.some((item) => item.href === '/financeiro')).toBe(true)
  })

  it('financeiro: Dia + Financeiro no dock; pipeline/contatos só com extra', () => {
    const { dock, more } = resolveBottomNav('financeiro', [])
    expect(dock.map((item) => item.href)).toEqual(['/', '/resumo-do-dia', '/financeiro', '/relatorios'])
    expect(more.some((item) => item.href === '/pipeline')).toBe(false)
    expect(more.some((item) => item.href === '/contatos')).toBe(false)

    const withOps = resolveBottomNav('financeiro', ['pipeline', 'contatos', 'dashboard'])
    expect(withOps.dock.map((item) => item.href)).toEqual([
      '/',
      '/resumo-do-dia',
      '/financeiro',
      '/dashboard',
    ])
    expect(withOps.more.some((item) => item.href === '/pipeline')).toBe(true)
    expect(withOps.more.some((item) => item.href === '/contatos')).toBe(true)
  })

  it('estoque: Estoque + Tarefas (sem Operação)', () => {
    const { dock, more } = resolveBottomNav('estoque', [])
    expect(dock.map((item) => item.href)).toEqual(['/', '/estoque', '/flow'])
    expect(more.some((item) => item.href === '/financeiro')).toBe(false)
    expect(more.some((item) => item.href === '/hoje')).toBe(false)
    expect(more.some((item) => item.href === '/rh')).toBe(false)
    expect(more.some((item) => item.href === '/treinamentos')).toBe(false)
  })

  it('mkt: Notícias + Contatos + Agenda', () => {
    const { dock } = resolveBottomNav('mkt', [])
    expect(dock.map((item) => item.href)).toEqual(['/', '/empresa', '/contatos', '/pipeline'])
  })

  it('sem role e sem openAuth: vazio', () => {
    expect(resolveBottomNav(null, [])).toEqual({ dock: [], more: [] })
  })
})
