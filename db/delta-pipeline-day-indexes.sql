-- Índices sargáveis para Pipeline do dia (range em timestamptz).
-- O índice legado (contact_id, last_done_at) não cobre filtro só por last_done_at / scheduled_at.
-- Idempotente.

create index if not exists client_services_last_done_at_range_idx
  on client_services (last_done_at)
  where active = true and last_done_at is not null;

create index if not exists client_services_scheduled_at_range_idx
  on client_services (scheduled_at)
  where active = true and scheduled_at is not null;
