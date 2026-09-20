import { describe, expect, it } from 'vitest'
import { firstName, greetingPrefix, homeHeadline } from '@/lib/intranet/greeting'

describe('intranet greeting', () => {
  it('extrai o primeiro nome', () => {
    expect(firstName('Rodrigo Silva')).toBe('Rodrigo')
    expect(firstName('')).toBe('')
  })

  it('usa faixa horária de São Paulo', () => {
    const morning = new Date('2026-09-15T10:00:00-03:00')
    expect(greetingPrefix(morning)).toBe('Bom dia')
    expect(homeHeadline('Rodrigo', morning)).toBe('Bom dia, Rodrigo!')
    expect(homeHeadline('', morning)).toBe('Bom dia!')
  })
})
