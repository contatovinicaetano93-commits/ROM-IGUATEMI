import { NextRequest } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { requireAdmin } from '@/lib/auth'

/**
 * Refresh Avec token: cron secreto OU admin (paridade BR).
 * Sessão staff/financeiro não basta — antes IG usava isAuthorized (mais fraco).
 */
export async function authorizeAvecRefreshToken(req: NextRequest) {
  if (isCronAuthorized(req)) return { cron: true as const }
  const auth = await requireAdmin(req)
  if (!auth.ok) return null
  return { cron: false as const }
}
