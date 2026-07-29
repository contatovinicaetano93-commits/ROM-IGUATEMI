-- Despesas Omie (Contas a Pagar) — 2 CNPJs por unidade: servicos + comercio.
alter table finance_expenses add column if not exists source text not null default 'manual';
alter table finance_expenses add column if not exists external_id text;
alter table finance_expenses add column if not exists omie_status text;
alter table finance_expenses add column if not exists omie_category_code text;
alter table finance_expenses add column if not exists omie_cnpj_kind text;

-- Legado (sync com 1 app): assume serviços
update finance_expenses
set omie_cnpj_kind = 'servicos'
where source = 'omie' and omie_cnpj_kind is null;

drop index if exists finance_expenses_source_external_uidx;

create unique index if not exists finance_expenses_omie_kind_external_uidx
  on finance_expenses (source, omie_cnpj_kind, external_id)
  where source = 'omie' and external_id is not null and omie_cnpj_kind is not null;

create index if not exists finance_expenses_source_idx
  on finance_expenses (source);

create index if not exists finance_expenses_omie_cnpj_kind_idx
  on finance_expenses (omie_cnpj_kind)
  where omie_cnpj_kind is not null;
