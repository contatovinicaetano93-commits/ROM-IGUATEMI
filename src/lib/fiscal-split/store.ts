import { getSql } from '@/lib/db'
import type { FiscalSplitRecord, FiscalSplitSummary, NormalizedFiscalSplit } from './types'
import { isFiscalSplitConfigured } from './client'

let ensureTablePromise: Promise<void> | null = null

async function createFiscalSplitTable(): Promise<void> {
  const sql = getSql()
  await sql`
    create table if not exists finance_fiscal_splits (
      id uuid primary key default gen_random_uuid(),
      operation_id text not null,
      arrangement text,
      doc_fiscal text,
      paid_amount numeric(14, 2) not null default 0,
      cbs_amount numeric(14, 2) not null default 0,
      ibs_amount numeric(14, 2) not null default 0,
      net_amount numeric(14, 2) not null default 0,
      status text not null default 'pending'
        check (status in ('pending', 'settled', 'partial', 'error')),
      source text not null default 'import',
      settled_at date,
      raw_payload jsonb not null default '{}'::jsonb,
      imported_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint finance_fiscal_splits_operation_id_uniq unique (operation_id)
    )
  `
  await sql`
    create index if not exists finance_fiscal_splits_settled_at_idx
      on finance_fiscal_splits (settled_at desc nulls last)
  `
  await sql`
    create index if not exists finance_fiscal_splits_status_idx
      on finance_fiscal_splits (status)
  `
}

/** Idempotente e memoizado por processo — evita DDL duplo no load do Financeiro. */
export async function ensureFiscalSplitTable(): Promise<void> {
  if (!ensureTablePromise) {
    ensureTablePromise = createFiscalSplitTable().catch((e) => {
      ensureTablePromise = null
      throw e
    })
  }
  return ensureTablePromise
}

/**
 * Upsert idempotente por operation_id — reimportar não duplica lançamentos.
 */
export async function upsertFiscalSplit(
  settlement: NormalizedFiscalSplit,
  source = 'import'
): Promise<{ record: FiscalSplitRecord; created: boolean }> {
  const sql = getSql()
  const existing = (await sql`
    select id from finance_fiscal_splits where operation_id = ${settlement.operationId} limit 1
  `) as { id: string }[]

  const rows = (await sql`
    insert into finance_fiscal_splits (
      operation_id, arrangement, doc_fiscal,
      paid_amount, cbs_amount, ibs_amount, net_amount,
      status, source, settled_at, raw_payload
    )
    values (
      ${settlement.operationId},
      ${settlement.arrangement},
      ${settlement.docFiscal},
      ${settlement.paidAmount},
      ${settlement.cbsAmount},
      ${settlement.ibsAmount},
      ${settlement.netAmount},
      ${settlement.status},
      ${source},
      ${settlement.settledAt}::date,
      ${JSON.stringify(settlement.rawPayload)}::jsonb
    )
    on conflict (operation_id) do update set
      arrangement = excluded.arrangement,
      doc_fiscal = excluded.doc_fiscal,
      paid_amount = excluded.paid_amount,
      cbs_amount = excluded.cbs_amount,
      ibs_amount = excluded.ibs_amount,
      net_amount = excluded.net_amount,
      status = excluded.status,
      source = excluded.source,
      settled_at = excluded.settled_at,
      raw_payload = excluded.raw_payload,
      updated_at = now()
    returning
      id, operation_id, arrangement, doc_fiscal,
      paid_amount::float as paid_amount,
      cbs_amount::float as cbs_amount,
      ibs_amount::float as ibs_amount,
      net_amount::float as net_amount,
      status, source,
      settled_at::text as settled_at,
      imported_at, updated_at
  `) as FiscalSplitRecord[]

  return { record: rows[0]!, created: existing.length === 0 }
}

export async function listFiscalSplits(from: string, to: string): Promise<FiscalSplitRecord[]> {
  const sql = getSql()
  return (await sql`
    select
      id, operation_id, arrangement, doc_fiscal,
      paid_amount::float as paid_amount,
      cbs_amount::float as cbs_amount,
      ibs_amount::float as ibs_amount,
      net_amount::float as net_amount,
      status, source,
      coalesce(settled_at, (imported_at at time zone 'America/Sao_Paulo')::date)::text as settled_at,
      imported_at, updated_at
    from finance_fiscal_splits
    where coalesce(settled_at, (imported_at at time zone 'America/Sao_Paulo')::date) >= ${from}::date
      and coalesce(settled_at, (imported_at at time zone 'America/Sao_Paulo')::date) <= ${to}::date
    order by coalesce(settled_at, (imported_at at time zone 'America/Sao_Paulo')::date) desc,
             imported_at desc
  `) as FiscalSplitRecord[]
}

export async function getFiscalSplitSummary(from: string, to: string): Promise<FiscalSplitSummary> {
  const sql = getSql()
  try {
    const rows = (await sql`
      select
        coalesce(sum(paid_amount), 0)::float as gross_paid,
        coalesce(sum(cbs_amount), 0)::float as cbs_retained,
        coalesce(sum(ibs_amount), 0)::float as ibs_retained,
        coalesce(sum(net_amount), 0)::float as net_received,
        count(*) filter (where status = 'pending')::int as pending_count,
        count(*) filter (where status in ('settled', 'partial'))::int as settled_count
      from finance_fiscal_splits
      where coalesce(settled_at, (imported_at at time zone 'America/Sao_Paulo')::date) >= ${from}::date
        and coalesce(settled_at, (imported_at at time zone 'America/Sao_Paulo')::date) <= ${to}::date
    `) as {
      gross_paid: number
      cbs_retained: number
      ibs_retained: number
      net_received: number
      pending_count: number
      settled_count: number
    }[]

    const row = rows[0]
    return {
      gross_paid: Math.round((row?.gross_paid ?? 0) * 100) / 100,
      cbs_retained: Math.round((row?.cbs_retained ?? 0) * 100) / 100,
      ibs_retained: Math.round((row?.ibs_retained ?? 0) * 100) / 100,
      net_received: Math.round((row?.net_received ?? 0) * 100) / 100,
      pending_count: row?.pending_count ?? 0,
      settled_count: row?.settled_count ?? 0,
      configured: isFiscalSplitConfigured(),
    }
  } catch {
    // Tabela ainda não migrada — financeiro continua sem quebrar.
    return {
      gross_paid: 0,
      cbs_retained: 0,
      ibs_retained: 0,
      net_received: 0,
      pending_count: 0,
      settled_count: 0,
      configured: isFiscalSplitConfigured(),
    }
  }
}
