-- Financeiro MVP (Sprint 4) — despesas de cadastro manual, sem integração externa.
-- Receita continua vindo de salon_daily_metrics (já alimentado pela Avec).
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
