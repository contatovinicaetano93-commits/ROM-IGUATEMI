-- Ativações de marca no lavatório (calendário comunitário MKT + gestora + master).
-- Idempotente. Não apaga dados.

-- Amplia o check de módulos grantable (Postgres não deixa ALTER CHECK in-place).
alter table intranet_employee_modules
  drop constraint if exists intranet_employee_modules_module_key_check;

alter table intranet_employee_modules
  add constraint intranet_employee_modules_module_key_check
  check (module_key in (
    'pipeline',
    'contatos',
    'ativacoes',
    'financeiro',
    'estoque',
    'relatorios',
    'dashboard'
  ));

create table if not exists unit_brand_activations (
  id uuid primary key default gen_random_uuid(),
  day date not null,
  start_time time not null,
  brand text not null,
  condition text not null check (condition in ('comercial', 'servicos')),
  notes text,
  status text not null default 'confirmed' check (status in ('confirmed', 'cancelled')),
  created_by_employee_id uuid references intranet_employees (id) on delete set null,
  created_by_name text not null,
  created_by_role text not null,
  cancelled_by_name text,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 1 ativação confirmada por dia na unidade.
create unique index if not exists unit_brand_activations_day_confirmed_uidx
  on unit_brand_activations (day)
  where status = 'confirmed';

create index if not exists unit_brand_activations_day_idx
  on unit_brand_activations (day);

-- Backfill: gestoras de unidade (staff + visão + áreas amplas do Flow).
insert into intranet_employee_modules (employee_id, module_key)
select e.id, 'ativacoes'
from intranet_employees e
where e.panel_role = 'staff'
  and e.flow_role = 'solicitante'
  and exists (
    select 1
    from intranet_employee_modules m
    where m.employee_id = e.id
      and m.module_key = 'dashboard'
  )
  and (
    select count(distinct a.area)::int
    from intranet_employee_areas a
    where a.employee_id = e.id
  ) >= 4
on conflict do nothing;
