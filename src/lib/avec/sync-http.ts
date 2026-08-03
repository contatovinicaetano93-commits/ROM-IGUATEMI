import { NextRequest } from 'next/server'
import { ok, err } from '@/lib/api-response'
import { isAvecConfigured } from '@/lib/avec/client'
import {
  runAvecSync,
  getLastAvecSync,
  type AvecSyncMode,
  type AvecSyncStage,
} from '@/lib/avec/sync'
import { requireAdmin, isAuthEnabled } from '@/lib/auth'
import { isCronAuthorized } from '@/lib/cron-auth'
import { isProduction } from '@/lib/env'
import { isSyncLockBusyError } from '@/lib/sync-lock'
import { isDbQuotaError, dbQuotaUserMessage } from '@/lib/avec/db-quota-errors'
import { purgeAvecStorageBloat } from '@/lib/avec/snapshots'
import { repairSalonP1JsonbEncoding } from '@/lib/salon/p1-metrics'
import { repairSalonP2JsonbEncoding } from '@/lib/salon/p2-metrics'
import { repairSalonP3JsonbEncoding } from '@/lib/salon/p3-metrics'

/** Espaçamento mínimo mesmo se o cron Vercel for reconfigurado à força. */
const FAST_MIN_GAP_MS = 12 * 60_000
const FULL_MIN_GAP_MS = 5 * 60 * 60_000
/** Full parcial/erro: retry mais cedo (~45 min) em vez de esperar 5h. */
const FULL_RETRY_MIN_GAP_MS = 45 * 60_000
/** Webhook: gap curto — não flooda, mas atualiza caixa após evento. */
const WEBHOOK_FAST_MIN_GAP_MS = 90_000

function fullStageNote(stage: AvecSyncStage): string {
  switch (stage) {
    case 'ops':
      return 'Sync full/ops — P1/P2/P3 + TM'
    case 'agenda':
      return 'Sync full/agenda — appointments/attendances/caixa/cancel/noshow'
    case 'catalog':
      return 'Sync full/catalog — catálogo 0004 + purge'
    case 'all':
      return 'Sync full — catálogo + P1/P2/P3'
    default: {
      const _exhaustive: never = stage
      return _exhaustive
    }
  }
}

export async function authorizeAvecSync(req: NextRequest) {
  if (isCronAuthorized(req)) return { ok: true as const, cron: true as const }
  const admin = await requireAdmin(req)
  if (admin.ok) return { ok: true as const, cron: false as const }
  if (!isProduction() && !isAuthEnabled()) {
    return { ok: true as const, cron: false as const }
  }
  return { ok: false as const, status: admin.status, message: admin.message }
}

export function parseAvecSyncMode(
  req: NextRequest,
  cronFallback: AvecSyncMode = 'fast',
): AvecSyncMode {
  const mode = req.nextUrl.searchParams.get('mode')
  if (mode === 'fast' || mode === 'full') return mode
  return cronFallback
}

export async function executeAvecSync(
  req: NextRequest,
  opts?: {
    force?: boolean
    defaultMode?: AvecSyncMode
    /** Ignora query `mode` — usado por /api/avec/sync/full. */
    forceMode?: AvecSyncMode
    /** Fatia do full (ops/agenda/catalog). Default all. */
    forceStage?: AvecSyncStage
    cron?: boolean
    webhook?: boolean
  },
) {
  const mode = opts?.forceMode ?? parseAvecSyncMode(req, opts?.defaultMode ?? 'fast')
  const stage: AvecSyncStage =
    mode === 'full' ? (opts?.forceStage ?? 'all') : 'all'

  if (!isAvecConfigured()) {
    if (opts?.cron) {
      return ok({
        skipped: true,
        reason: 'aguardando_avec_token',
        mode,
        stage,
        note: 'AVEC_API_TOKEN ausente — cron ignorado até terça',
      })
    }
    return err('Avec não configurado (AVEC_API_TOKEN)', 503)
  }

  const effectiveMode: AvecSyncMode = opts?.webhook && mode === 'full' ? 'fast' : mode
  const effectiveStage: AvecSyncStage =
    effectiveMode === 'full' ? stage : 'all'

  if (!opts?.force) {
    const last = await getLastAvecSync(effectiveMode, {
      finishedOnly: true,
      ...(effectiveMode === 'full' ? { stage: effectiveStage } : {}),
    })
    if (last?.created_at) {
      const age = Date.now() - new Date(last.created_at).getTime()
      const minGap =
        opts?.webhook && effectiveMode === 'fast'
          ? WEBHOOK_FAST_MIN_GAP_MS
          : effectiveMode === 'full'
            ? last.status === 'ok'
              ? FULL_MIN_GAP_MS
              : FULL_RETRY_MIN_GAP_MS
            : FAST_MIN_GAP_MS
      if (age >= 0 && age < minGap) {
        return ok({
          skipped: true,
          reason: 'sync_recente',
          mode: effectiveMode,
          stage: effectiveStage,
          last,
          schedule: effectiveMode === 'full' ? 'full' : 'intraday',
          note: `Último sync ${effectiveMode}${
            effectiveMode === 'full' && effectiveStage !== 'all'
              ? `/${effectiveStage}`
              : ''
          } há ${Math.round(age / 1000)}s — aguardando janela de ${minGap / 1000}s`,
        })
      }
    }
  }

  try {
    // Purge só em admin force — cron full já tem /api/avec/purge-snapshots.
    // Rodar purge+full no mesmo lambda estourava maxDuration (abandoned_partial_timeout).
    if (opts?.force && !opts?.cron && !opts?.webhook) {
      try {
        await purgeAvecStorageBloat({ keepSnapshotDays: 0, keepSyncRunDays: 2 })
      } catch (purgeErr) {
        if (isDbQuotaError(purgeErr)) {
          return err(dbQuotaUserMessage(purgeErr), 503)
        }
        throw purgeErr
      }
    }

    // Repair jsonb só em admin force — no cron full competia com o pooler e
    // atrasava o beginAvecSyncRun (request “viva” sem row em avec_sync_runs).
    if (effectiveMode === 'full' && opts?.force && !opts?.cron) {
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

    const run = await runAvecSync(effectiveMode, {
      stage: effectiveStage,
    })
    return ok({
      ...run,
      skipped: false,
      mode: effectiveMode,
      stage: effectiveStage,
      schedule: effectiveMode === 'fast' ? 'intraday' : 'full',
      note:
        effectiveMode === 'fast'
          ? 'Sync fast — agenda/caixa do dia (sem P1–P3)'
          : fullStageNote(effectiveStage),
    })
  } catch (e) {
    if (isSyncLockBusyError(e)) {
      return ok({
        skipped: true,
        reason: 'sync_em_andamento',
        mode: effectiveMode,
        stage: effectiveStage,
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
          stage: effectiveStage,
          note: dbQuotaUserMessage(e),
        })
      }
      return err(dbQuotaUserMessage(e), 503)
    }
    throw e
  }
}
