import { describe, expect, it } from 'vitest'
import {
  countOverdueServices,
  playbookFocusLabel,
  slicePlaybookForRole,
} from '@/lib/salon/playbook'
import type { ActionItem } from '@/lib/salon/recommendations'

function item(partial: Partial<ActionItem> & { contact_id: string }): ActionItem {
  return {
    contact_name: partial.contact_name ?? 'Cliente',
    contact_status: 'convertido',
    contact_phone: null,
    overdue: 0,
    max_overdue_days: 0,
    due_soon: 0,
    scheduled_soon: 0,
    scheduled_today: 0,
    urgency_score: 0,
    recommendations: [],
    ...partial,
  }
}

describe('slicePlaybookForRole', () => {
  const overdue = item({
    contact_id: 'a',
    contact_name: 'Ana',
    overdue: 1,
    max_overdue_days: 10,
    urgency_score: 1000,
    recommendations: [
      { type: 'overdue', title: 'Corte atrasado', detail: 'há 10 dias' },
      { type: 'upsell', title: 'Up-sell', detail: 'tratamento' },
    ],
  })
  const upsellOnly = item({
    contact_id: 'b',
    contact_name: 'Bia',
    urgency_score: 5,
    recommendations: [{ type: 'upsell', title: 'Up-sell', detail: 'só gestão' }],
  })
  const today = item({
    contact_id: 'c',
    contact_name: 'Caio',
    scheduled_today: 1,
    urgency_score: 50,
    recommendations: [{ type: 'scheduled', title: 'Hoje', detail: '14h' }],
  })

  it('staff filtra upsell-only e prioriza atraso + agenda de hoje', () => {
    const { items, audience, focus } = slicePlaybookForRole(
      [upsellOnly, today, overdue],
      'staff',
    )
    expect(audience).toBe('staff')
    expect(focus).toMatch(/Recepção/)
    expect(items.map((i) => i.contact_id)).toEqual(['a', 'c'])
    expect(items[0]!.recommendations.every((r) => r.type !== 'upsell')).toBe(true)
  })

  it('admin mantém upsell e ordena por urgência', () => {
    const { items, audience, focus } = slicePlaybookForRole(
      [upsellOnly, today, overdue],
      'admin',
    )
    expect(audience).toBe('admin')
    expect(focus).toMatch(/Gestão/)
    expect(items.map((i) => i.contact_id)).toEqual(['a', 'c', 'b'])
    expect(items.some((i) => i.recommendations.some((r) => r.type === 'upsell'))).toBe(true)
  })

  it('financeiro/estoque usam fatia de gestão (não recepção)', () => {
    const { audience } = slicePlaybookForRole([overdue], 'financeiro')
    expect(audience).toBe('admin')
    expect(playbookFocusLabel('admin')).toMatch(/Gestão/)
  })
})

describe('countOverdueServices', () => {
  it('soma só os atrasos dos itens do playbook (foco do dia)', () => {
    const items = [
      item({ contact_id: 'a', overdue: 2 }),
      item({ contact_id: 'b', overdue: 0 }),
      item({ contact_id: 'c', overdue: 1 }),
    ]
    expect(countOverdueServices(items)).toBe(3)
  })

  it('retorna 0 quando não há atrasos no foco', () => {
    expect(countOverdueServices([item({ contact_id: 'x', overdue: 0 })])).toBe(0)
  })
})
