export class RateLimiter {
  private static requests = new Map<string, number[]>()

  static checkLimit(key: string, maxRequests: number = 100, windowSeconds: number = 60): boolean {
    const now = Date.now()
    const windowMs = windowSeconds * 1000
    const requests = this.requests.get(key) || []

    // Remove old requests outside the window
    const recentRequests = requests.filter((time) => now - time < windowMs)

    if (recentRequests.length >= maxRequests) {
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

  static getRemaining(key: string, maxRequests: number = 100): number {
    const requests = this.requests.get(key) || []
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

export function createRateLimitHeaders(key: string, maxRequests: number = 100) {
  const remaining = RateLimiter.getRemaining(key, maxRequests)
  return {
    'X-RateLimit-Limit': String(maxRequests),
    'X-RateLimit-Remaining': String(remaining),
    'X-RateLimit-Reset': String(Math.ceil(Date.now() / 1000) + 60),
  }
}
