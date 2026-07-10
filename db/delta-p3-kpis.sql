-- P3 · KPIs de retenção / curva (Avec 0007, 0088, 0017)
-- Uma linha por dia — JSONB para não explodir schema.

create table if not exists salon_p3_daily (
  day date primary key,
  -- taxa de retorno do estabelecimento (0007) — 0..1
  return_rate numeric(6,4) not null default 0,
  -- novos clientes no período (0017)
  new_clients_period int not null default 0,
  -- [{ day, revenue }] — curva diária (0088; override AVEC_REPORT_REVENUE_CURVE)
  revenue_curve jsonb not null default '[]',
  updated_at timestamptz not null default now()
);

create index if not exists salon_p3_daily_updated_idx on salon_p3_daily (updated_at desc);
