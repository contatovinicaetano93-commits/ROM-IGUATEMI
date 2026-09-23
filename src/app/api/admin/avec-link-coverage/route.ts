import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/api-response'
import { requireAdmin } from '@/lib/auth'
import { listDirectorReportProfessionals } from '@/lib/director-report/professionals'
import { listEmployees } from '@/lib/employees'
import { computeAvecLinkCoverage } from '@/lib/intranet/avec-link-coverage'

/**
 * GET — cobertura de vínculo Avec (admin).
 * Staff ativo com/sem professional_name; roster de piso com avec_pro_id; % linked.
 * Percentuais ausentes → null (não inventa 0).
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdmin(req)
    if (!auth.ok) return err(auth.message, auth.status)

    const employees = await listEmployees()
    const floorRoster = listDirectorReportProfessionals(true)
    const coverage = computeAvecLinkCoverage(employees, floorRoster)

    return ok({
      coverage,
      floor_roster: floorRoster.map((pro) => ({
        id: pro.id,
        name: pro.name,
        avec_pro_id: pro.avec_pro_id,
        role: pro.role,
      })),
    })
  } catch (e) {
    return handleError(e)
  }
}
