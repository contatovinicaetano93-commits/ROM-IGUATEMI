-- KPIs diários: NULL = “ainda não sincronizado” (evita R$0/mix 0 fantasma no 1º INSERT parcial).
-- ON CONFLICT / sync continuam podendo gravar 0 real quando o relatório Avec vier zerado.

alter table salon_daily_metrics
  alter column revenue drop not null,
  alter column appointments drop not null,
  alter column attended drop not null,
  alter column no_shows drop not null,
  alter column cancelled drop not null,
  alter column new_clients drop not null,
  alter column returning_clients drop not null;
