#!/usr/bin/env node
/**
 * Aplica db/migrations.json no Neon (DATABASE_URL).
 * Uso:
 *   DATABASE_URL=... ROM_PANEL=brasil npm run db:migrate
 *   DATABASE_URL=... ROM_PANEL=iguatemi npm run db:migrate
 */
import { existsSync, readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { neon } from '@neondatabase/serverless'

const cwd = join(dirname(fileURLToPath(import.meta.url)), '..')
const panel = (process.env.ROM_PANEL || process.env.NEXT_PUBLIC_ROM_PANEL || 'brasil')
  .toLowerCase()
  .replace('iguatuemi', 'iguatemi')
const databaseUrl = process.env.DATABASE_URL

if (!databaseUrl) {
  console.error('DATABASE_URL é obrigatória')
  process.exit(1)
}

function splitSqlStatements(sql) {
  const withoutLineComments = sql
    .split('\n')
    .map((line) => {
      const trimmed = line.trim()
      if (trimmed.startsWith('--')) return ''
      const commentIdx = line.indexOf('--')
      if (commentIdx === -1) return line
      const before = line.slice(0, commentIdx)
      const singles = (before.match(/'/g) || []).length
      if (singles % 2 === 1) return line
      return before
    })
    .join('\n')

  return withoutLineComments
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

const manifest = JSON.parse(readFileSync(join(cwd, 'db', 'migrations.json'), 'utf8'))
const migrations = manifest.migrations.filter(
  (m) => m.panels.includes(panel) && existsSync(join(cwd, 'db', m.file)),
)

const sql = neon(databaseUrl)

await sql.query(`
  create table if not exists schema_migrations (
    id text primary key,
    applied_at timestamptz not null default now()
  )
`)

const appliedRows = await sql.query(`select id from schema_migrations`)
const applied = new Set((appliedRows || []).map((r) => r.id))

let appliedCount = 0
for (const migration of migrations) {
  if (applied.has(migration.id)) {
    console.log(`skip  ${migration.id}`)
    continue
  }
  const body = readFileSync(join(cwd, 'db', migration.file), 'utf8')
  const statements = splitSqlStatements(body)
  console.log(`apply ${migration.id} (${statements.length} statements)`)
  for (const statement of statements) {
    await sql.query(statement)
  }
  await sql.query(`insert into schema_migrations (id) values ($1) on conflict (id) do nothing`, [
    migration.id,
  ])
  appliedCount += 1
}

console.log(`done panel=${panel} applied=${appliedCount} registered=${migrations.length}`)
