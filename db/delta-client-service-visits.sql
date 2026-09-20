-- Histórico de serviços realizados por cliente (1 linha por serviço × dia SP).
-- client_services continua sendo catálogo (só last_done_at); este log é append-only
-- a partir do deploy (sem backfill). Idempotente: sync/reprocesso não duplica o dia.

create table if not exists client_service_visits (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references contacts (id) on delete cascade,
  client_service_id uuid references client_services (id) on delete set null,
  service_name text not null,
  category text,
  done_at timestamptz not null,
  done_on date not null,
  professional_name text,
  price numeric(12, 2),
  source text not null default 'manual'
    check (source in ('avec', 'manual', 'webhook', 'conversion')),
  created_at timestamptz not null default now()
);

-- Uma realização por serviço cadastrado por dia (fuso do salão).
-- NULL em client_service_id (serviço apagado) não colide entre si no Postgres.
create unique index if not exists client_service_visits_service_day_idx
  on client_service_visits (client_service_id, done_on);

create index if not exists client_service_visits_contact_done_idx
  on client_service_visits (contact_id, done_at desc, id desc);

create index if not exists client_service_visits_contact_day_idx
  on client_service_visits (contact_id, done_on desc);
