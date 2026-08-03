import { NextRequest } from 'next/server'
import { err, handleError, ok } from '@/lib/api-response'
import { isAvecConfigured } from '@/lib/avec/client'
import { ensureFreshAvecApiToken } from '@/lib/avec/token-store'
import {
  isDirectorVisitQuarterKey,
  syncDirectorVisits,
} from '@/lib/avec/sync-director-visits'
import type { AvecSyncStats } from '@/lib/avec/sync'
import { authorizeAvecSync } from '@/lib/avec/sync-http'
import { getDeploymentContext } from '@/lib/deployment'
import { listVisitCoverage, probe0011FromDb } from '@/lib/director-report/from-db'
import { previousQuarterKey } from '@/lib/director-report/local-0011'
import { currentQuarterKeySp } from '@/lib/director-report/period'
import type { QuarterKey } from '@/lib/director-report/types'

/**
 * Sync só das visitas 0002 → salon_client_visits (Relatório gerência offline).
 * Separado do full/agenda para não depender do min-gap nem do budget das outras etapas.
 *
 * Query: `?status=1` só cobertura · `?quarter=2026-Q2` um trimestre · `?force=1` refaz.
 */
export const maxDuration = 800

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
    director_visits_upserted: 0,
  }
}

function parseQuarterParam(req: NextRequest): QuarterKey[] | undefined {
  const raw = req.nextUrl.searchParams.get('quarter')
  if (!raw) return undefined
  const parts = raw.split(',').map((s) => s.trim()).filter(Boolean)
  const bad = parts.find((p) => !isDirectorVisitQuarterKey(p))
  if (bad) throw Object.assign(new Error(`Trimestre inválido: ${bad}`), { status: 400 })
  return parts as QuarterKey[]
}

/** GET — cron/admin: sincroniza visitas. `?status=1` só consulta cobertura. */
export async function GET(req: NextRequest) {
  try {
    const auth = await authorizeAvecSync(req)
    if (!auth.ok) return err(auth.message, auth.status)

    if (req.nextUrl.searchParams.get('status') === '1') {
      const status = await listVisitCoverage()
      const probe =
        req.nextUrl.searchParams.get('probe_0011') === '1' ||
        req.nextUrl.searchParams.get('probe_0011') === 'true'
      let report_probe: Awaited<ReturnType<typeof probe0011FromDb>> | null = null
      if (probe) {
        const selected =
          (req.nextUrl.searchParams.get('selected') as QuarterKey | null) &&
          isDirectorVisitQuarterKey(req.nextUrl.searchParams.get('selected')!)
            ? (req.nextUrl.searchParams.get('selected') as QuarterKey)
            : previousQuarterKey(currentQuarterKeySp())
        const compareRaw = req.nextUrl.searchParams.get('compare')
        const compare =
          compareRaw && isDirectorVisitQuarterKey(compareRaw)
            ? compareRaw
            : previousQuarterKey(selected)
        report_probe = await probe0011FromDb(selected, compare)
      }
      return ok({
        ...status,
        ready: status.coverage.some((c) => !c.truncated && c.row_count > 0),
        report_probe,
        note: probe
          ? 'Cobertura + probe 0011 do warehouse (Na lista / taxas).'
          : 'Cobertura do warehouse 0011. POST ou GET sem status=1 para sincronizar. Use probe_0011=1 para totais.',
      })
    }

    return await runSync(req)
  } catch (e) {
    return handleError(e)
  }
}

/** POST — força sync das visitas do Relatório gerência. */
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

  let quarters: QuarterKey[] | undefined
  try {
    quarters = parseQuarterParam(req)
  } catch (e) {
    const status = e && typeof e === 'object' && 'status' in e ? Number((e as { status: number }).status) : 400
    return err(e instanceof Error ? e.message : 'Trimestre inválido', status)
  }

  const force =
    req.nextUrl.searchParams.get('force') === '1' ||
    req.nextUrl.searchParams.get('force') === 'true'

  await ensureFreshAvecApiToken({ minHoursLeft: 1 }).catch(() => {})

  const stats = emptyStats()
  await syncDirectorVisits(stats, undefined, { quarters, force })
  const status = await listVisitCoverage()

  const okRun = stats.errors.length === 0
  return ok({
    ran: true,
    status: okRun ? (stats.warnings.some((w) => /truncado/i.test(w)) ? 'partial' : 'ok') : 'error',
    director_visits_upserted: stats.director_visits_upserted ?? 0,
    quarters: quarters ?? null,
    force,
    warnings: stats.warnings,
    errors: stats.errors,
    coverage: status.coverage,
    visit_rows: status.visit_rows,
    note: 'Relatório gerência usa este warehouse quando a cobertura dos 4 trimestres (selecionado/comparativo + priors) não está truncada.',
  })
}
