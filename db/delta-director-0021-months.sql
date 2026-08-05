-- Faturamento por profissional (Avec 0021) por mês calendário — Relatório gerência offline.

create table if not exists salon_director_0021_months (
  month text primary key,
  professionals jsonb not null default '[]'::jsonb,
  row_count int not null default 0,
  truncated boolean not null default true,
  source_report text not null default '0021',
  synced_at timestamptz not null default now()
);

create index if not exists salon_director_0021_months_synced_at_idx
  on salon_director_0021_months (synced_at desc);
