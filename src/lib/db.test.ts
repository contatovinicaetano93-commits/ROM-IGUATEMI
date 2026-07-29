import { describe, expect, it } from 'vitest'
import { isDbPoolExhaustedError, toTransactionPoolerUrl } from '@/lib/db'

describe('toTransactionPoolerUrl', () => {
  it('reescreve Supabase session pooler 5432 → transaction 6543', () => {
    const raw =
      'postgresql://postgres.ref:Senha%40123@aws-0-us-east-2.pooler.supabase.com:5432/postgres?sslmode=require'
    const out = toTransactionPoolerUrl(raw)
    expect(out).toContain(':6543/')
    expect(out).not.toContain(':5432/')
  })

  it('não mexe em URL já em 6543 ou host direto', () => {
    const tx =
      'postgresql://user:pass@aws-0-us-east-2.pooler.supabase.com:6543/postgres'
    expect(toTransactionPoolerUrl(tx)).toBe(tx)
    const direct = 'postgresql://user:pass@db.xxxxx.supabase.co:5432/postgres'
    expect(toTransactionPoolerUrl(direct)).toBe(direct)
  })
})

describe('isDbPoolExhaustedError', () => {
  it('detecta EMAXCONNSESSION', () => {
    expect(
      isDbPoolExhaustedError(
        new Error('(EMAXCONNSESSION) max clients reached in session mode - max clients are limited to pool_size: 15'),
      ),
    ).toBe(true)
    expect(isDbPoolExhaustedError(new Error('syntax error'))).toBe(false)
  })
})
