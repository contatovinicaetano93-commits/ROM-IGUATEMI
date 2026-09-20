-- Nome do profissional no Avec (0021) para "Meu faturamento".
-- Idempotente. Não apaga dados.

alter table intranet_employees
  add column if not exists professional_name text;
