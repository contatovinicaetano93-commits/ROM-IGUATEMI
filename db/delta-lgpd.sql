-- LGPD (Sprint 3 follow-up) — anonimização de contato sob pedido ou por retenção automática.
alter table contacts add column if not exists anonymized_at timestamptz;
