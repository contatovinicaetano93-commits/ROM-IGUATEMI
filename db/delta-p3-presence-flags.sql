-- P3: flags de presença — 0 legado sem sync não é 0% / 0 novos.
-- Idempotente: ADD IF NOT EXISTS; backfill só marca valores > 0.
-- Não apaga linhas. Rodar duas vezes é no-op após schema_migrations.
-- Branch errada: só adiciona colunas booleanas; código antigo ignora.

alter table salon_p3_daily
  add column if not exists has_return_rate boolean not null default false;

alter table salon_p3_daily
  add column if not exists has_new_clients boolean not null default false;

alter table salon_p3_daily alter column return_rate drop not null;
alter table salon_p3_daily alter column return_rate drop default;
alter table salon_p3_daily alter column new_clients_period drop not null;
alter table salon_p3_daily alter column new_clients_period drop default;

update salon_p3_daily
set has_return_rate = true
where return_rate is not null and return_rate > 0;

update salon_p3_daily
set has_new_clients = true
where new_clients_period is not null and new_clients_period > 0;
