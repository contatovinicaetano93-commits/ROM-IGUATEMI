import { getSql } from '@/lib/db'

/** Relatórios de valorização de estoque — UI lê o payload (stock.ts). Demais: só metadados. */
export const SNAPSHOT_PAYLOAD_REPORT_IDS = new Set(['0045', '0242', '0243', '0142'])

export type SaveReportSnapshotOptions = {
  /** Se false/omitido, grava payload vazio (evita estourar Neon free). */
  keepPayload?: boolean
  /** Quantos snapshots recentes manter por report_id após o insert (default 1). */
  retain?: number
}

export async function saveReportSnapshot(
  reportId: string,
  params: Record<string, unknown>,
  payload: unknown,
  syncRunId?: string,
  opts?: SaveReportSnapshotOptions
) {
  const sql = getSql()
  const rows = Array.isArray(payload) ? payload : []
  const keepPayload = opts?.keepPayload ?? SNAPSHOT_PAYLOAD_REPORT_IDS.has(reportId)
  const stored = keepPayload ? rows : []
  const retain = Math.max(1, opts?.retain ?? 1)

  await sql`
    insert into avec_report_snapshots (report_id, params, row_count, payload, sync_run_id)
    values (
      ${reportId},
      ${JSON.stringify(params)}::jsonb,
      ${rows.length},
      ${JSON.stringify(stored)}::jsonb,
      ${syncRunId ?? null}
    )
  `

  // Mantém só N mais recentes — impede crescimento ilimitado com cron.
  await sql`
    delete from avec_report_snapshots
    where id in (
      select id from (
        select id,
               row_number() over (order by fetched_at desc) as rn
        from avec_report_snapshots
        where report_id = ${reportId}
      ) ranked
      where rn > ${retain}
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

export type PurgeSnapshotsResult = {
  snapshots_deleted: number
  sync_runs_deleted: number
  payloads_cleared: number
}

/**
 * Recupera espaço no Neon: DELETE primeiro (não UPDATE) — sob size-limit o UPDATE
 * de jsonb enorme precisa de espaço livre e falha com "could not extend file".
 * Depois zera payloads legados remanescentes e limpa sync runs velhos.
 *
 * Nota: no Neon free o espaço físico pode só cair após VACUUM no console.
 */
export async function purgeAvecStorageBloat(opts?: {
  keepSnapshotDays?: number
  keepSyncRunDays?: number
}): Promise<PurgeSnapshotsResult> {
  const sql = getSql()
  const keepSnapshotDays = Math.max(0, opts?.keepSnapshotDays ?? 0)
  const keepSyncRunDays = Math.max(1, opts?.keepSyncRunDays ?? 3)

  // 1) DELETE primeiro — libera linhas sem reescrever jsonb gigante.
  let snapshotsDeleted = 0
  if (keepSnapshotDays <= 0) {
    const deleted = (await sql`
      delete from avec_report_snapshots
      where id not in (
        select distinct on (report_id) id
        from avec_report_snapshots
        order by report_id, fetched_at desc
      )
      returning id
    `) as { id: string }[]
    snapshotsDeleted = deleted.length
  } else {
    const cutoff = new Date(Date.now() - keepSnapshotDays * 86_400_000).toISOString()
    const deleted = (await sql`
      delete from avec_report_snapshots
      where fetched_at < ${cutoff}::timestamptz
      returning id
    `) as { id: string }[]
    snapshotsDeleted = deleted.length
  }

  // 2) Zera payloads remanescentes (não-valorização) — após DELETE, bem menor.
  const cleared = (await sql`
    update avec_report_snapshots
    set payload = '[]'::jsonb
    where payload is not null
      and payload <> '[]'::jsonb
      and report_id not in ('0045', '0242', '0243', '0142')
    returning id
  `) as { id: string }[]

  const runsCutoff = new Date(Date.now() - keepSyncRunDays * 86_400_000).toISOString()
  const runs = (await sql`
    delete from avec_sync_runs
    where created_at < ${runsCutoff}::timestamptz
    returning id
  `) as { id: string }[]

  return {
    snapshots_deleted: snapshotsDeleted,
    sync_runs_deleted: runs.length,
    payloads_cleared: cleared.length,
  }
}
