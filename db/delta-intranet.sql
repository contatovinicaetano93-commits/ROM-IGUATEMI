-- Intranet Rom Club: colaboradores, CMS, RomFlow da unidade.
-- Idempotente. Não apaga dados. Empresas são semeadas em runtime por painel
-- (Brasil não recebe Baru Iguatemi e vice-versa).

create table if not exists intranet_employees (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  name text not null,
  password_hash text not null,
  panel_role text not null check (panel_role in ('admin', 'staff', 'financeiro', 'estoque', 'mkt')),
  flow_role text not null check (flow_role in (
    'master',
    'admin_financeiro',
    'admin_manutencao',
    'admin_compras',
    'admin_rh',
    'solicitante'
  )),
  status text not null default 'active' check (status in ('active', 'inactive')),
  can_publish boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists intranet_employees_email_idx
  on intranet_employees (lower(email));

create table if not exists flow_companies (
  id text primary key,
  name text not null,
  legal_name text not null,
  slug text not null unique,
  initials text not null,
  color text not null,
  is_active boolean not null default true
);

create table if not exists flow_categories (
  id text primary key,
  name text not null,
  color text not null,
  is_active boolean not null default true
);

create table if not exists intranet_employee_companies (
  employee_id uuid not null references intranet_employees (id) on delete cascade,
  company_id text not null references flow_companies (id) on delete cascade,
  primary key (employee_id, company_id)
);

create table if not exists intranet_employee_areas (
  employee_id uuid not null references intranet_employees (id) on delete cascade,
  area text not null check (area in ('financeiro', 'manutencao', 'compras', 'rh')),
  primary key (employee_id, area)
);

create table if not exists flow_expenses (
  id text primary key,
  title text not null,
  description text not null default '',
  area text not null check (area in ('financeiro', 'manutencao', 'compras', 'rh')),
  expense_type text not null,
  event_project text not null default '',
  event_date text not null default '',
  amount double precision not null,
  category text not null,
  payment_method text not null,
  beneficiary_name text not null,
  beneficiary_document text not null default '',
  pix_key text not null default '',
  bank_name text not null default '',
  agency text not null default '',
  account text not null default '',
  boleto_code text not null default '',
  max_payment_date text not null,
  payment_date_justification text not null default '',
  receipt_justification text not null default '',
  receipt jsonb,
  payment_proof jsonb,
  company_id text not null references flow_companies (id),
  requester_id text not null,
  approver_id text,
  status text not null,
  scheduled_date text,
  review_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists flow_expenses_company_idx on flow_expenses (company_id);
create index if not exists flow_expenses_requester_idx on flow_expenses (requester_id);
create index if not exists flow_expenses_status_idx on flow_expenses (status);
create index if not exists flow_expenses_created_idx on flow_expenses (created_at desc);

create table if not exists intranet_posts (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('news', 'event', 'banner', 'policy')),
  title text not null,
  body text not null default '',
  excerpt text not null default '',
  image_url text,
  href text,
  location text,
  starts_at timestamptz,
  ends_at timestamptz,
  published_at timestamptz,
  author_id uuid,
  author_name text not null default '',
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists intranet_posts_kind_pub_idx
  on intranet_posts (kind, published_at desc);

create table if not exists intranet_notifications (
  id uuid primary key default gen_random_uuid(),
  audience_key text,
  title text not null,
  body text not null default '',
  href text,
  created_at timestamptz not null default now()
);

create table if not exists intranet_notification_reads (
  notification_id uuid not null references intranet_notifications (id) on delete cascade,
  reader_key text not null,
  read_at timestamptz not null default now(),
  primary key (notification_id, reader_key)
);

insert into flow_categories (id, name, color, is_active) values
  ('cat_viagem', 'Viagem', '#8C6B4A', true),
  ('cat_alim', 'Alimentação', '#C4A574', true),
  ('cat_esc', 'Escritório', '#6B5A48', true),
  ('cat_soft', 'Software', '#9A7B52', true),
  ('cat_outros', 'Outros', '#7A7268', true)
on conflict (id) do nothing;
