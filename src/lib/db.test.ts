import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Sql as PostgresSql } from 'postgres'
import {
  isDbPoolExhaustedError,
  peekResolvedIntranetDatabaseUrl,
  toTransactionPoolerUrl,
  wrapSqlClient,
} from '@/lib/db'

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

describe('peekResolvedIntranetDatabaseUrl', () => {
  const prevIntranet = process.env.INTRANET_DATABASE_URL
  const prevDatabase = process.env.DATABASE_URL

  afterEach(() => {
    if (prevIntranet === undefined) delete process.env.INTRANET_DATABASE_URL
    else process.env.INTRANET_DATABASE_URL = prevIntranet
    if (prevDatabase === undefined) delete process.env.DATABASE_URL
    else process.env.DATABASE_URL = prevDatabase
  })

  it('prefere INTRANET_DATABASE_URL quando existe', () => {
    process.env.INTRANET_DATABASE_URL = 'postgres://intranet/db'
    process.env.DATABASE_URL = 'postgres://salon/db'
    expect(peekResolvedIntranetDatabaseUrl()).toBe('postgres://intranet/db')
  })

  it('cai no DATABASE_URL do salão se a intranet não foi configurada', () => {
    delete process.env.INTRANET_DATABASE_URL
    process.env.DATABASE_URL = 'postgres://salon/db'
    expect(peekResolvedIntranetDatabaseUrl()).toBe('postgres://salon/db')
  })
})

describe('wrapSqlClient', () => {
  it('unsafe chama o unsafe original em vez de si mesmo', async () => {
    const originalUnsafe = vi.fn(async (query: string, params: unknown[] = []) => [
      { query, params },
    ])
    const originalBegin = vi.fn()
    const fake = {
      unsafe: originalUnsafe,
      begin: originalBegin,
    } as unknown as PostgresSql

    const wrapped = wrapSqlClient(fake)
    const first = await wrapped.unsafe('select 1', [1])
    const second = await wrapped.unsafe('select 2')

    expect(originalUnsafe).toHaveBeenCalledTimes(2)
    expect(originalUnsafe).toHaveBeenNthCalledWith(1, 'select 1', [1])
    expect(originalUnsafe).toHaveBeenNthCalledWith(2, 'select 2', [])
    expect(first).toEqual([{ query: 'select 1', params: [1] }])
    expect(second).toEqual([{ query: 'select 2', params: [] }])
  })
})
