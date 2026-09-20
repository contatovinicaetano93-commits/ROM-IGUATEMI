-- Módulos extras por colaborador (além do pacote do panel_role).
-- Idempotente. Não apaga dados. Não concede /admin, sync nem observability.

create table if not exists intranet_employee_modules (
  employee_id uuid not null references intranet_employees (id) on delete cascade,
  module_key text not null check (module_key in (
    'pipeline',
    'contatos',
    'financeiro',
    'estoque',
    'relatorios',
    'dashboard'
  )),
  primary key (employee_id, module_key)
);
