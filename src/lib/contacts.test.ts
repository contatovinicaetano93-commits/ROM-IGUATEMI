import { describe, expect, it } from 'vitest'
import { mergeContactStatus, resolveUpsertPhone } from '@/lib/contacts'

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

describe('resolveUpsertPhone', () => {
  it('normaliza BR para E.164 e rejeita curto', () => {
    expect(resolveUpsertPhone('(11) 97028-4991')).toBe('+5511970284991')
    expect(resolveUpsertPhone('123')).toBeNull()
    expect(resolveUpsertPhone(null)).toBeNull()
  })

  it('não devolve telefone cru quando normalize falha', () => {
    expect(resolveUpsertPhone('abc-def')).toBeNull()
  })

  it('preserva DDI explícito (+1) sem forçar 55', () => {
    expect(resolveUpsertPhone('+17866224690')).toBe('+17866224690')
  })
})
