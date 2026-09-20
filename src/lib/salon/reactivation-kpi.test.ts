import { describe, expect, it } from 'vitest'
import {
  ACTIVATED_QUEUE_WINDOW_DAYS,
  REACTIVATION_WINDOW_DAYS,
  isActivatedOutreachPayload,
} from '@/lib/salon/reactivation-kpi'

describe('reactivation kpi constants', () => {
  it('usa janela entre 14 e 30 dias no KPI', () => {
    expect(REACTIVATION_WINDOW_DAYS).toBeGreaterThanOrEqual(14)
    expect(REACTIVATION_WINDOW_DAYS).toBeLessThanOrEqual(30)
  })

  it('fila Ativados usa 30 dias', () => {
    expect(ACTIVATED_QUEUE_WINDOW_DAYS).toBe(30)
  })
})

describe('isActivatedOutreachPayload', () => {
  it('aceita ficha e filas de reativação', () => {
    expect(isActivatedOutreachPayload({ surface: 'contact_detail' })).toBe(true)
    expect(
      isActivatedOutreachPayload({ surface: 'contact_list', list_mode: 'reactivate' }),
    ).toBe(true)
    expect(
      isActivatedOutreachPayload({ surface: 'contact_list', list_mode: 'sem_servicos' }),
    ).toBe(true)
    expect(isActivatedOutreachPayload({ surface: 'contact_list' })).toBe(true)
  })

  it('rejeita novos e director', () => {
    expect(isActivatedOutreachPayload({ surface: 'contact_list', list_mode: 'novos' })).toBe(
      false,
    )
    expect(isActivatedOutreachPayload({ surface: 'director_0011' })).toBe(false)
  })
})
