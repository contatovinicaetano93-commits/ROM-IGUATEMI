import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/api-response'
import { requireAdmin } from '@/lib/auth'
import { isCronAuthorized } from '@/lib/cron-auth'
import { getIntranetSql, peekResolvedIntranetDatabaseUrl } from '@/lib/db'
import { ensureIntranetSchema } from '@/lib/intranet/ensure-schema'

async function authorize(req: NextRequest) {
  if (isCronAuthorized(req)) return { ok: true as const }
  const auth = await requireAdmin(req)
  if (!auth.ok) return auth
  return { ok: true as const }
}

function dbHost(url: string | null | undefined): string | null {
  if (!url) return null
  const match = url.match(/@([^/:?]+)/)
  return match?.[1] ?? null
}

/** POST — aplica deltas intranet no banco da intranet (sem migrations do salão). */
export async function POST(req: NextRequest) {
  try {
    const auth = await authorize(req)
    if (!auth.ok) return err(auth.message, auth.status)

    const host = dbHost(peekResolvedIntranetDatabaseUrl())
    const applied = await ensureIntranetSchema()

    const sql = getIntranetSql()
    const tables = (await sql.unsafe(`
      select table_name
      from information_schema.tables
      where table_schema = 'public'
        and table_name in (
          'intranet_employees',
          'intranet_employee_modules',
          'intranet_employee_companies',
          'intranet_employee_areas'
        )
      order by table_name
    `)) as { table_name: string }[]

    const cols = (await sql.unsafe(`
      select column_name
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'intranet_employees'
        and column_name = 'professional_name'
    `)) as { column_name: string }[]

    const names = tables.map((t) => t.table_name)
    return ok({
      host,
      files: applied.files,
      tables: names,
      professionalNameReady: cols.length > 0,
      modulesReady: names.includes('intranet_employee_modules'),
    })
  } catch (e) {
    return handleError(e)
  }
}
