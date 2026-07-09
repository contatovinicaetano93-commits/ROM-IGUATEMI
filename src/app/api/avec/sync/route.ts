import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/api-response'
import { isAvecConfigured, isAvecMock, getAvecBaseUrl, testAvecConnection } from '@/lib/avec/client'
import { runAvecSync, getLastAvecSync } from '@/lib/avec/sync'
import { isAuthorized } from '@/lib/auth'
import { isProduction } from '@/lib/env'
import { getDeploymentContext } from '@/lib/deployment'

/** Sync Avec pode demorar (vários relatórios). */
export const maxDuration = 300

function cronSecret() {
  return process.env.CRON_SECRET?.trim() || ''
}

/** Vercel Cron envia GET + Authorization: Bearer CRON_SECRET (e/ou x-vercel-cron). */
function isCronInvocation(req: NextRequest) {
  const secret = cronSecret()
  const auth = req.headers.get('authorization')
  if (secret && auth === `Bearer ${secret}`) return true
  if (req.headers.get('x-cron-secret') && secret && req.headers.get('x-cron-secret') === secret) {
    return true
  }
  if (req.headers.get('x-vercel-cron') === '1') return true
  if (req.nextUrl.searchParams.get('run') === '1') return true
  return false
}

async function authorize(req: NextRequest) {
  const secret = cronSecret()
  if (secret) {
    const auth = req.headers.get('authorization')
    if (auth === `Bearer ${secret}` || req.headers.get('x-cron-secret') === secret) return true
  }

  if (await isAuthorized(req)) return true

  if (!secret && !isProduction()) return true

  return false
}

const MIN_GAP_MS = 45_000

async function executeSync(opts?: { force?: boolean }) {
  if (!isAvecConfigured()) return err('Avec não configurado (AVEC_API_TOKEN)', 503)

  // Evita sobrepor syncs quando o cron dispara a cada minuto.
  if (!opts?.force) {
    const last = await getLastAvecSync()
    if (last?.created_at) {
      const age = Date.now() - new Date(last.created_at).getTime()
      if (age >= 0 && age < MIN_GAP_MS) {
        return ok({
          skipped: true,
          reason: 'sync_recente',
          last,
          schedule: 'realtime',
          note: `Último sync há ${Math.round(age / 1000)}s — aguardando janela de ${MIN_GAP_MS / 1000}s`,
        })
      }
    }
  }

  const run = await runAvecSync()
  return ok({
    ...run,
    skipped: false,
    schedule: 'realtime',
    note: 'Sync Avec (cron a cada 1 min ou disparo manual)',
  })
}

export async function POST(req: NextRequest) {
  try {
    if (!(await authorize(req))) return err('Não autorizado', 401)
    // Manual / admin sempre força
    return await executeSync({ force: !isCronInvocation(req) })
  } catch (e) {
    return handleError(e)
  }
}

export async function GET(req: NextRequest) {
  try {
    if (!(await authorize(req))) return err('Não autorizado', 401)

    // Cron Vercel = GET → precisa rodar o sync (antes só lia status).
    if (isCronInvocation(req)) {
      return await executeSync()
    }

    const test = req.nextUrl.searchParams.get('test') === '1'
    const last = await getLastAvecSync()
    return ok({
      configured: isAvecConfigured(),
      mock: isAvecMock(),
      base_url: getAvecBaseUrl(),
      deployment: getDeploymentContext(),
      cron: {
        schedule: '*/5 * * * *',
        cadence: 'backup a cada 5 min — tempo real = /api/webhooks/avec',
        path: '/api/avec/sync',
      },
      last,
      ...(test ? { connection: await testAvecConnection() } : {}),
    })
  } catch (e) {
    return handleError(e)
  }
}
