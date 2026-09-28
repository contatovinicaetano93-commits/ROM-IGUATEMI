-- Ativações v2: horário de término + várias confirmadas no mesmo dia.
-- Idempotente. Não apaga dados.

alter table unit_brand_activations
  add column if not exists end_time time;

-- Backfill: se faltava término, usa início (reserva pontual) — UI passa a exigir fim.
update unit_brand_activations
set end_time = start_time
where end_time is null;

alter table unit_brand_activations
  alter column end_time set not null;

-- Remove exclusividade de 1 confirmada por dia (agora várias no mesmo dia).
drop index if exists unit_brand_activations_day_confirmed_uidx;

create index if not exists unit_brand_activations_day_status_idx
  on unit_brand_activations (day, status);
