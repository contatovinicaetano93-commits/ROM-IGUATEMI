-- Split fiscal (CBS/IBS) — conciliação operacional para o Financeiro.
-- Fonte: payloads no formato da Plataforma Pública de Split Payment (RFB/CGIBS).
-- O ROM é consumidor/conciliador; não processa liquidação como PSP.

create table if not exists finance_fiscal_splits (
  id uuid primary key default gen_random_uuid(),
  -- Identificador estável da operação (idRepasse, e2eId, idInfSegr ou txId).
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
);

create index if not exists finance_fiscal_splits_settled_at_idx
  on finance_fiscal_splits (settled_at desc nulls last);

create index if not exists finance_fiscal_splits_status_idx
  on finance_fiscal_splits (status);
