-- Rate limit de login distribuído (serverless) — Postgres da unidade.
-- Idempotente. Não apaga dados.

create table if not exists auth_rate_limits (
  key text primary key,
  count int not null default 0,
  window_started timestamptz not null
);

create index if not exists auth_rate_limits_window_started_idx
  on auth_rate_limits (window_started);
