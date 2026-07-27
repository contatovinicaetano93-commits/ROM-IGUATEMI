import { describe, expect, it } from 'vitest'
import { mergeContactStatus } from '@/lib/contacts'

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

  it('não demota importado para novo (dump Avec ≠ lead)', () => {
    expect(mergeContactStatus('importado', 'novo')).toBe('importado')
  })

  it('promove importado para agendado/convertido', () => {
    expect(mergeContactStatus('importado', 'agendado')).toBe('agendado')
    expect(mergeContactStatus('importado', 'convertido')).toBe('convertido')
  })

  it('não rebaixa em_atendimento para novo', () => {
    expect(mergeContactStatus('em_atendimento', 'novo')).toBe('em_atendimento')
  })

  it('permite remarcação: perdido → agendado; e retorno com atendimento', () => {
    expect(mergeContactStatus('perdido', 'agendado')).toBe('agendado')
    expect(mergeContactStatus('perdido', 'convertido')).toBe('convertido')
    expect(mergeContactStatus('perdido', 'em_atendimento')).toBe('em_atendimento')
    expect(mergeContactStatus('perdido', 'novo')).toBe('perdido')
  })

  it('marca perdido quando explícito', () => {
    expect(mergeContactStatus('convertido', 'perdido')).toBe('perdido')
  })

  it('permite heal/PATCH novo → importado (dump Avec)', () => {
    expect(mergeContactStatus('novo', 'importado')).toBe('importado')
  })
})
