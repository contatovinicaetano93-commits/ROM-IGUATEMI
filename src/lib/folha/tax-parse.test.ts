import { describe, expect, it } from 'vitest'
import { parseBrlAmount, parseFolhaTaxEmail, taxKindToExtrasKey } from '@/lib/folha/tax-parse'

describe('parseBrlAmount', () => {
  it('aceita R$ com milhar e vírgula', () => {
    expect(parseBrlAmount('Valor: R$ 1.234,56')).toBe(1234.56)
  })

  it('ausente → null', () => {
    expect(parseBrlAmount('sem valor')).toBeNull()
  })
})

describe('parseFolhaTaxEmail', () => {
  it('detecta DARF + valor + profissional', () => {
    const parsed = parseFolhaTaxEmail({
      subject: 'DARF disponível',
      body: 'Profissional: Alan Fernando de Albuquerque\nDARF no valor de R$ 178,31',
    })
    expect(parsed.kind).toBe('darf')
    expect(parsed.amount).toBe(178.31)
    expect(parsed.professional_name).toMatch(/Alan/i)
    expect(taxKindToExtrasKey(parsed.kind)).toBe('darf')
  })

  it('detecta DAS', () => {
    const parsed = parseFolhaTaxEmail({
      body: 'Guia DAS Simples Nacional R$ 86,05',
    })
    expect(parsed.kind).toBe('das')
    expect(parsed.amount).toBe(86.05)
  })
})
