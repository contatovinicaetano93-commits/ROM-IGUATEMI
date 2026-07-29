-- Despesas Omie (Contas a Pagar) — source/external_id para upsert idempotente.
alter table finance_expenses add column if not exists source text not null default 'manual';
alter table finance_expenses add column if not exists external_id text;
alter table finance_expenses add column if not exists omie_status text;
alter table finance_expenses add column if not exists omie_category_code text;

create unique index if not exists finance_expenses_source_external_uidx
  on finance_expenses (source, external_id)
  where external_id is not null;

create index if not exists finance_expenses_source_idx
  on finance_expenses (source);
