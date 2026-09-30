import { describe, expect, it } from 'vitest'
import { isDbStatementTimeoutError } from '@/lib/db-statement-timeout'

describe('isDbStatementTimeoutError', () => {
  it('detecta SQLSTATE 57014', () => {
    expect(isDbStatementTimeoutError({ code: '57014', message: 'canceling statement' })).toBe(
      true,
    )
  })

  it('detecta mensagem de statement_timeout', () => {
    expect(
      isDbStatementTimeoutError(new Error('canceling statement due to statement timeout')),
    ).toBe(true)
  })

  it('não confunde erro comum', () => {
    expect(isDbStatementTimeoutError(new Error('relation does not exist'))).toBe(false)
    expect(isDbStatementTimeoutError({ code: '23505' })).toBe(false)
  })
})
