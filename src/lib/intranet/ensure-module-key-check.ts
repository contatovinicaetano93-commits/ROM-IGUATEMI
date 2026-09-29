import 'server-only'

import { GRANTABLE_MODULES } from '@/lib/intranet/modules'

type SqlExec = {
  query?: (query: string, params?: unknown[]) => Promise<unknown>
  unsafe?: (query: string, params?: unknown[]) => Promise<unknown>
}

/** Keys permitidos no CHECK — espelha GRANTABLE_MODULES. */
export function grantableModuleKeyCheckSql(): string {
  const keys = GRANTABLE_MODULES.map((m) => `'${m.key}'`).join(',\n    ')
  return `check (module_key in (
    ${keys}
  ))`
}

async function run(sql: SqlExec, statement: string): Promise<void> {
  if (typeof sql.query === 'function') {
    await sql.query(statement)
    return
  }
  if (typeof sql.unsafe === 'function') {
    await sql.unsafe(statement)
    return
  }
  throw new Error('Cliente SQL sem query/unsafe')
}

/**
 * Garante que o CHECK de intranet_employee_modules aceita todos os módulos
 * grantable (incl. ativacoes). Idempotente. Não depende de schemaOnce/arquivo.
 */
export async function ensureGrantableModuleKeyCheck(sql: SqlExec): Promise<void> {
  await run(
    sql,
    'alter table intranet_employee_modules drop constraint if exists intranet_employee_modules_module_key_check',
  )
  await run(
    sql,
    `alter table intranet_employee_modules add constraint intranet_employee_modules_module_key_check ${grantableModuleKeyCheckSql()}`,
  )
}
