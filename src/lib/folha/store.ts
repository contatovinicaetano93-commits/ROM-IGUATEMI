/**
 * Persistência da Folha PJ (períodos + docs fiscais).
 * ensure* cria tabelas se a migration ainda não rodou (mesmo padrão 8123).
 */

import { getSql } from '@/lib/db'
import type { FolhaDraft, FolhaDraftLine } from '@/lib/folha/draft-from-8123'
import type { FolhaPeriodStatus } from '@/lib/folha/types'
import type { FolhaTaxKind } from '@/lib/folha/tax-parse'
import { asJsonArray } from '@/lib/sql-json'
import type { CommissionProfessionalRow } from '@/lib/salon/commission-metrics'

export type FolhaPeriodRow = {
  id: string
  year_month: string
  half: 1 | 2
  from_day: string
  to_day: string
  reference_day: string | null
  status: FolhaPeriodStatus
  lines: FolhaDraftLine[]
  source_professionals: CommissionProfessionalRow[]
  total_proposed_pay: number | null
  updated_by: string | null
  approved_by: string | null
  approved_at: string | null
  created_at: string
  updated_at: string
}

export type FolhaTaxDocumentRow = {
  id: number
  period_id: string | null
  kind: FolhaTaxKind
  professional_name: string | null
  amount: number | null
  raw_subject: string | null
  raw_body: string | null
  source: string
  created_at: string
}

let tablesReady: Promise<void> | null = null

export async function ensureFolhaTables() {
  if (!tablesReady) {
    tablesReady = (async () => {
      const sql = getSql()
      await sql`
        create table if not exists folha_periods (
          id text primary key,
          year_month text not null,
          half smallint not null check (half in (1, 2)),
          from_day date not null,
          to_day date not null,
          reference_day date,
          status text not null check (
            status in ('draft', 'ready_for_review', 'approved', 'paid')
          ),
          lines jsonb not null default '[]'::jsonb,
          source_professionals jsonb not null default '[]'::jsonb,
          total_proposed_pay numeric,
          updated_by text,
          approved_by text,
          approved_at timestamptz,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now()
        )
      `
      await sql`
        create table if not exists folha_tax_documents (
          id bigserial primary key,
          period_id text references folha_periods (id) on delete set null,
          kind text not null check (kind in ('darf', 'das', 'mensalidade', 'other')),
          professional_name text,
          amount numeric,
          raw_subject text,
          raw_body text,
          source text not null default 'manual',
          created_at timestamptz not null default now()
        )
      `
    })().catch((err) => {
      tablesReady = null
      throw err
    })
  }
  await tablesReady
}

function mapPeriod(row: Record<string, unknown> | null | undefined): FolhaPeriodRow | null {
  if (!row) return null
  const halfRaw = Number(row.half)
  const half: 1 | 2 = halfRaw === 2 ? 2 : 1
  const total =
    row.total_proposed_pay == null || row.total_proposed_pay === ''
      ? null
      : Number(row.total_proposed_pay)
  return {
    id: String(row.id),
    year_month: String(row.year_month),
    half,
    from_day: String(row.from_day).slice(0, 10),
    to_day: String(row.to_day).slice(0, 10),
    reference_day: row.reference_day ? String(row.reference_day).slice(0, 10) : null,
    status: row.status as FolhaPeriodStatus,
    lines: asJsonArray<FolhaDraftLine>(row.lines),
    source_professionals: asJsonArray<CommissionProfessionalRow>(row.source_professionals),
    total_proposed_pay: total != null && Number.isFinite(total) ? total : null,
    updated_by: row.updated_by != null ? String(row.updated_by) : null,
    approved_by: row.approved_by != null ? String(row.approved_by) : null,
    approved_at: row.approved_at != null ? String(row.approved_at) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  }
}

export async function getFolhaPeriod(id: string): Promise<FolhaPeriodRow | null> {
  await ensureFolhaTables()
  const sql = getSql()
  try {
    const rows = (await sql`
      select
        id, year_month, half,
        from_day::text as from_day, to_day::text as to_day,
        reference_day::text as reference_day,
        status, lines, source_professionals, total_proposed_pay,
        updated_by, approved_by, approved_at, created_at, updated_at
      from folha_periods
      where id = ${id}
      limit 1
    `) as Record<string, unknown>[]
    return mapPeriod(rows[0])
  } catch {
    return null
  }
}

export async function getLatestFolhaPeriod(): Promise<FolhaPeriodRow | null> {
  await ensureFolhaTables()
  const sql = getSql()
  try {
    const rows = (await sql`
      select
        id, year_month, half,
        from_day::text as from_day, to_day::text as to_day,
        reference_day::text as reference_day,
        status, lines, source_professionals, total_proposed_pay,
        updated_by, approved_by, approved_at, created_at, updated_at
      from folha_periods
      order by to_day desc, updated_at desc
      limit 1
    `) as Record<string, unknown>[]
    return mapPeriod(rows[0])
  } catch {
    return null
  }
}

