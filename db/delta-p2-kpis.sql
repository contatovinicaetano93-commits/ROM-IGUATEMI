-- P2 · KPIs comerciais / qualidade (Avec 0056, 0061, 0104, 0081, 0001)
-- Uma linha por dia — JSONB para não explodir schema.

create table if not exists salon_p2_daily (
  day date primary key,
  -- [{ channel, count }] — agendamentos por canal (0056)
  booking_channels jsonb not null default '[]',
  -- [{ name, quantity, revenue }] — pacotes (0061)
  packages jsonb not null default '[]',
  packages_sold int not null default 0,
  -- avaliações (0104)
  ratings_avg numeric(4,2) not null default 0,
  ratings_count int not null default 0,
  -- [{ method, amount, share }] — formas de pagamento (0081)
  payment_mix jsonb not null default '[]',
  -- aniversariantes do período (0001)
  birthday_count int not null default 0,
  updated_at timestamptz not null default now()
);

create index if not exists salon_p2_daily_updated_idx on salon_p2_daily (updated_at desc);
