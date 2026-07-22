-- Fila de WhatsApp pós-visita (agradecimento + retorno + CTA).
create table if not exists whatsapp_aftercare_messages (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references contacts(id) on delete cascade,
  client_service_id uuid not null references client_services(id) on delete cascade,
  service_name text not null,
  cadence_days int,
  done_at timestamptz not null,
  send_after timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'skipped', 'failed')),
  skip_reason text,
  error text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists whatsapp_aftercare_dedupe_idx
  on whatsapp_aftercare_messages (client_service_id, done_at);

create index if not exists whatsapp_aftercare_due_idx
  on whatsapp_aftercare_messages (send_after)
  where status = 'pending';
