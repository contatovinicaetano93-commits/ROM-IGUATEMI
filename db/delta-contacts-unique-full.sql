-- ON CONFLICT (phone|avec_client_id) exige índice UNIQUE sem predicado WHERE.
-- Índices parciais (WHERE ... IS NOT NULL) não satisfazem a inference do Postgres.
-- NULLs continuam permitidos em múltiplas linhas (UNIQUE padrão do PG).

drop index if exists contacts_phone_idx;
create unique index if not exists contacts_phone_idx on contacts (phone);

drop index if exists contacts_avec_client_id_idx;
create unique index if not exists contacts_avec_client_id_idx on contacts (avec_client_id);
