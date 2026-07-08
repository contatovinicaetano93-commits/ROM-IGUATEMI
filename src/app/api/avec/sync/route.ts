import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/api-response'
import { isAvecConfigured, isAvecMock, getAvecBaseUrl, testAvecConnection } from '@/lib/avec/client'
import { runAvecSync, getLastAvecSync, type AvecSyncMode } from '@/lib/avec/sync'
import { isAuthorized } from '@/lib/auth'
import { getSalonUnit } from '@/lib/salon/unit'

async function authorize(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get('authorization')
    if (auth === `Bearer ${secret}` || req.headers.get('x-cron-secret') === secret) return true
  }
  if (await isAuthorized(req)) return true
  if (!secret) return true
  return false
}

function parseMode(req: NextRequest): AvecSyncMode {
  const mode = req.nextUrl.searchParams.get('mode')
  return mode === 'fast' ? 'fast' : 'full'
}

// POST /api/avec/sync?mode=fast|full — sync manual (admin) ou Vercel Cron
export async function POST(req: NextRequest) {
  try {
    if (!(await authorize(req))) return err('Não autorizado', 401)
    if (!isAvecConfigured()) return err('Avec não configurado (AVEC_API_TOKEN)', 503)

    const mode = parseMode(req)
    const run = await runAvecSync(mode)
    return ok({ ...run, unit: getSalonUnit().name })
  } catch (e) {
    return handleError(e)
  }
}

// GET /api/avec/sync — status da última sincronização + unidade
export async function GET(req: NextRequest) {
  try {
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
        fast: '*/5 * * * * — relatórios do dia (ROM Brasil)',
        full: '0 8 * * * — catálogo clientes + histórico',
      },
      last,
      ...(test ? { connection: await testAvecConnection() } : {}),
    })
  } catch (e) {
    return handleError(e)
  }
}
