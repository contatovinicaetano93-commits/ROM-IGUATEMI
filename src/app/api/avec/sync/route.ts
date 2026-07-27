import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/api-response'
import { isAvecConfigured, isAvecMock, getAvecBaseUrl, testAvecConnection } from '@/lib/avec/client'
import { runAvecSync, getLastAvecSync, type AvecSyncMode } from '@/lib/avec/sync'
import { isAuthorized } from '@/lib/auth'
import { isCronAuthorized } from '@/lib/cron-auth'
import { isProduction } from '@/lib/env'
import { getDeploymentContext } from '@/lib/deployment'
import { isSyncLockBusyError } from '@/lib/sync-lock'
import { isNeonQuotaError, neonQuotaUserMessage } from '@/lib/avec/neon-errors'
import { purgeAvecStorageBloat } from '@/lib/avec/snapshots'

/** Sync Avec pode demorar (vários relatórios). */
export const maxDuration = 300

async function authorize(req: NextRequest) {
  if (isCronAuthorized(req)) return true
  if (await isAuthorized(req)) return true
  if (!process.env.CRON_SECRET?.trim() && !isProduction()) return true
  return false
}

function parseMode(req: NextRequest, cronFallback: AvecSyncMode = 'fast'): AvecSyncMode {
  const mode = req.nextUrl.searchParams.get('mode')
  if (mode === 'fast' || mode === 'full') return mode
  return cronFallback
}

const FAST_MIN_GAP_MS = 25 * 60_000
const FULL_MIN_GAP_MS = 5 * 60 * 60_000

async function executeSync(
  req: NextRequest,
  opts?: { force?: boolean; defaultMode?: AvecSyncMode; cron?: boolean },
) {
  const mode = parseMode(req, opts?.defaultMode ?? 'fast')

  if (!isAvecConfigured()) {
    // Cron/webhook: skip silencioso — evita spam de erro antes do token na terça
    if (opts?.cron) {
      return ok({
        skipped: true,
        reason: 'aguardando_avec_token',
        mode,
        note: 'AVEC_API_TOKEN ausente — cron ignorado até terça',
      })
    }
    return err('Avec não configurado (AVEC_API_TOKEN)', 503)
  }

  const minGap = mode === 'full' ? FULL_MIN_GAP_MS : FAST_MIN_GAP_MS

  try {
    // Best-effort: libera bloat antes de sync pesado (quando Neon ainda aceita escrita).
    if (opts?.force || mode === 'full') {
      try {
        await purgeAvecStorageBloat({ keepSnapshotDays: 0, keepSyncRunDays: 3 })
      } catch (purgeErr) {
        if (isNeonQuotaError(purgeErr)) {
          if (opts?.cron) {
            return ok({
              skipped: true,
              reason: 'neon_quota',
              mode,
              note: neonQuotaUserMessage(purgeErr),
            })
          }
          return err(neonQuotaUserMessage(purgeErr), 503)
        }
      }
    }

    if (!opts?.force) {
      const last = await getLastAvecSync(mode)
      if (last?.created_at) {
        const age = Date.now() - new Date(last.created_at).getTime()
        if (age >= 0 && age < minGap) {
          return ok({
            skipped: true,
            reason: 'sync_recente',
            mode,
            last,
            schedule: mode === 'fast' ? 'intraday' : 'full',
            note: `Último sync ${mode} há ${Math.round(age / 1000)}s — aguardando janela de ${minGap / 1000}s`,
          })
        }
      }
    }

    const run = await runAvecSync(mode)
    return ok({
      ...run,
      skipped: false,
      mode,
      schedule: mode === 'fast' ? 'intraday' : 'full',
      note:
        mode === 'fast'
          ? 'Sync fast — agenda/caixa do dia (sem P1–P3)'
          : 'Sync full — catálogo + P1/P2/P3',
    })
  } catch (e) {
    if (isSyncLockBusyError(e)) {
      // Cron/webhook: skip silencioso — outro sync ainda está no Neon.
      return ok({
        skipped: true,
        reason: 'sync_em_andamento',
        mode,
        holder: e.holder,
        expires_at: e.expiresAt,
        note: 'Outro sync Avec já está em execução (lock distribuído)',
      })
    }
    if (isNeonQuotaError(e)) {
      if (opts?.cron) {
        return ok({
          skipped: true,
          reason: 'neon_quota',
          mode,
          note: neonQuotaUserMessage(e),
        })
      }
      return err(neonQuotaUserMessage(e), 503)
    }
    throw e
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!(await authorize(req))) return err('Não autorizado', 401)
    const cron = isCronAuthorized(req)
    return await executeSync(req, { force: !cron, defaultMode: 'full', cron })
  } catch (e) {
    return handleError(e)
  }
}

export async function GET(req: NextRequest) {
  try {
    if (!(await authorize(req))) return err('Não autorizado', 401)

    const cron = isCronAuthorized(req)
    if (cron) {
      return await executeSync(req, { defaultMode: parseMode(req, 'fast'), cron: true })
    }

    const test = req.nextUrl.searchParams.get('test') === '1'
    const last = await getLastAvecSync()
    return ok({
      configured: isAvecConfigured(),
      mock: isAvecMock(),
      base_url: getAvecBaseUrl(),
      deployment: getDeploymentContext(),
      cron: {
        fast: { schedule: '*/30 * * * *', mode: 'fast', path: '/api/avec/sync' },
        full: { schedule: '0 */6 * * *', mode: 'full', path: '/api/avec/sync?mode=full' },
        purge: { schedule: '10 4 * * *', path: '/api/avec/purge-snapshots' },
        cadence:
          'fast a cada 30 min + full a cada 6h + purge diário — tempo real via webhook Avec',
      },
      last,
      ...(test ? { connection: await testAvecConnection() } : {}),
    })
  } catch (e) {
    return handleError(e)
  }
}
