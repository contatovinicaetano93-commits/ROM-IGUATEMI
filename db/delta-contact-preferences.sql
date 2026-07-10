-- Delta: preferência de manicure/cabeleireiro por contato.
-- Rodar no banco Neon já em produção (schema.sql já cobre instalação nova).

alter table contacts add column if not exists preferred_manicurist text;
alter table contacts add column if not exists preferred_hairstylist text;

-- Necessário para a derivação automática de preferência (lê o profissional
-- do último serviço feito/agendado que bate com a categoria unha/cabelo).
alter table client_services add column if not exists professional_name text;
alter table client_services add column if not exists last_price numeric(12, 2);

create index if not exists client_services_last_done_idx
  on client_services (contact_id, last_done_at desc nulls last)
  where active = true and last_done_at is not null;
