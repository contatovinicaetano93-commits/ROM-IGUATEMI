import { randomUUID } from 'crypto'
import { neon } from '@neondatabase/serverless'
import { getRomPanelId, type RomPanelId } from '@/lib/brand'
import { getSql } from '@/lib/db'
import { isSyncLockBusyError, withSyncLock } from '@/lib/sync-lock'
import { listMigrationsForPanel, type SchemaMigrationDef } from '@/lib/schema-migrations/registry'
import { readDbSqlFile, splitSqlStatements } from '@/lib/schema-migrations/sql'

export interface MigrationResult {
  id: string
  status: 'applied' | 'skipped' | 'failed'
  statements?: number
  error?: string
}

export interface MigrationRunSummary {
  panel: RomPanelId
  applied: string[]
  skipped: string[]
  failed: MigrationResult | null
  results: MigrationResult[]
  lockBusy?: boolean
}

type SqlQueryFn = {
  query: (query: string, params?: unknown[]) => Promise<unknown>
}

function getQuerySql(databaseUrl?: string): SqlQueryFn {
  const url = databaseUrl ?? process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL não configurada')
  return neon(url) as unknown as SqlQueryFn
}

async function ensureSchemaMigrationsTable(sql: SqlQueryFn): Promise<void> {
  await sql.query(`
    create table if not exists schema_migrations (
      id text primary key,
      applied_at timestamptz not null default now()
    )
  `)
}

async function listAppliedIds(sql: SqlQueryFn): Promise<Set<string>> {
  const rows = (await sql.query(`select id from schema_migrations`)) as { id: string }[]
  return new Set((rows ?? []).map((r) => r.id))
}

async function executeSqlFile(sql: SqlQueryFn, fileName: string, cwd?: string): Promise<number> {
  const body = readDbSqlFile(fileName, cwd)
  const statements = splitSqlStatements(body)
  if (statements.length === 0) {
    throw new Error(`Arquivo SQL vazio ou só comentários: ${fileName}`)
  }
  for (const statement of statements) {
    await sql.query(statement)
  }
  return statements.length
}

async function runPendingUnlocked(
  panel: RomPanelId,
  opts?: { databaseUrl?: string; cwd?: string },
): Promise<MigrationRunSummary> {
  const sql = getQuerySql(opts?.databaseUrl)
  const cwd = opts?.cwd ?? process.cwd()
  await ensureSchemaMigrationsTable(sql)

  const appliedIds = await listAppliedIds(sql)
  const pending = listMigrationsForPanel(panel, cwd)
  const results: MigrationResult[] = []
  const applied: string[] = []
  const skipped: string[] = []

  for (const migration of pending) {
    if (appliedIds.has(migration.id)) {
      skipped.push(migration.id)
      results.push({ id: migration.id, status: 'skipped' })
      continue
    }

    try {
      const statements = await executeSqlFile(sql, migration.file, cwd)
      await sql.query(`insert into schema_migrations (id) values ($1) on conflict (id) do nothing`, [
        migration.id,
      ])
      applied.push(migration.id)
      results.push({ id: migration.id, status: 'applied', statements })
      console.log(`[migrations] applied ${migration.id} (${statements} statements)`)
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e)
      console.error(`[migrations] failed ${migration.id}:`, error)
      const failed: MigrationResult = { id: migration.id, status: 'failed', error }
      results.push(failed)
      return { panel, applied, skipped, failed, results }
    }
  }

  return { panel, applied, skipped, failed: null, results }
}

/**
 * Aplica migrations pendentes de `db/migrations.json` + arquivos SQL.
 * Usa lock distribuído para evitar corrida entre instâncias.
 */
export async function runPendingMigrations(opts?: {
  panel?: RomPanelId
  databaseUrl?: string
  cwd?: string
  useLock?: boolean
}): Promise<MigrationRunSummary> {
  const panel = opts?.panel ?? getRomPanelId()
  const useLock = opts?.useLock !== false

  const run = () => runPendingUnlocked(panel, opts)

  if (!useLock) return run()

  try {
    return await withSyncLock('schema_migrate', run, {
      ttlMs: 10 * 60 * 1000,
      owner: `migrate-${panel}-${randomUUID().slice(0, 8)}`,
    })
  } catch (e) {
    if (isSyncLockBusyError(e)) {
      return {
        panel,
        applied: [],
        skipped: [],
        failed: {
          id: 'schema_migrate_lock',
          status: 'failed',
          error: e.message,
        },
        results: [],
        lockBusy: true,
      }
    }
    throw e
  }
}

export async function getMigrationStatus(opts?: {
  panel?: RomPanelId
  cwd?: string
}): Promise<{
  panel: RomPanelId
  applied: string[]
  pending: SchemaMigrationDef[]
  registered: SchemaMigrationDef[]
}> {
  const panel = opts?.panel ?? getRomPanelId()
  const cwd = opts?.cwd ?? process.cwd()
  const registered = listMigrationsForPanel(panel, cwd)
  const sql = getSql()

  try {
    await sql`
      create table if not exists schema_migrations (
        id text primary key,
        applied_at timestamptz not null default now()
      )
    `
    const rows = (await sql`select id from schema_migrations order by id`) as { id: string }[]
    const appliedSet = new Set(rows.map((r) => r.id))
    return {
      panel,
      applied: registered.filter((m) => appliedSet.has(m.id)).map((m) => m.id),
      pending: registered.filter((m) => !appliedSet.has(m.id)),
      registered,
    }
  } catch {
    return {
      panel,
      applied: [],
      pending: registered,
      registered,
    }
  }
}

/** @deprecated Use runPendingMigrations — mantido só por compatibilidade de imports. */
export interface Migration {
  name: string
  up: (sql: ReturnType<typeof getSql>) => Promise<void>
  down?: (sql: ReturnType<typeof getSql>) => Promise<void>
}

/** @deprecated */
export class MigrationRunner {
  static async runPending(migrations: Migration[]): Promise<void> {
    void migrations
    await runPendingMigrations()
  }
}

/** @deprecated stubs — schema real está em db/delta-audit-alerts.sql */
export const coreMigrations: Migration[] = []
