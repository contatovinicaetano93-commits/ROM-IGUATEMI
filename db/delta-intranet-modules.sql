-- Módulos extras por colaborador (além do pacote do panel_role).
-- Idempotente. Não apaga dados. Não concede /admin, sync nem observability.

create table if not exists intranet_employee_modules (
  employee_id uuid not null references intranet_employees (id) on delete cascade,
  module_key text not null,
  primary key (employee_id, module_key)
);

-- Amplia / recria o check (CREATE IF NOT EXISTS não atualiza constraint antiga).
-- Espelha GRANTABLE_MODULES (ativacoes, folha, checks_diario, …).
-- CHECK estreito (sem checks_diario/folha) quebrava ensureIntranetSchema no
-- Neon quando já havia linhas desses módulos — e bloqueava qualquer cadastro.
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
    'checks_diario'
  ));
