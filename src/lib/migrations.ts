import { getSql } from '@/lib/db'

export interface Migration {
  name: string
  up: (sql: any) => Promise<void>
  down?: (sql: any) => Promise<void>
}

export class MigrationRunner {
  static async runPending(migrations: Migration[]): Promise<void> {
    const sql = getSql()

    // Create migrations table if not exists
    try {
      await sql`
        create table if not exists _migrations (
          id serial primary key,
          name text unique not null,
          executed_at timestamp default now()
        )
      `
    } catch (e) {
      console.warn('Could not create migrations table:', e)
      return
    }

    // Get executed migrations
    let executed: { name: string }[] = []
    try {
      executed = (await sql`select name from _migrations`) as { name: string }[]
    } catch {
      executed = []
    }

    const executedNames = new Set(executed.map((m) => m.name))

    // Run pending migrations
    for (const migration of migrations) {
      if (executedNames.has(migration.name)) {
        console.log(`✓ Migration already executed: ${migration.name}`)
        continue
      }

      try {
        console.log(`Running migration: ${migration.name}`)
        await migration.up(sql)
        await sql`insert into _migrations (name) values (${migration.name})`
        console.log(`✓ Completed: ${migration.name}`)
      } catch (e) {
        console.error(`✗ Failed migration: ${migration.name}`, e)
        throw e
      }
    }
  }

  static async rollback(migration: Migration): Promise<void> {
    if (!migration.down) {
      throw new Error(`Migration ${migration.name} does not support rollback`)
    }

    const sql = getSql()
    await migration.down(sql)
    await sql`delete from _migrations where name = ${migration.name}`
    console.log(`✓ Rolled back: ${migration.name}`)
  }
}

export const coreMigrations: Migration[] = [
  {
    name: '001_create_audit_logs',
    up: async (sql) => {
      await sql`
        create table if not exists audit_logs (
          id uuid primary key,
          user text not null,
          role text not null,
          action text not null,
          resource text not null,
          changes jsonb,
          ip_address text,
          status text,
          error_message text,
          created_at timestamp default now()
        );
        create index if not exists idx_audit_logs_user on audit_logs(user);
        create index if not exists idx_audit_logs_action on audit_logs(action);
        create index if not exists idx_audit_logs_created_at on audit_logs(created_at);
      `
    },
  },
  {
    name: '002_create_alerts',
    up: async (sql) => {
      await sql`
        create table if not exists alerts (
          id uuid primary key,
          type text not null,
          severity text not null,
          title text not null,
          message text not null,
          context jsonb,
          created_at timestamp default now(),
          resolved_at timestamp
        );
        create index if not exists idx_alerts_type on alerts(type);
        create index if not exists idx_alerts_resolved_at on alerts(resolved_at);
      `
    },
  },
]
