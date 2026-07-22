export class RateLimiter {
  private static requests = new Map<string, number[]>()

  static checkLimit(key: string, maxRequests: number = 100, windowSeconds: number = 60): boolean {
    const now = Date.now()
    const windowMs = windowSeconds * 1000
    const requests = this.requests.get(key) || []

    // Remove old requests outside the window
    const recentRequests = requests.filter((time) => now - time < windowMs)

    if (recentRequests.length >= maxRequests) {
      this.requests.set(key, recentRequests)
      return false // Rate limit exceeded
    }

    // Add current request
    recentRequests.push(now)
    this.requests.set(key, recentRequests)

    // Cleanup old entries
    if (this.requests.size > 10000) {
      this.requests.clear()
    }

    return true
  }

  static getRemaining(key: string, maxRequests: number = 100, windowSeconds: number = 60): number {
    const now = Date.now()
    const windowMs = windowSeconds * 1000
    const requests = (this.requests.get(key) || []).filter((time) => now - time < windowMs)
    return Math.max(0, maxRequests - requests.length)
  }

  static reset(key?: string): void {
    if (key) {
      this.requests.delete(key)
    } else {
      this.requests.clear()
    }
  }
}

export function createRateLimitHeaders(
  key: string,
  maxRequests: number = 100,
  windowSeconds: number = 60,
) {
  const remaining = RateLimiter.getRemaining(key, maxRequests, windowSeconds)
  return {
    'X-RateLimit-Limit': String(maxRequests),
    'X-RateLimit-Remaining': String(remaining),
    'X-RateLimit-Reset': String(Math.ceil(Date.now() / 1000) + windowSeconds),
  }
}

/** Login: 10 tentativas / IP / 15 min (in-memory; reforço por instância Vercel). */
export const LOGIN_RATE_MAX = 10
export const LOGIN_RATE_WINDOW_SEC = 15 * 60

export function clientIpFromHeaders(headers: Headers): string {
  const xf = headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  if (xf) return xf
  const real = headers.get('x-real-ip')?.trim()
  if (real) return real
  return 'unknown'
}

export function checkLoginRateLimit(headers: Headers): {
  ok: boolean
  key: string
  responseHeaders: Record<string, string>
} {
  const key = `login:${clientIpFromHeaders(headers)}`
  const ok = RateLimiter.checkLimit(key, LOGIN_RATE_MAX, LOGIN_RATE_WINDOW_SEC)
  return {
    ok,
    key,
    responseHeaders: createRateLimitHeaders(key, LOGIN_RATE_MAX, LOGIN_RATE_WINDOW_SEC),
  }
}
