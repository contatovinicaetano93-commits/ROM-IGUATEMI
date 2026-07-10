-- ROM · Onboarding & KPIs de contato
-- Rodar no banco Neon (Postgres) dedicado ao ROM.

create extension if not exists "pgcrypto";

-- Cada cliente/lead que entrou em contato, por qualquer canal.
create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  name text,
  phone text,
  email text,
  channel text not null check (channel in ('whatsapp', 'telegram', 'avec', 'instagram', 'manual')),
  source text not null default 'manual',
  status text not null default 'novo' check (status in ('novo', 'em_atendimento', 'agendado', 'convertido', 'perdido')),
  avec_client_id text,
  notes text,
  preferred_manicurist text,
  preferred_hairstylist text,
  first_contact_at timestamptz not null default now(),
  last_contact_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists contacts_channel_idx on contacts (channel);
create index if not exists contacts_status_idx on contacts (status);
create index if not exists contacts_created_at_idx on contacts (created_at desc);
create unique index if not exists contacts_phone_idx on contacts (phone) where phone is not null;

-- Log granular de cada evento (mensagem recebida/enviada, webhook do Avec, etc).
-- Existe pra tornar o sistema resiliente: nada some, tudo fica rastreável e reprocessável.
create table if not exists contact_events (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references contacts (id) on delete cascade,
  channel text not null check (channel in ('whatsapp', 'telegram', 'avec', 'instagram', 'manual')),
  direction text not null check (direction in ('in', 'out')),
  handled_by text not null default 'ai' check (handled_by in ('ai', 'human', 'system')),
  payload jsonb not null default '{}',
  error text,
  created_at timestamptz not null default now()
);

create index if not exists contact_events_contact_idx on contact_events (contact_id);
create index if not exists contact_events_created_at_idx on contact_events (created_at desc);
create index if not exists contact_events_error_idx on contact_events (created_at desc) where error is not null;

-- Serviços/recorrências de cada cliente — base do cross-sell e up-sell guiados.
-- cadence_days = intervalo esperado; last_done_at = última vez realizado.
-- O próximo vencimento é calculado em runtime (lib/recommendations.ts).
create table if not exists client_services (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references contacts (id) on delete cascade,
  name text not null,
  category text not null default 'outro' check (category in ('corte', 'tratamento', 'coloracao', 'bem_estar', 'produto', 'outro')),
  cadence_days int,
  last_done_at timestamptz,
  scheduled_at timestamptz,
  product text,
  notes text,
  professional_name text,
  last_price numeric(12, 2),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists client_services_contact_idx on client_services (contact_id);
create index if not exists client_services_active_idx on client_services (active) where active = true;
create index if not exists client_services_scheduled_idx on client_services (scheduled_at) where scheduled_at is not null;
create index if not exists client_services_last_done_idx
  on client_services (contact_id, last_done_at desc nulls last)
  where active = true and last_done_at is not null;

create unique index if not exists contacts_avec_client_id_idx on contacts (avec_client_id) where avec_client_id is not null;

-- Log de sincronizações com a API de Relatórios Avec.
create table if not exists avec_sync_runs (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  status text not null check (status in ('ok', 'error', 'partial')),
  stats jsonb not null default '{}',
  error text,
  created_at timestamptz not null default now()
);

create index if not exists avec_sync_runs_created_idx on avec_sync_runs (created_at desc);

-- KPIs agregados por dia e canal — o painel administrativo lê daqui.
-- count(*) é bigint; o cast ::int garante que o driver retorne número (não string).
create or replace view v_kpi_daily as
select
  date_trunc('day', created_at) as day,
  channel,
  count(*)::int as contacts_count
from contacts
group by 1, 2
order by 1 desc;

create or replace view v_kpi_status as
select
  status,
  count(*)::int as contacts_count
from contacts
group by 1;

create or replace view v_kpi_conversion as
select
  coalesce(
    count(*) filter (where status = 'convertido')::float
      / nullif(count(*), 0)::float,
    0
  ) as conversion_rate,
  count(*)::int as total_contacts
from contacts;

-- Snapshots imutáveis dos relatórios Avec — reprocessável e resiliente.
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

-- KPIs operacionais do salão (faturamento, comparecimento, no-show).
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

-- Cache de briefing por contato — evita regenerar IA a cada abertura.
create table if not exists contact_brief_cache (
  contact_id uuid primary key references contacts (id) on delete cascade,
  brief text not null,
  source text not null check (source in ('ai', 'rules')),
  context_hash text not null,
  created_at timestamptz not null default now()
);
