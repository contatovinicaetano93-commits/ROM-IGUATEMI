-- Visitas cliente×profissional para Relatório gerência 0011 offline.
-- O sync 0002 atual só guarda last_done_at (1 timestamp) — sem isso o 0011
-- precisava puxar a Avec ao vivo a cada request.

create table if not exists salon_client_visits (
  id uuid primary key default gen_random_uuid(),
  client_key text not null,
  visited_on date not null,
  client_name text not null,
  phone text,
  mobile text,
  email text,
  professional_names text[] not null default '{}',
  source_report text not null default '0002',
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists salon_client_visits_key_day_src_idx
  on salon_client_visits (client_key, visited_on, source_report);

create index if not exists salon_client_visits_visited_on_idx
  on salon_client_visits (visited_on);

create index if not exists salon_client_visits_pro_gin_idx
  on salon_client_visits using gin (professional_names);

-- Cobertura por trimestre (YYYY-Qn) — relatório só lê do DB se !truncated.
create table if not exists salon_visit_sync_coverage (
  period_key text primary key,
  period_start date not null,
  period_end date not null,
  pages_fetched int not null default 0,
  row_count int not null default 0,
  truncated boolean not null default true,
  synced_at timestamptz not null default now()
);