export async function upsertFolhaPeriodFromDraft(args: {
  draft: FolhaDraft
  status?: FolhaPeriodStatus
  sourceProfessionals: CommissionProfessionalRow[]
  updatedBy?: string | null
  /** Se omitido e período já existe, mantém status atual (exceto refresh forçado). */
  forceStatus?: boolean
}): Promise<FolhaPeriodRow> {
  await ensureFolhaTables()
  const sql = getSql()
  const { draft } = args
  const existing = await getFolhaPeriod(draft.quinzena.id)
  const status: FolhaPeriodStatus =
    args.forceStatus && args.status
      ? args.status
      : existing?.status && existing.status !== 'draft' && !args.forceStatus
        ? existing.status
        : (args.status ?? existing?.status ?? 'draft')

  await sql`
    insert into folha_periods (
      id, year_month, half, from_day, to_day, reference_day,
      status, lines, source_professionals, total_proposed_pay,
      updated_by, updated_at
    ) values (
      ${draft.quinzena.id},
      ${draft.quinzena.yearMonth},
      ${draft.quinzena.half},
      ${draft.quinzena.from}::date,
      ${draft.quinzena.to}::date,
      ${draft.reference_day}::date,
      ${status},
      ${draft.lines},
      ${args.sourceProfessionals},
      ${draft.total_proposed_pay},
      ${args.updatedBy ?? null},
      now()
    )
    on conflict (id) do update set
      reference_day = excluded.reference_day,
      status = excluded.status,
      lines = excluded.lines,
      source_professionals = excluded.source_professionals,
      total_proposed_pay = excluded.total_proposed_pay,
      updated_by = excluded.updated_by,
      updated_at = now()
  `

  const row = await getFolhaPeriod(draft.quinzena.id)
  if (!row) throw new Error('falha ao persistir período da Folha')
  return row
}

export async function updateFolhaPeriodStatus(args: {
  id: string
  status: FolhaPeriodStatus
  actor?: string | null
}): Promise<FolhaPeriodRow | null> {
  await ensureFolhaTables()
  const sql = getSql()
  const approved = args.status === 'approved' || args.status === 'paid'
  await sql`
    update folha_periods set
      status = ${args.status},
      updated_by = ${args.actor ?? null},
      approved_by = case when ${approved} then ${args.actor ?? null} else approved_by end,
      approved_at = case when ${approved} then now() else approved_at end,
      updated_at = now()
    where id = ${args.id}
  `
  return getFolhaPeriod(args.id)
}

export async function saveFolhaPeriodLines(args: {
  id: string
  lines: FolhaDraftLine[]
  totalProposedPay: number | null
  updatedBy?: string | null
}): Promise<FolhaPeriodRow | null> {
  await ensureFolhaTables()
  const sql = getSql()
  await sql`
    update folha_periods set
      lines = ${args.lines},
      total_proposed_pay = ${args.totalProposedPay},
      updated_by = ${args.updatedBy ?? null},
      updated_at = now()
    where id = ${args.id}
  `
  return getFolhaPeriod(args.id)
}

export async function insertFolhaTaxDocument(args: {
  periodId: string | null
  kind: FolhaTaxKind
  professionalName: string | null
  amount: number | null
  subject?: string | null
  body?: string | null
  source?: string
}): Promise<FolhaTaxDocumentRow> {
  await ensureFolhaTables()
  const sql = getSql()
  const rows = (await sql`
    insert into folha_tax_documents (
      period_id, kind, professional_name, amount, raw_subject, raw_body, source
    ) values (
      ${args.periodId},
      ${args.kind},
      ${args.professionalName},
      ${args.amount},
      ${args.subject ?? null},
      ${args.body ?? null},
      ${args.source ?? 'manual'}
    )
    returning
      id, period_id, kind, professional_name, amount,
      raw_subject, raw_body, source, created_at
  `) as Record<string, unknown>[]
  const r = rows[0]
  if (!r) throw new Error('falha ao gravar documento fiscal')
  return {
    id: Number(r.id),
    period_id: r.period_id != null ? String(r.period_id) : null,
    kind: r.kind as FolhaTaxKind,
    professional_name: r.professional_name != null ? String(r.professional_name) : null,
    amount: r.amount == null ? null : Number(r.amount),
    raw_subject: r.raw_subject != null ? String(r.raw_subject) : null,
    raw_body: r.raw_body != null ? String(r.raw_body) : null,
    source: String(r.source),
    created_at: String(r.created_at),
  }
}
