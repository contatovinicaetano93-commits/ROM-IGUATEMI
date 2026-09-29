import 'server-only'

import type { Sql } from '@/lib/db'
import { GRANTABLE_MODULES } from '@/lib/intranet/modules'

/** Keys permitidos no CHECK — espelha GRANTABLE_MODULES. */
export function grantableModuleKeyCheckSql(): string {
  const keys = GRANTABLE_MODULES.map((m) => `'${m.key}'`).join(',\n    ')
  return `check (module_key in (
    ${keys}
  ))`
}

/**
 * Garante que o CHECK de intranet_employee_modules aceita todos os módulos
 * grantable (incl. ativacoes). Idempotente. Não depende de schemaOnce/arquivo.
 */
export async function ensureGrantableModuleKeyCheck(sql: Sql): Promise<void> {
  await sql.unsafe(
    'alter table intranet_employee_modules drop constraint if exists intranet_employee_modules_module_key_check',
  )
  await sql.unsafe(
    `alter table intranet_employee_modules add constraint intranet_employee_modules_module_key_check ${grantableModuleKeyCheckSql()}`,
  )
}
