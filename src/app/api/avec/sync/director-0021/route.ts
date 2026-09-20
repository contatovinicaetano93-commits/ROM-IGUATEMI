import { NextRequest } from 'next/server'
import { err, handleError, ok } from '@/lib/api-response'
import { isAvecConfigured } from '@/lib/avec/client'
import { ensureFreshAvecApiToken } from '@/lib/avec/token-store'
import {
  isDirector0021MonthKey,
  syncDirector0021,
} from '@/lib/avec/sync-director-0021'
import type { AvecSyncStats } from '@/lib/avec/sync'
import { authorizeAvecSync } from '@/lib/avec/sync-http'
import { warnIfLongMaxDuration } from '@/lib/vercel-runtime'
import { getDeploymentContext } from '@/lib/deployment'
import {
  is0021MonthCoverageReady,
  list0021MonthCoverage,
} from '@/lib/director-report/from-db'
import { currentMonthKeySp } from '@/lib/director-report/period'
import type { MonthKey } from '@/lib/director-report/types'
import {
  isSyncLockBusyError,
  SYNC_LOCK_KEYS,
  withSyncLock,
} from '@/lib/sync-lock'

/**
 * Sync Avec 0021 → salon_director_0021_months (faturamento por profissional, mês calendário).
 * Separado do full/agenda para backfill e cron dedicados.
 *
 * Lock: usa `avecFull` (Option A) — evita corrida com full/agenda sem nested lock.
 *
 * Query: `?status=1` só cobertura · `?month=2025-01` ou `?months=2025-01,2025-02` · `?force=1`.
 */
export const maxDuration = 800
warnIfLongMaxDuration('/api/avec/sync/director-0021', maxDuration)

function emptyStats(): AvecSyncStats {
  const deployment = getDeploymentContext()
  return {
    panel: deployment.panel,
    deployment_host: deployment.host,
    clients_upserted: 0,
    appointments_synced: 0,
    attendances_synced: 0,
    services_created: 0,
    services_scheduled: 0,
    services_completed: 0,
    revenue_rows: 0,
    cancellation_rows: 0,
    snapshots_saved: 0,
    errors: [],
    warnings: [],
    director_0021_months_upserted: 0,
  }
}

function parseMonthParams(req: NextRequest): MonthKey[] | undefined {
  const single = req.nextUrl.searchParams.get('month')
  const multi = req.nextUrl.searchParams.get('months')
  const raw = multi ?? single
  if (!raw) return undefined
  const parts = raw.split(',').map((s) => s.trim()).filter(Boolean)
  const bad = parts.find((p) => !isDirector0021MonthKey(p))
  if (bad) throw Object.assign(new Error(`Mês inválido: ${bad}`), { status: 400 })
  return parts as MonthKey[]
}

function default0021CoverageStatus(coverage: Awaited<ReturnType<typeof list0021MonthCoverage>>['coverage']) {
  const current = currentMonthKeySp()
  const [yStr, mStr] = current.split('-')
  let y = Number(yStr)
  let m = Number(mStr)
  const months: MonthKey[] = []
  for (let i = 0; i < 8; i++) {
    months.push(`${y}-${String(m).padStart(2, '0')}` as MonthKey)
    m -= 1
    if (m < 1) {
      m = 12
      y -= 1
    }
  }
  const byMonth = new Map(coverage.map((c) => [c.month, c]))
  const missing = months.filter((mo) => !is0021MonthCoverageReady(byMonth.get(mo)))
  const lastSyncedAt = coverage
    .map((c) => c.synced_at)
    .filter(Boolean)
    .sort()
    .at(-1) ?? null
  return {
    ready_for_default_0021: missing.length === 0,
    default_0021_months: months,
    default_0021_missing: missing,
    last_synced_at: lastSyncedAt,
  }
}

/** GET — cron/admin: sincroniza 0021. `?status=1` só consulta cobertura. */
export async function GET(req: NextRequest) {
  try {
    const auth = await authorizeAvecSync(req)
    if (!auth.ok) return err(auth.message, auth.status)

    if (req.nextUrl.searchParams.get('status') === '1') {
      const status = await list0021MonthCoverage()
      const defaultStatus = default0021CoverageStatus(status.coverage)
      return ok({
        ...status,
        ...defaultStatus,
        ready: status.coverage.some((c) => !c.truncated && c.row_count > 0),
        note: 'Cobertura 0021 (faturamento por profissional, mês calendário). POST ou GET sem status=1 para sincronizar.',
      })
    }

    return await runSync(req)
  } catch (e) {
    return handleError(e)
  }
}

/** POST — força sync do 0021 do Relatório gerência. */
export async function POST(req: NextRequest) {
  try {
    const auth = await authorizeAvecSync(req)
    if (!auth.ok) return err(auth.message, auth.status)

    return await runSync(req)
  } catch (e) {
    return handleError(e)
  }
}

async function runSync(req: NextRequest) {
  if (!isAvecConfigured()) {
    return err('Avec não configurado (AVEC_API_TOKEN)', 503)
  }

  let months: MonthKey[] | undefined
  try {
    months = parseMonthParams(req)
  } catch (e) {
    const status = e && typeof e === 'object' && 'status' in e ? Number((e as { status: number }).status) : 400
    return err(e instanceof Error ? e.message : 'Mês inválido', status)
  }

  const force =
    req.nextUrl.searchParams.get('force') === '1' ||
    req.nextUrl.searchParams.get('force') === 'true'

  try {
    return await withSyncLock(
      SYNC_LOCK_KEYS.avecFull,
      async () => {
        await ensureFreshAvecApiToken({ minHoursLeft: 1 }).catch(() => {})

        const stats = emptyStats()
        await syncDirector0021(stats, undefined, { months, force })
        const status = await list0021MonthCoverage()

        const okRun = stats.errors.length === 0
        return ok({
          ran: true,
          status: okRun ? (stats.warnings.some((w) => /truncado/i.test(w)) ? 'partial' : 'ok') : 'error',
          director_0021_months_upserted: stats.director_0021_months_upserted ?? 0,
          months: months ?? null,
          force,
          warnings: stats.warnings,
          errors: stats.errors,
          coverage: status.coverage,
          month_rows: status.month_rows,
          note: 'Relatório gerência usa este warehouse 0021 quando a cobertura do mês não está truncada.',
        })
      },
      { ttlMs: 15 * 60 * 1000, owner: 'avec-director-0021' },
    )
  } catch (e) {
    if (isSyncLockBusyError(e)) {
      return ok({
        skipped: true,
        reason: 'sync_em_andamento',
        holder: e.holder,
        expires_at: e.expiresAt,
        note: 'Lock avecFull — full/agenda ou outro director-0021 em andamento.',
      })
    }
    throw e
  }
}
