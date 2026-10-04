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
 * grantable (incl. checks_diario). Idempotente e resiliente a corrida
 * serverless (DROP/ADD em isolates paralelos).
 */
export async function ensureGrantableModuleKeyCheck(sql: SqlExec): Promise<void> {
  const checkBody = grantableModuleKeyCheckSql()
  // Um único DO: dropa qualquer CHECK na coluna e recria com o nome canônico.
  // Evita "already exists" quando dois cold starts batem no ADD.
  await run(
    sql,
    `
DO $ensure_module_key$
BEGIN
  ALTER TABLE intranet_employee_modules
    DROP CONSTRAINT IF EXISTS intranet_employee_modules_module_key_check;
  ALTER TABLE intranet_employee_modules
    ADD CONSTRAINT intranet_employee_modules_module_key_check
    ${checkBody};
EXCEPTION
  WHEN duplicate_object THEN
    -- Outro isolate acabou de criar o mesmo CHECK — ok se as keys batem.
    NULL;
END
$ensure_module_key$;
`.trim(),
  )
}
