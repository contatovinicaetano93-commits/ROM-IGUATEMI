import { timingSafeEqual } from 'node:crypto'
import type { NextRequest } from 'next/server'

function secretsEqual(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

/**
 * Autenticação de cron Vercel.
 * Só aceita Bearer / x-cron-secret = CRON_SECRET.
 * NÃO confiar só em x-vercel-cron (staff logado poderia forjar o header).
 * Sem CRON_SECRET → fail closed.
 */
export function isCronAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret) return false

  const auth = req.headers.get('authorization')
  if (auth?.startsWith('Bearer ') && secretsEqual(auth.slice('Bearer '.length), secret)) {
    return true
  }
  const header = req.headers.get('x-cron-secret')
  if (header && secretsEqual(header, secret)) return true
  return false
}
