-- KPIs mensais: NULL = mês sem dado conhecido (não inventar R$0 / 0 atendidos).
-- create table legado em 020 usava NOT NULL DEFAULT 0.

alter table salon_month_metrics
  alter column revenue drop not null,
  alter column revenue drop default,
  alter column attended drop not null,
  alter column attended drop default,
  alter column cancelled drop not null,
  alter column cancelled drop default,
  alter column no_shows drop not null,
  alter column no_shows drop default,
  alter column appointments drop not null,
  alter column appointments drop default,
  alter column new_clients drop not null,
  alter column new_clients drop default,
  alter column returning_clients drop not null,
  alter column returning_clients drop default,
  alter column expenses drop not null,
  alter column expenses drop default,
  alter column cmv drop not null,
  alter column cmv drop default,
  alter column cash_flow drop not null,
  alter column cash_flow drop default;
