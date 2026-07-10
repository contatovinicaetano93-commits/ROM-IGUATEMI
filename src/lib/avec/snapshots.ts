import { getSql } from '@/lib/db'

/** Garante a tabela de snapshots (idempotente) — evita sync morrer se o delta não rodou. */
export async function ensureReportSnapshotsTable() {
  const sql = getSql()
  await sql`
    create table if not exists avec_report_snapshots (
      id uuid primary key default gen_random_uuid(),
      report_id text not null,
      params jsonb not null default '{}',
      row_count int not null default 0,
      payload jsonb not null default '[]',
      sync_run_id uuid references avec_sync_runs (id) on delete set null,
      fetched_at timestamptz not null default now()
    )
  `
  await sql`
    create index if not exists avec_report_snapshots_report_idx
      on avec_report_snapshots (report_id, fetched_at desc)
  `
}

export async function saveReportSnapshot(
  reportId: string,
  params: Record<string, unknown>,
  payload: unknown,
  syncRunId?: string
) {
  const sql = getSql()
  const rows = Array.isArray(payload) ? payload : []
  try {
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
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('avec_report_snapshots') && msg.includes('does not exist')) {
      await ensureReportSnapshotsTable()
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
      return
    }
    throw e
  }
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
