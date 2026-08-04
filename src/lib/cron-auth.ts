import type { NextRequest } from 'next/server'

/**
 * Comparação timing-safe compatível com Edge (middleware) — sem node:crypto.
 * Se os comprimentos diferem, ainda varre o buffer maior para não vazar o tamanho
 * do secret via tempo de early-return óbvio no path igual.
 */
function secretsEqual(a: string, b: string): boolean {
  const enc = new TextEncoder()
  const left = enc.encode(a)
  const right = enc.encode(b)
  const len = Math.max(left.length, right.length)
  let diff = left.length ^ right.length
  for (let i = 0; i < len; i++) {
    diff |= (left[i] ?? 0) ^ (right[i] ?? 0)
  }
  return diff === 0
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
