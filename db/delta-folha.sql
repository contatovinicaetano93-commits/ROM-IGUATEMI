-- Folha PJ: períodos quinzenais + documentos fiscais (DARF/DAS) para overrides.
-- KPI/valores ausentes ficam NULL (sem DEFAULT 0).

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
);

create index if not exists folha_periods_year_month_idx
  on folha_periods (year_month, half);

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
);

create index if not exists folha_tax_documents_period_idx
  on folha_tax_documents (period_id);
