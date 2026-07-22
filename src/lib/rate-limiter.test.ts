import { afterEach, describe, expect, it } from 'vitest'
import {
  LOGIN_RATE_MAX,
  RateLimiter,
  checkLoginRateLimit,
  clientIpFromHeaders,
} from '@/lib/rate-limiter'

describe('RateLimiter login', () => {
  afterEach(() => {
    RateLimiter.reset()
  })

  it('reads client IP from x-forwarded-for', () => {
    const headers = new Headers({ 'x-forwarded-for': '203.0.113.10, 10.0.0.1' })
    expect(clientIpFromHeaders(headers)).toBe('203.0.113.10')
  })

  it('blocks after LOGIN_RATE_MAX attempts for the same IP', () => {
    const headers = new Headers({ 'x-forwarded-for': '198.51.100.20' })
    for (let i = 0; i < LOGIN_RATE_MAX; i++) {
      expect(checkLoginRateLimit(headers).ok).toBe(true)
    }
    const blocked = checkLoginRateLimit(headers)
    expect(blocked.ok).toBe(false)
    expect(blocked.responseHeaders['X-RateLimit-Remaining']).toBe('0')
  })

  it('isolates limits per IP', () => {
    const a = new Headers({ 'x-forwarded-for': '198.51.100.1' })
    const b = new Headers({ 'x-forwarded-for': '198.51.100.2' })
    for (let i = 0; i < LOGIN_RATE_MAX; i++) {
      expect(checkLoginRateLimit(a).ok).toBe(true)
    }
    expect(checkLoginRateLimit(a).ok).toBe(false)
    expect(checkLoginRateLimit(b).ok).toBe(true)
  })
})
