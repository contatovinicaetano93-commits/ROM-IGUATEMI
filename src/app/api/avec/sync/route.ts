import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/api-response'
import { isAvecConfigured, isAvecMock, getAvecBaseUrl, testAvecConnection } from '@/lib/avec/client'
import { getLastAvecSync } from '@/lib/avec/sync'
import { getDeploymentContext } from '@/lib/deployment'
import {
  authorizeAvecSync,
  executeAvecSync,
  parseAvecSyncMode,
} from '@/lib/avec/sync-http'

/** Sync Avec pode demorar (vários relatórios). Pro permite até 800s. */
export const maxDuration = 800

export async function POST(req: NextRequest) {
  try {
    const auth = await authorizeAvecSync(req)
    if (!auth.ok) return err(auth.message, auth.status)
    const webhook =
      req.headers.get('x-rom-sync-reason') === 'webhook' ||
      req.nextUrl.searchParams.get('source') === 'webhook'
    return await executeAvecSync(req, {
      force: !auth.cron,
      defaultMode: 'full',
      cron: auth.cron,
      webhook,
    })
  } catch (e) {
    return handleError(e)
  }
}

export async function GET(req: NextRequest) {
  try {
    const auth = await authorizeAvecSync(req)
    if (!auth.ok) return err(auth.message, auth.status)

    if (auth.cron) {
      return await executeAvecSync(req, {
        defaultMode: parseAvecSyncMode(req, 'fast'),
        cron: true,
      })
    }

    const test = req.nextUrl.searchParams.get('test') === '1'
    const last = await getLastAvecSync()
    return ok({
      configured: isAvecConfigured(),
      mock: isAvecMock(),
      base_url: getAvecBaseUrl(),
      deployment: getDeploymentContext(),
      cron: {
        fast: { schedule: '10,30,50 * * * *', mode: 'fast', path: '/api/avec/sync' },
        full: {
          schedule: 'ops/agenda/catalog 2×/dia (offset BR)',
          mode: 'full',
          path: '/api/avec/sync/full/{ops,agenda,catalog}',
          note: 'full fatiado — /full monolítico só admin; lock separado do fast',
        },
        estoque_fast: { schedule: '5 * * * *', path: '/api/estoque/sync' },
        estoque_full: { schedule: '55 11 * * *', path: '/api/estoque/sync?mode=full' },
        purge: {
          schedule: '25 7 * * *',
          path: '/api/avec/purge-snapshots',
          note: '04:25 America/Sao_Paulo — offset vs BR (:10)',
        },
        token: { schedule: '30 */3 * * *', path: '/api/avec/refresh-token' },
        cadence:
          'fast ~20 min (offset BR) · full fatiado 2×/dia · estoque horário · token 3h · purge diário — webhook só fast',
      },
      last,
      ...(test ? { connection: await testAvecConnection() } : {}),
    })
  } catch (e) {
    return handleError(e)
  }
}
