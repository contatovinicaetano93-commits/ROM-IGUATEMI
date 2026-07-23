-- Fechamento mensal ROM — soma de salon_daily_metrics (+ snapshot ops).
-- Fonte oficial de overview / export do mês (não Avec live).
create table if not exists salon_month_metrics (
  month text primary key,
  from_day date not null,
  to_day date not null,
  days_expected int not null default 0,
  days_present int not null default 0,
  days_missing text[] not null default '{}',
  status text not null default 'incomplete'
    check (status in ('complete', 'in_progress', 'incomplete')),
  revenue numeric(14, 2) not null default 0,
  attended int not null default 0,
  cancelled int not null default 0,
  no_shows int not null default 0,
  appointments int not null default 0,
  new_clients int not null default 0,
  returning_clients int not null default 0,
  ticket_avg numeric(12, 2),
  expenses numeric(14, 2) not null default 0,
  cmv numeric(14, 2) not null default 0,
  cash_flow numeric(14, 2) not null default 0,
  payload jsonb,
  materialized_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists salon_month_metrics_updated_idx
  on salon_month_metrics (updated_at desc);
