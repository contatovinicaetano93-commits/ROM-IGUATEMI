-- Lock distribuído de sync (Avec / estoque) — compatível com Neon HTTP serverless.
-- Substitui advisory lock de sessão (não funciona entre requests HTTP do neon()).

create table if not exists sync_locks (
  key text primary key,
  owner text not null,
  locked_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists sync_locks_expires_at_idx on sync_locks (expires_at);
