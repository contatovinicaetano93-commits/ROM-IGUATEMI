-- P1 · KPIs de gestão (Avec 0021, 0126, 0032, 0107, 0003)
-- Uma linha por dia — JSONB para não explodir schema.

create table if not exists salon_p1_daily (
  day date primary key,
  -- [{ name, revenue, attended, ticket_avg, occupancy }]
  professionals jsonb not null default '[]',
  -- [{ name, quantity, revenue }]
  services jsonb not null default '[]',
  -- [{ channel, clients }]
  acquisition jsonb not null default '[]',
  -- clientes sem retorno há X dias (0107)
  reactivation_count int not null default 0,
  updated_at timestamptz not null default now()
);

create index if not exists salon_p1_daily_updated_idx on salon_p1_daily (updated_at desc);
