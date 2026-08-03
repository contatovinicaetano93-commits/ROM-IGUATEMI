import { NextRequest } from 'next/server'
import { err, handleError, ok } from '@/lib/api-response'
import { isAvecConfigured } from '@/lib/avec/client'
import { ensureFreshAvecApiToken } from '@/lib/avec/token-store'
import { syncDirectorVisits } from '@/lib/avec/sync-director-visits'
import type { AvecSyncStats } from '@/lib/avec/sync'
import { authorizeAvecSync } from '@/lib/avec/sync-http'
import { getDeploymentContext } from '@/lib/deployment'
import { listVisitCoverage } from '@/lib/director-report/from-db'

/**
 * Sync só das visitas 0002 → salon_client_visits (Relatório gerência offline).
 * Separado do full/agenda para não depender do min-gap nem do budget das outras etapas.
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

/** GET — cron/admin: sincroniza visitas. `?status=1` só consulta cobertura. */
export async function GET(req: NextRequest) {
  try {
    const auth = await authorizeAvecSync(req)
    if (!auth.ok) return err(auth.message, auth.status)

    if (req.nextUrl.searchParams.get('status') === '1') {
      const status = await listVisitCoverage()
      return ok({
        ...status,
        ready: status.coverage.some((c) => !c.truncated && c.row_count > 0),
        note: 'Cobertura do warehouse 0011. POST ou GET sem status=1 para sincronizar.',
      })
    }

    return await runSync()
  } catch (e) {
    return handleError(e)
  }
}

/** POST — força sync das visitas do Relatório gerência. */
export async function POST(req: NextRequest) {
  try {
    const auth = await authorizeAvecSync(req)
    if (!auth.ok) return err(auth.message, auth.status)
    return await runSync()
  } catch (e) {
    return handleError(e)
  }
}

async function runSync() {
  if (!isAvecConfigured()) {
    return err('Avec não configurado (AVEC_API_TOKEN)', 503)
  }

  await ensureFreshAvecApiToken({ minHoursLeft: 1 }).catch(() => {})

  const stats = emptyStats()
  await syncDirectorVisits(stats)
  const status = await listVisitCoverage()

  const okRun = stats.errors.length === 0
  return ok({
    ran: true,
    status: okRun ? (stats.warnings.some((w) => /truncado/i.test(w)) ? 'partial' : 'ok') : 'error',
    director_visits_upserted: stats.director_visits_upserted ?? 0,
    warnings: stats.warnings,
    errors: stats.errors,
    coverage: status.coverage,
    visit_rows: status.visit_rows,
    note: 'Relatório gerência usa este warehouse quando a cobertura dos 4 trimestres (selecionado/comparativo + priors) não está truncada.',
  })
}
