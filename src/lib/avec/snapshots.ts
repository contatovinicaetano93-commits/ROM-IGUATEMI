import { getSql } from '@/lib/db'

/** Mantém só os N snapshots mais recentes por report_id (quota Neon). */
export async function pruneReportSnapshots(keepPerReport = 5): Promise<number> {
  const sql = getSql()
  const keep = Math.max(1, Math.floor(keepPerReport))
  try {
    const deleted = (await sql`
      with ranked as (
        select id,
               row_number() over (
                 partition by report_id
                 order by fetched_at desc nulls last, id desc
               ) as rn
        from avec_report_snapshots
      )
      delete from avec_report_snapshots s
      using ranked r
      where s.id = r.id and r.rn > ${keep}
      returning s.id
    `) as { id: string }[]
    return deleted.length
  } catch {
    return 0
  }
}

export async function saveReportSnapshot(
  reportId: string,
  params: Record<string, unknown>,
  payload: unknown,
  syncRunId?: string
) {
  const sql = getSql()
  const rows = Array.isArray(payload) ? payload : []
  await sql`
    insert into avec_report_snapshots (report_id, params, row_count, payload, sync_run_id)
    values (
      ${reportId},
      ${JSON.stringify(params)}::jsonb,
      ${rows.length},
      ${JSON.stringify(rows)}::jsonb,
      ${syncRunId ?? null}
    )
  `
}

export async function getLatestSnapshot(reportId: string) {
  const sql = getSql()
  const rows = (await sql`
    select * from avec_report_snapshots
    where report_id = ${reportId}
    order by fetched_at desc
    limit 1
  `) as { report_id: string; payload: unknown; fetched_at: string; row_count: number }[]
  return rows[0] ?? null
}
