-- Sala de reunião: reservas por unidade (Neon local).
-- Idempotente. Não apaga dados.

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
    'curriculos',
    'sala_reuniao'
  ));

create table if not exists meeting_room_reservations (
  id uuid primary key default gen_random_uuid(),
  room_key text not null default 'sala_reuniao',
  day date not null,
  start_time time not null,
  end_time time not null,
  title text,
  status text not null default 'confirmed' check (status in ('confirmed', 'cancelled')),
  created_by_employee_id uuid,
  created_by_name text not null,
  created_by_role text not null,
  cancelled_by_name text,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_time > start_time)
);

create index if not exists meeting_room_reservations_day_status_idx
  on meeting_room_reservations (day, status);

create index if not exists meeting_room_reservations_day_room_idx
  on meeting_room_reservations (room_key, day, status);
