-- Paridade com o ROM Brasil (Sprint 1 TM, Sprint 4 Financeiro, LGPD, bot Telegram funcionários).

-- Sprint 1 — Tempo Médio de atendimento.
alter table salon_daily_metrics add column if not exists service_duration_sum_minutes numeric(12, 2) not null default 0;
alter table salon_daily_metrics add column if not exists service_duration_count int not null default 0;

-- LGPD — anonimização de contato.
alter table contacts add column if not exists anonymized_at timestamptz;

-- Sprint 4 — Financeiro (despesas de cadastro manual).
create table if not exists finance_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists finance_categories_name_idx
  on finance_categories (lower(name)) where active = true;

create table if not exists finance_expenses (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references finance_categories (id) on delete set null,
  description text not null,
  amount numeric(12, 2) not null check (amount > 0),
  expense_date date not null,
  notes text,
  receipt_url text,
  created_by text,
  created_at timestamptz not null default now()
);

create index if not exists finance_expenses_date_idx on finance_expenses (expense_date desc);
create index if not exists finance_expenses_category_idx on finance_expenses (category_id);

insert into finance_categories (name)
select v.name from (values
  ('Folha de pagamento'),
  ('Produtos e insumos'),
  ('Aluguel'),
  ('Marketing'),
  ('Manutenção'),
  ('Utilidades (água, luz, internet)'),
  ('Impostos e taxas'),
  ('Outros')
) as v(name)
where not exists (select 1 from finance_categories fc where lower(fc.name) = lower(v.name));

-- Bot Telegram de funcionários — vínculo chat_id ↔ profissional.
create table if not exists telegram_staff_links (
  chat_id text primary key,
  professional_name text not null,
  created_at timestamptz not null default now()
);
