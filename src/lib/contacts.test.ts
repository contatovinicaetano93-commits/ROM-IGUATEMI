import { describe, expect, it } from 'vitest'
import { mergeContactStatus, planContactMerge } from '@/lib/contacts'

describe('mergeContactStatus', () => {
  it('não rebaixa convertido para agendado (sync de agendamentos Avec)', () => {
    expect(mergeContactStatus('convertido', 'agendado')).toBe('convertido')
  })

  it('promove novo para agendado', () => {
    expect(mergeContactStatus('novo', 'agendado')).toBe('agendado')
  })

  it('promove agendado para convertido', () => {
    expect(mergeContactStatus('agendado', 'convertido')).toBe('convertido')
  })

  it('mantém perdido salvo retorno com atendimento (convertido)', () => {
    expect(mergeContactStatus('perdido', 'agendado')).toBe('perdido')
    expect(mergeContactStatus('perdido', 'convertido')).toBe('convertido')
  })

  it('marca perdido quando explícito', () => {
    expect(mergeContactStatus('convertido', 'perdido')).toBe('perdido')
  })
})

describe('planContactMerge', () => {
  it('anexa avec_client_id em contato que só tinha telefone', () => {
    const plan = planContactMerge(
      { phone: '11999990000', avec_client_id: null, status: 'novo' },
      { phone: '11999990000', avecClientId: 'avec-1', status: 'agendado' },
    )
    expect(plan.avecClientId).toBe('avec-1')
    expect(plan.status).toBe('agendado')
  })

  it('não sobrescreve avec_client_id divergente', () => {
    const plan = planContactMerge(
      { phone: '11999990000', avec_client_id: 'avec-old', status: 'agendado' },
      { phone: '11999990000', avecClientId: 'avec-new', status: 'agendado' },
    )
    expect(plan.avecClientId).toBe('avec-old')
  })
})
