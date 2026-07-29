-- Delta ROM · Jul 2026 — rodar no Postgres (Supabase) após schema.sql base
-- Tabelas: snapshots Avec, KPIs do salão, cache de briefing

create table if not exists avec_report_snapshots (
  id uuid primary key default gen_random_uuid(),
  report_id text not null,
  params jsonb not null default '{}',
  row_count int not null default 0,
  payload jsonb not null default '[]',
  sync_run_id uuid references avec_sync_runs (id) on delete set null,
  fetched_at timestamptz not null default now()
);

create index if not exists avec_report_snapshots_report_idx on avec_report_snapshots (report_id, fetched_at desc);

create table if not exists salon_daily_metrics (
  day date primary key,
  revenue numeric(12, 2) not null default 0,
  appointments int not null default 0,
  attended int not null default 0,
  no_shows int not null default 0,
  cancelled int not null default 0,
  new_clients int not null default 0,
  returning_clients int not null default 0,
  ticket_avg numeric(10, 2),
  updated_at timestamptz not null default now()
);

create table if not exists contact_brief_cache (
  contact_id uuid primary key references contacts (id) on delete cascade,
  brief text not null,
  source text not null check (source in ('ai', 'rules')),
  context_hash text not null,
  created_at timestamptz not null default now()
);
