import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/api-response'
import { isCronAuthorized } from '@/lib/cron-auth'
import { isAuthorized } from '@/lib/auth'
import { isAvecLoginConfigured, mintAvecApiToken } from '@/lib/avec/refresh-token'
import { loadRuntimeAvecApiToken, saveAvecApiToken } from '@/lib/avec/token-store'

export const maxDuration = 60

/**
 * Renova JWT Avec (~12h) via Cognito + amplify/signin.
 * Cron Vercel: a cada 6 horas (0 every-6h * * *).
 * Também aceita admin autenticado (force=1).
 */
async function authorize(req: NextRequest) {
  if (isCronAuthorized(req)) return { cron: true as const }
  if (await isAuthorized(req)) return { cron: false as const }
  return null
}

async function execute(req: NextRequest) {
  if (!isAvecLoginConfigured()) {
    return err(
      'Refresh automático não configurado — defina AVEC_LOGIN_EMAIL, AVEC_LOGIN_PASSWORD e AVEC_UNIT_ID',
      503,
    )
  }

  const force =
    req.nextUrl.searchParams.get('force') === '1' ||
    req.nextUrl.searchParams.get('force') === 'true'

  const runtime = await loadRuntimeAvecApiToken()
  const current = runtime ?? process.env.AVEC_API_TOKEN ?? null

  // Cron 6h: se ainda restam ≥4h, não renova (evita churn).
  const minted = await mintAvecApiToken({
    force,
    currentToken: current,
    minHoursLeft: force ? 0 : 4,
  })

  if (!minted.skipped) {
    await saveAvecApiToken(minted.token)
  }

  return ok({
    refreshed: !minted.skipped,
    skipped: minted.skipped,
    hours_left: Math.round(minted.hours_left * 100) / 100,
    salon_id: minted.salon_id,
    schedule: '0 */6 * * *',
    note: minted.skipped
      ? 'Token ainda válido (≥4h) — refresh adiado'
      : 'Token Avec renovado e salvo no banco (sync usa na hora)',
  })
}

export async function GET(req: NextRequest) {
  try {
    const auth = await authorize(req)
    if (!auth) return err('Não autorizado', 401)
    return await execute(req)
  } catch (e) {
    return handleError(e)
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await authorize(req)
    if (!auth) return err('Não autorizado', 401)
    return await execute(req)
  } catch (e) {
    return handleError(e)
  }
}
