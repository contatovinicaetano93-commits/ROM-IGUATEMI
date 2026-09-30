import { getSql, type Sql } from '@/lib/db'
import { Logger } from '@/lib/logger'

const logger = new Logger('RateLimiter')

/**
 * Fallback in-memory por isolate Vercel.
 * Usado quando o Postgres blipa — documentado em checkLoginRateLimit.
 */
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

/** Login: 10 tentativas / IP / 15 min (Postgres; fallback in-memory por isolate). */
export const LOGIN_RATE_MAX = 10
export const LOGIN_RATE_WINDOW_SEC = 15 * 60

export function clientIpFromHeaders(headers: Headers): string {
  const xf = headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  if (xf) return xf
  const real = headers.get('x-real-ip')?.trim()
  if (real) return real
  return 'unknown'
}

/**
 * Incrementa o contador no Postgres (janela deslizante por `window_started`).
 * Injetável via `sql` para testes.
 */
export async function checkPostgresRateLimit(
  sql: Sql,
  key: string,
  maxRequests: number,
  windowSeconds: number,
): Promise<{ ok: boolean; remaining: number; count: number }> {
  const rows = (await sql`
    insert into auth_rate_limits (key, count, window_started)
    values (${key}, 1, now())
    on conflict (key) do update set
      count = case
        when auth_rate_limits.window_started <= now() - (${windowSeconds}::int * interval '1 second')
          then 1
        else auth_rate_limits.count + 1
      end,
      window_started = case
        when auth_rate_limits.window_started <= now() - (${windowSeconds}::int * interval '1 second')
          then now()
        else auth_rate_limits.window_started
      end
    returning count
  `) as { count: number }[]

  const count = Number(rows[0]?.count) || 0
  // Conta a tentativa atual: 1..max ok; max+1 bloqueia (mesmo limiar do in-memory).
  const ok = count <= maxRequests
  return { ok, count, remaining: Math.max(0, maxRequests - count) }
}

function headersFor(
  maxRequests: number,
  windowSeconds: number,
  remaining: number,
): Record<string, string> {
  return {
    'X-RateLimit-Limit': String(maxRequests),
    'X-RateLimit-Remaining': String(remaining),
    'X-RateLimit-Reset': String(Math.ceil(Date.now() / 1000) + windowSeconds),
  }
}

/**
 * Login rate limit distribuído via `auth_rate_limits`.
 * Se o DB falhar (pool blip, migration pendente), loga e cai no limiter
 * in-memory deste isolate — melhor que abrir o login sem teto local.
 */
export async function checkLoginRateLimit(headers: Headers): Promise<{
  ok: boolean
  key: string
  responseHeaders: Record<string, string>
  backend: 'postgres' | 'memory'
}> {
  const key = `login:${clientIpFromHeaders(headers)}`
  try {
    const sql = getSql()
    const result = await checkPostgresRateLimit(sql, key, LOGIN_RATE_MAX, LOGIN_RATE_WINDOW_SEC)
    return {
      ok: result.ok,
      key,
      backend: 'postgres',
      responseHeaders: headersFor(LOGIN_RATE_MAX, LOGIN_RATE_WINDOW_SEC, result.remaining),
    }
  } catch (error) {
    logger.warn('auth_rate_limits DB unavailable; falling back to in-memory isolate limiter', {
      error: error instanceof Error ? error.message : String(error),
    })
    const ok = RateLimiter.checkLimit(key, LOGIN_RATE_MAX, LOGIN_RATE_WINDOW_SEC)
    return {
      ok,
      key,
      backend: 'memory',
      responseHeaders: createRateLimitHeaders(key, LOGIN_RATE_MAX, LOGIN_RATE_WINDOW_SEC),
    }
  }
}
