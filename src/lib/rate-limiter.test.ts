import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const sqlMock = vi.fn()

vi.mock('@/lib/db', () => ({
  getSql: () => sqlMock,
}))

import {
  LOGIN_RATE_MAX,
  RateLimiter,
  checkLoginRateLimit,
  checkPostgresRateLimit,
  clientIpFromHeaders,
} from '@/lib/rate-limiter'
import type { Sql } from '@/lib/db'

describe('RateLimiter login (in-memory)', () => {
  afterEach(() => {
    RateLimiter.reset()
  })

  it('reads client IP from x-forwarded-for', () => {
    const headers = new Headers({ 'x-forwarded-for': '203.0.113.10, 10.0.0.1' })
    expect(clientIpFromHeaders(headers)).toBe('203.0.113.10')
  })

  it('blocks after LOGIN_RATE_MAX attempts for the same IP', () => {
    const key = 'login:198.51.100.20'
    for (let i = 0; i < LOGIN_RATE_MAX; i++) {
      expect(RateLimiter.checkLimit(key, LOGIN_RATE_MAX, 900)).toBe(true)
    }
    expect(RateLimiter.checkLimit(key, LOGIN_RATE_MAX, 900)).toBe(false)
    expect(RateLimiter.getRemaining(key, LOGIN_RATE_MAX, 900)).toBe(0)
  })

  it('isolates limits per IP', () => {
    const a = 'login:198.51.100.1'
    const b = 'login:198.51.100.2'
    for (let i = 0; i < LOGIN_RATE_MAX; i++) {
      expect(RateLimiter.checkLimit(a, LOGIN_RATE_MAX, 900)).toBe(true)
    }
    expect(RateLimiter.checkLimit(a, LOGIN_RATE_MAX, 900)).toBe(false)
    expect(RateLimiter.checkLimit(b, LOGIN_RATE_MAX, 900)).toBe(true)
  })
})

describe('checkPostgresRateLimit', () => {
  beforeEach(() => {
    sqlMock.mockReset()
  })

  it('allows when returned count is within max', async () => {
    sqlMock.mockResolvedValueOnce([{ count: 3 }])
    const result = await checkPostgresRateLimit(sqlMock as unknown as Sql, 'login:1.1.1.1', 10, 900)
    expect(result.ok).toBe(true)
    expect(result.count).toBe(3)
    expect(result.remaining).toBe(7)
  })

  it('allows the Nth attempt when count == max', async () => {
    sqlMock.mockResolvedValueOnce([{ count: 10 }])
    const result = await checkPostgresRateLimit(sqlMock as unknown as Sql, 'login:1.1.1.1', 10, 900)
    expect(result.ok).toBe(true)
    expect(result.remaining).toBe(0)
  })

  it('blocks when count is above max', async () => {
    sqlMock.mockResolvedValueOnce([{ count: 11 }])
    const result = await checkPostgresRateLimit(sqlMock as unknown as Sql, 'login:x', 10, 900)
    expect(result.ok).toBe(false)
    expect(result.remaining).toBe(0)
  })
})

describe('checkLoginRateLimit backend selection', () => {
  beforeEach(() => {
    sqlMock.mockReset()
    RateLimiter.reset()
  })

  afterEach(() => {
    RateLimiter.reset()
  })

  it('uses postgres when DB responds', async () => {
    sqlMock.mockResolvedValueOnce([{ count: 1 }])
    const headers = new Headers({ 'x-forwarded-for': '198.51.100.50' })
    const result = await checkLoginRateLimit(headers)
    expect(result.backend).toBe('postgres')
    expect(result.ok).toBe(true)
    expect(result.responseHeaders['X-RateLimit-Remaining']).toBe(String(LOGIN_RATE_MAX - 1))
  })

  it('falls back to in-memory when DB throws', async () => {
    sqlMock.mockRejectedValue(new Error('connection refused'))
    const headers = new Headers({ 'x-forwarded-for': '198.51.100.99' })
    const first = await checkLoginRateLimit(headers)
    expect(first.backend).toBe('memory')
    expect(first.ok).toBe(true)

    for (let i = 0; i < LOGIN_RATE_MAX - 1; i++) {
      expect((await checkLoginRateLimit(headers)).ok).toBe(true)
    }
    expect((await checkLoginRateLimit(headers)).ok).toBe(false)
  })
})
