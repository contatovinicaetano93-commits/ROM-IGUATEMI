-- Checks diários: tarefas por pessoa + lançamentos com foto opcional (ao vivo).
-- Idempotente.

-- Amplia CHECK de módulos grantable (Postgres não altera CHECK in-place).
alter table intranet_employee_modules
  drop constraint if exists intranet_employee_modules_module_key_check;

alter table intranet_employee_modules
  add constraint intranet_employee_modules_module_key_check
  check (module_key in (
    'pipeline',
    'contatos',
    'ativacoes',
    'financeiro',
    'folha',
    'estoque',
    'relatorios',
    'dashboard',
    'checks_diario',
    'curriculos'
  ));

create table if not exists checks_diario_members (
  employee_id uuid primary key references intranet_employees (id) on delete cascade,
  team text not null check (team in ('ops_fin', 'gestor_unidade', 'rh')),
  is_lead boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists checks_diario_members_team_idx
  on checks_diario_members (team);

create table if not exists checks_diario_tasks (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references intranet_employees (id) on delete cascade,
  title text not null,
  description text,
  sort_order int not null default 0,
  requires_photo boolean not null default false,
  active boolean not null default true,
  created_by_employee_id uuid references intranet_employees (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists checks_diario_tasks_employee_idx
  on checks_diario_tasks (employee_id, active, sort_order);

create table if not exists checks_diario_logs (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references checks_diario_tasks (id) on delete cascade,
  employee_id uuid not null references intranet_employees (id) on delete cascade,
  day date not null,
  completed_at timestamptz not null default now(),
  note text,
  photo_url text,
  photo_captured_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists checks_diario_logs_day_idx
  on checks_diario_logs (day, employee_id);

create index if not exists checks_diario_logs_task_day_idx
  on checks_diario_logs (task_id, day);
