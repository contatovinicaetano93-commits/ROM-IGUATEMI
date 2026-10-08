-- Currículos: anexos RH + texto/briefing pesquisável.
-- Idempotente. Não apaga dados.

create table if not exists curriculos (
  id uuid primary key default gen_random_uuid(),
  candidate_name text not null,
  email text,
  phone text,
  desired_role text,
  status text not null default 'novo'
    check (status in ('novo', 'em_analise', 'aprovado', 'arquivado')),
  file_url text not null,
  file_name text,
  file_content_type text,
  extracted_text text,
  briefing text,
  keywords text[] not null default '{}',
  notes text,
  created_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists curriculos_status_created_idx
  on curriculos (status, created_at desc);

create index if not exists curriculos_desired_role_idx
  on curriculos (desired_role);

create index if not exists curriculos_name_idx
  on curriculos (lower(candidate_name));
