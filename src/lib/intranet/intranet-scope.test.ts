import { describe, expect, it } from 'vitest'
import { isIntranetPath, isIntranetShellPath } from '@/lib/intranet/paths'
import { defaultFlowRole } from '@/lib/flow/roles'
import { canSeeExpense } from '@/lib/flow/workflow'
import type { Expense, User } from '@/lib/flow/types'

describe('intranet paths', () => {
  it('home e shells usam o layout claro', () => {
    expect(isIntranetShellPath('/')).toBe(true)
    expect(isIntranetShellPath('/flow/nova')).toBe(true)
    expect(isIntranetShellPath('/hoje')).toBe(false)
    expect(isIntranetPath('/api/flow')).toBe(true)
  })
})

describe('flow role mapping', () => {
  it('admin do painel vira master no RomFlow da unidade', () => {
    expect(defaultFlowRole('admin')).toBe('master')
    expect(defaultFlowRole('financeiro')).toBe('admin_financeiro')
    expect(defaultFlowRole('staff')).toBe('solicitante')
    expect(defaultFlowRole('mkt')).toBe('solicitante')
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
