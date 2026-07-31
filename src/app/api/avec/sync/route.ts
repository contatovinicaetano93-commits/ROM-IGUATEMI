import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/api-response'
import { isAvecConfigured, isAvecMock, getAvecBaseUrl, testAvecConnection } from '@/lib/avec/client'
import { runAvecSync, getLastAvecSync, type AvecSyncMode } from '@/lib/avec/sync'
import { requireAdmin, isAuthEnabled } from '@/lib/auth'
import { isCronAuthorized } from '@/lib/cron-auth'
import { isProduction } from '@/lib/env'
import { getDeploymentContext } from '@/lib/deployment'
import { isSyncLockBusyError } from '@/lib/sync-lock'
import { isDbQuotaError, dbQuotaUserMessage } from '@/lib/avec/db-quota-errors'
import { purgeAvecStorageBloat } from '@/lib/avec/snapshots'
import { repairSalonP1JsonbEncoding } from '@/lib/salon/p1-metrics'
import { repairSalonP2JsonbEncoding } from '@/lib/salon/p2-metrics'
import { repairSalonP3JsonbEncoding } from '@/lib/salon/p3-metrics'

/** Sync Avec pode demorar (vários relatórios). Pro permite até 800s. */
export const maxDuration = 500

async function authorize(req: NextRequest) {
  if (isCronAuthorized(req)) return { ok: true as const, cron: true as const }
  const admin = await requireAdmin(req)
  if (admin.ok) return { ok: true as const, cron: false as const }
  // Dev sem senha: permite status/sync local. (paridade BR)
  if (!isProduction() && !isAuthEnabled()) {
    return { ok: true as const, cron: false as const }
  }
  return { ok: false as const, status: admin.status, message: admin.message }
}

function parseMode(req: NextRequest, cronFallback: AvecSyncMode = 'fast'): AvecSyncMode {
  const mode = req.nextUrl.searchParams.get('mode')
  if (mode === 'fast' || mode === 'full') return mode
  return cronFallback
}

/** Espaçamento mínimo mesmo se o cron Vercel for reconfigurado à força. (paridade BR) */
const FAST_MIN_GAP_MS = 12 * 60_000
const FULL_MIN_GAP_MS = 5 * 60 * 60_000
/** Webhook: gap curto — não flooda, mas atualiza caixa após evento. */
const WEBHOOK_FAST_MIN_GAP_MS = 90_000

async function executeSync(
  req: NextRequest,
  opts?: { force?: boolean; defaultMode?: AvecSyncMode; cron?: boolean; webhook?: boolean },
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

  // Webhook nunca roda full (P1–P3/catálogo) — só o cron 2×/dia.
  const effectiveMode: AvecSyncMode = opts?.webhook && mode === 'full' ? 'fast' : mode

  const minGap =
    opts?.webhook && effectiveMode === 'fast'
      ? WEBHOOK_FAST_MIN_GAP_MS
      : effectiveMode === 'full'
        ? FULL_MIN_GAP_MS
        : FAST_MIN_GAP_MS

  if (!opts?.force) {
    // Ignora runs órfãos (killed mid-flight com stats.running=true).
    const last = await getLastAvecSync(effectiveMode, { finishedOnly: true })
    if (last?.created_at) {
      const age = Date.now() - new Date(last.created_at).getTime()
      if (age >= 0 && age < minGap) {
        return ok({
          skipped: true,
          reason: 'sync_recente',
          mode: effectiveMode,
          last,
          schedule: effectiveMode === 'fast' ? 'intraday' : 'full',
          note: `Último sync ${effectiveMode} há ${Math.round(age / 1000)}s — aguardando janela de ${minGap / 1000}s`,
        })
      }
    }
  }

  try {
    // Purge só em admin force ou cron full — nunca em cada webhook.
    if ((opts?.force || (opts?.cron && effectiveMode === 'full')) && !opts?.webhook) {
      try {
        await purgeAvecStorageBloat({ keepSnapshotDays: 0, keepSyncRunDays: 2 })
      } catch (purgeErr) {
        if (isDbQuotaError(purgeErr)) {
          if (opts?.cron) {
            return ok({
              skipped: true,
              reason: 'db_quota',
              mode: effectiveMode,
              note: dbQuotaUserMessage(purgeErr),
            })
          }
          return err(dbQuotaUserMessage(purgeErr), 503)
        }
        throw purgeErr
      }
    }

    // Repair jsonb legado só no full — no fast a cada 20min era custo morto.
    if (effectiveMode === 'full') {
      try {
        await Promise.all([
          repairSalonP1JsonbEncoding(),
          repairSalonP2JsonbEncoding(),
          repairSalonP3JsonbEncoding(),
        ])
      } catch {
        // não bloqueia sync
      }
    }

    const run = await runAvecSync(effectiveMode)
    return ok({
      ...run,
      skipped: false,
      mode: effectiveMode,
      schedule: effectiveMode === 'fast' ? 'intraday' : 'full',
      note:
        effectiveMode === 'fast'
          ? 'Sync fast — agenda/caixa do dia (sem P1–P3)'
          : 'Sync full — catálogo + P1/P2/P3',
    })
  } catch (e) {
    if (isSyncLockBusyError(e)) {
      // Cron/webhook: skip silencioso — outro sync ainda está no banco.
      return ok({
        skipped: true,
        reason: 'sync_em_andamento',
        mode: effectiveMode,
        holder: e.holder,
        expires_at: e.expiresAt,
        note: 'Outro sync Avec já está em execução (lock distribuído)',
      })
    }
    if (isDbQuotaError(e)) {
      if (opts?.cron) {
        return ok({
          skipped: true,
          reason: 'db_quota',
          mode: effectiveMode,
          note: dbQuotaUserMessage(e),
        })
      }
      return err(dbQuotaUserMessage(e), 503)
    }
    throw e
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await authorize(req)
    if (!auth.ok) return err(auth.message, auth.status)
    const webhook =
      req.headers.get('x-rom-sync-reason') === 'webhook' ||
      req.nextUrl.searchParams.get('source') === 'webhook'
    return await executeSync(req, {
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
    const auth = await authorize(req)
    if (!auth.ok) return err(auth.message, auth.status)

    if (auth.cron) {
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
        fast: { schedule: '10,30,50 * * * *', mode: 'fast', path: '/api/avec/sync' },
        full: {
          schedule: '35 10,22 * * *',
          mode: 'full',
          path: '/api/avec/sync?mode=full',
          note: '07:35 / 19:35 America/Sao_Paulo — offset vs BR (:20)',
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
          'fast ~20 min (offset BR) · full 2×/dia · estoque horário · token 3h · purge diário — webhook só fast',
      },
      last,
      ...(test ? { connection: await testAvecConnection() } : {}),
    })
  } catch (e) {
    return handleError(e)
  }
}
