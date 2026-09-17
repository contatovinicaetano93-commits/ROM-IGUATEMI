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
    expect(isIntranetShellPath('/hoje')).toBe(false)
    expect(isIntranetPath('/api/flow')).toBe(true)
    expect(isIntranetShellPath('/sistemas')).toBe(true)
    expect(isIntranetShellPath('/auditoria')).toBe(true)
  })
})

describe('intranet top bar', () => {
  it('troca Empresa por MKT Notícias, tira RH e troca Treinamentos por Onboarding', () => {
    expect(INTRANET_NAV.map((item) => item.label)).toEqual([
      'Início',
      'Pessoas',
      'MKT Notícias',
      'Rom Flow',
      'Financeiro',
      'Operação',
      'Onboarding',
      'Ajuda',
    ])
    expect(INTRANET_NAV.find((item) => item.label === 'MKT Notícias')?.href).toBe('/empresa')
    expect(INTRANET_NAV.find((item) => item.label === 'Onboarding')?.href).toBe('/onboarding')
  })
})

describe('intranet section label', () => {
  it('mostra Rom Flow no top bar das rotas do módulo', () => {
    expect(intranetSectionLabel('/flow')).toBe('Rom Flow')
    expect(intranetSectionLabel('/flow/nova')).toBe('Rom Flow')
    expect(intranetSectionLabel('/')).toBe('Início')
    expect(intranetSectionLabel('/pessoas')).toBe('Pessoas')
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
