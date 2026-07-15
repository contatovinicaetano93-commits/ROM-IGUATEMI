-- Tempo Médio de atendimento (Sprint 1) — soma/contagem em minutos por dia.
-- Guardamos soma + contagem (não a média pronta) pra period comparison (mês/trimestre)
-- poder agregar por soma/contagem em vez de fazer média de médias.
alter table salon_daily_metrics
  add column if not exists service_duration_sum_minutes numeric(12, 2) not null default 0;

alter table salon_daily_metrics
  add column if not exists service_duration_count int not null default 0;
