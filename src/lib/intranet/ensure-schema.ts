import 'server-only'

import { getIntranetSql, peekResolvedIntranetDatabaseUrl } from '@/lib/db'
import { readDbSqlFile, splitSqlStatements } from '@/lib/schema-migrations/sql'

/**
 * Schema da intranet pode viver em INTRANET_DATABASE_URL enquanto as
 * migrations admin rodam no DATABASE_URL do salão. Aplica deltas intranet
 * idempotentes no banco certo.
 */
const INTRANET_SQL_FILES = [
  'delta-intranet.sql',
  'delta-intranet-modules.sql',
  'delta-intranet-pro-link.sql',
  'delta-intranet-policy.sql',
] as const

let schemaOnce: Promise<void> | null = null

type SqlExec = {
  query?: (query: string, params?: unknown[]) => Promise<unknown>
  unsafe?: (query: string, params?: unknown[]) => Promise<unknown>
}

async function runStatement(sql: SqlExec, statement: string): Promise<void> {
  if (typeof sql.query === 'function') {
    await sql.query(statement)
    return
  }
  if (typeof sql.unsafe === 'function') {
    await sql.unsafe(statement)
    return
  }
  throw new Error('Cliente SQL da intranet sem query/unsafe')
}

export async function ensureIntranetSchema(): Promise<{ files: string[] }> {
  if (!peekResolvedIntranetDatabaseUrl()) return { files: [] }
  if (!schemaOnce) {
    schemaOnce = (async () => {
      const sql = getIntranetSql() as SqlExec
      await runStatement(sql, 'create extension if not exists pgcrypto')
      for (const file of INTRANET_SQL_FILES) {
        const body = readDbSqlFile(file)
        for (const statement of splitSqlStatements(body)) {
          await runStatement(sql, statement)
        }
      }
    })().catch((err) => {
      schemaOnce = null
      throw err
    })
  }
  await schemaOnce
  return { files: [...INTRANET_SQL_FILES] }
}

/** @deprecated use ensureIntranetSchema */
export async function ensureIntranetProLinkColumn(): Promise<void> {
  await ensureIntranetSchema()
}
