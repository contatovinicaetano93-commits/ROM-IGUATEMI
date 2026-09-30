-- Id Avec do profissional (roster) para Meu faturamento / 0029.
-- Idempotente. Não apaga dados.

alter table intranet_employees
  add column if not exists avec_pro_id text;
