import { describe, expect, it } from 'vitest'
import {
  contactHref,
  contactReturnLabel,
  sanitizeContactReturnTo,
} from '@/lib/auth-redirect'

describe('sanitizeContactReturnTo', () => {
  it('aceita paths internos conhecidos', () => {
    expect(sanitizeContactReturnTo('/hoje')).toBe('/hoje')
    expect(sanitizeContactReturnTo('/pipeline')).toBe('/pipeline')
    expect(sanitizeContactReturnTo('/contatos')).toBe('/contatos')
  })

  it('rejeita open redirect e paths estranhos', () => {
    expect(sanitizeContactReturnTo('https://evil.com')).toBe('/contatos')
    expect(sanitizeContactReturnTo('//evil.com')).toBe('/contatos')
    expect(sanitizeContactReturnTo('/unknown-page')).toBe('/contatos')
    expect(sanitizeContactReturnTo(null)).toBe('/contatos')
  })
})

describe('contactReturnLabel', () => {
  it('rotula Hoje e Contatos', () => {
    expect(contactReturnLabel('/hoje')).toBe('Hoje')
    expect(contactReturnLabel('/contatos')).toBe('Contatos')
    expect(contactReturnLabel('/pipeline')).toBe('Pipeline')
  })
})

describe('contactHref', () => {
  it('anexa returnTo sanitizado', () => {
    expect(contactHref('abc', '/hoje')).toBe('/contatos/abc?returnTo=%2Fhoje')
    expect(contactHref('abc')).toBe('/contatos/abc')
    expect(contactHref('abc', 'https://evil.com')).toBe('/contatos/abc')
  })
})
