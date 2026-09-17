import { describe, expect, it } from 'vitest'
import { INTRANET_NAV } from '@/app/_components/intranet/nav'
import { isIntranetPath, isIntranetShellPath } from '@/lib/intranet/paths'
import { intranetSectionLabel } from '@/lib/intranet/section'
import { defaultFlowRole } from '@/lib/flow/roles'
import { canManageUsers, canSeeExpense } from '@/lib/flow/workflow'
import type { Expense, User } from '@/lib/flow/types'

describe('intranet paths', () => {
  it('home e shells usam o layout claro', () => {
    expect(isIntranetShellPath('/')).toBe(true)
    expect(isIntranetShellPath('/flow/nova')).toBe(true)
    expect(isIntranetPath('/api/flow')).toBe(true)
    expect(isIntranetShellPath('/sistemas')).toBe(true)
    expect(isIntranetShellPath('/auditoria')).toBe(true)
  })

  it('hoje e financeiro continuam módulos operacionais no grant, não rotas da intranet', () => {
    expect(isIntranetShellPath('/hoje')).toBe(false)
    expect(isIntranetShellPath('/financeiro')).toBe(false)
    expect(isIntranetPath('/estoque')).toBe(false)
  })
})

describe('intranet top bar', () => {
  it('segue o mapa do painel admin: Home, gestão, notícias, agenda e visão', () => {
    expect(INTRANET_NAV.map((item) => item.label)).toEqual([
      'Home',
      'Gestão de usuário',
      'Notícias e eventos',
      'Rom Flow',
      'Financeiro',
      'Estoque',
      'Operação do dia',
      'Agenda do dia',
      'Visão analítica',
      'Contatos',
    ])
    expect(INTRANET_NAV.map((item) => item.short)).toEqual([
      'Home',
      'Usuários',
      'Notícias',
      'Rom Flow',
      'Financeiro',
      'Estoque',
      'Operação',
      'Agenda',
      'Visão',
      'Contatos',
    ])
    expect(INTRANET_NAV.find((item) => item.label === 'Agenda do dia')?.href).toBe('/pipeline')
    expect(INTRANET_NAV.find((item) => item.label === 'Visão analítica')?.href).toBe('/dashboard')
    expect(INTRANET_NAV.some((item) => item.href === '/onboarding')).toBe(false)
    expect(INTRANET_NAV.some((item) => item.href === '/ajuda')).toBe(false)
  })
})

describe('intranet section label', () => {
  it('mostra Rom Flow no top bar das rotas do módulo', () => {
    expect(intranetSectionLabel('/flow')).toBe('Rom Flow')
    expect(intranetSectionLabel('/flow/nova')).toBe('Rom Flow')
    expect(intranetSectionLabel('/')).toBe('Home')
    expect(intranetSectionLabel('/pessoas')).toBe('Gestão de usuário')
    expect(intranetSectionLabel('/dashboard')).toBe('Visão analítica')
    expect(intranetSectionLabel('/relatorios')).toBe('Visão analítica')
    expect(intranetSectionLabel('/pipeline')).toBe('Agenda do dia')
    expect(intranetSectionLabel('/auditoria')).toBe('Auditoria')
  })
})

describe('flow role mapping', () => {
  it('admin do painel vira master no RomFlow da unidade', () => {
    expect(defaultFlowRole('admin')).toBe('master')
    expect(defaultFlowRole('financeiro')).toBe('admin_financeiro')
    expect(defaultFlowRole('staff')).toBe('solicitante')
    expect(defaultFlowRole('mkt')).toBe('solicitante')
  })

  it('só o master gerencia usuários, auditoria e categorias', () => {
    expect(canManageUsers('master')).toBe(true)
    expect(canManageUsers('admin_financeiro')).toBe(false)
    expect(canManageUsers('solicitante')).toBe(false)
  })
})

describe('flow company scope', () => {
  it('solicitante só vê o próprio pedido', () => {
    const user: User = {
      id: 'u1',
      name: 'Ana',
      email: 'ana@rom',
      role: 'solicitante',
      status: 'active',
      companyIds: ['cmp_baru_brasil'],
      areaIds: ['financeiro'],
      created: '',
    }
    const mine: Expense = {
      id: 'e1',
      title: 'Compra',
      description: '',
      area: 'financeiro',
      expense_type: 'outros',
      event_project: '',
      event_date: '',
      amount: 10,
      category: 'cat_outros',
      payment_method: 'pix',
      beneficiary_name: 'Ana',
      beneficiary_document: '',
      pix_key: '',
      bank_name: '',
      agency: '',
      account: '',
      boleto_code: '',
      max_payment_date: '2026-09-30',
      payment_date_justification: '',
      receipt_justification: '',
      receipt: null,
      payment_proof: null,
      company: 'cmp_baru_brasil',
      requester: 'u1',
      approver: null,
      status: 'em_analise',
      scheduled_date: null,
      review_note: '',
      created: '',
      updated: '',
    }
    expect(canSeeExpense(user, mine)).toBe(true)
    expect(canSeeExpense(user, { ...mine, requester: 'other' })).toBe(false)
    expect(canSeeExpense(user, { ...mine, company: 'cmp_baru_iguatemi' })).toBe(false)
  })
})

describe('intranet page chrome', () => {
  it('IntranetPage segue o enquadramento da Agenda/Visão (sans + largura 1600)', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const src = readFileSync(join(process.cwd(), 'src/app/_components/intranet/IntranetPage.tsx'), 'utf8')
    expect(src).toContain('max-w-[1600px]')
    expect(src).toContain('text-gold')
    expect(src).toContain('text-xl font-semibold')
    expect(src).not.toContain('font-serif text-3xl')
    expect(src).not.toContain('max-w-[1100px]')
    expect(src).not.toContain('Voltar ao início')
  })
})
