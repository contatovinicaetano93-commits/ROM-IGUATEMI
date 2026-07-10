import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/api-response'
import { isAvecConfigured, isAvecMock, getAvecBaseUrl, testAvecConnection } from '@/lib/avec/client'
import { runAvecSync, getLastAvecSync, type AvecSyncMode } from '@/lib/avec/sync'
import { isAuthorized } from '@/lib/auth'
import { isProduction } from '@/lib/env'
import { getSalonUnit } from '@/lib/salon/unit'

export const maxDuration = 300

const MIN_GAP_MS = 45_000

async function authorize(req: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim()
  if (secret) {
    const auth = req.headers.get('authorization')
    if (auth === `Bearer ${secret}` || req.headers.get('x-cron-secret') === secret) return true
  }
  // Vercel Cron (Hobby) envia x-vercel-cron quando o job interno dispara.
  if (req.headers.get('x-vercel-cron') === '1' && secret) return true
  if (await isAuthorized(req)) return true
  // Dev sem CRON_SECRET: permite. Produção: sempre exige secret ou sessão.
  if (!secret && !isProduction()) return true
  return false
}

function parseMode(req: NextRequest, cronFallback: AvecSyncMode = 'fast'): AvecSyncMode {
  const mode = req.nextUrl.searchParams.get('mode')
  if (mode === 'fast' || mode === 'full') return mode
  return cronFallback
}

/** Vercel Cron envia GET + Authorization: Bearer CRON_SECRET. */
function isCronInvocation(req: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim() || ''
  const auth = req.headers.get('authorization')
  if (secret && auth === `Bearer ${secret}`) return true
  if (secret && req.headers.get('x-cron-secret') === secret) return true
  if (req.headers.get('x-vercel-cron') === '1') return true
  if (req.nextUrl.searchParams.get('run') === '1') return true
  return false
}

async function executeSync(
  req: NextRequest,
  opts?: { force?: boolean; defaultMode?: AvecSyncMode },
) {
  if (!isAvecConfigured()) return err('Avec não configurado (AVEC_API_TOKEN)', 503)
  const mode = parseMode(req, opts?.defaultMode ?? 'fast')

  if (!opts?.force) {
    const last = await getLastAvecSync(mode)
    if (last?.created_at) {
      const age = Date.now() - new Date(last.created_at).getTime()
      if (age >= 0 && age < MIN_GAP_MS) {
        return ok({
          skipped: true,
          reason: 'sync_recente',
          mode,
          last,
          unit: getSalonUnit().name,
        })
      }
    }
  }

  const run = await runAvecSync(mode)
  return ok({
    ...run,
    skipped: false,
    mode,
    unit: getSalonUnit().name,
    note:
      mode === 'fast'
        ? 'Sync fast — agenda/caixa do dia (sem B/C)'
        : 'Sync full — catálogo + B/C',
  })
}

// POST /api/avec/sync?mode=fast|full — sync manual (admin); default full
export async function POST(req: NextRequest) {
  try {
    if (!(await authorize(req))) return err('Não autorizado', 401)
    return await executeSync(req, { force: !isCronInvocation(req), defaultMode: 'full' })
  } catch (e) {
    return handleError(e)
  }
}

// GET /api/avec/sync — status; Cron Vercel (GET) também executa o sync
export async function GET(req: NextRequest) {
  try {
    if (!(await authorize(req))) return err('Não autorizado', 401)

    if (isCronInvocation(req)) {
      // Path com ?mode=full (08h) ou ?mode=fast (*/5); fallback fast
      return await executeSync(req, { defaultMode: 'fast' })
    }

    const test = req.nextUrl.searchParams.get('test') === '1'
    const mode = req.nextUrl.searchParams.get('mode')
    const last =
      mode === 'fast' || mode === 'full' ? await getLastAvecSync(mode) : await getLastAvecSync()
    const unit = getSalonUnit()

    return ok({
      unit: unit.name,
      unit_slug: unit.slug,
      configured: isAvecConfigured(),
      mock: isAvecMock(),
      base_url: getAvecBaseUrl(),
      docs: 'https://documenter.getpostman.com/view/12527228/2sA2xmUWJo',
      schedules: {
        fast: '*/5 * * * * — agenda/caixa do dia (Vercel Cron GET ?mode=fast)',
        full: '0 8 * * * — catálogo + B/C (Vercel Cron GET ?mode=full)',
      },
      last,
      ...(test ? { connection: await testAvecConnection() } : {}),
    })
  } catch (e) {
    return handleError(e)
  }
}
