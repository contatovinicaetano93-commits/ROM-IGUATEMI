#!/usr/bin/env node
/**
 * Aplica db/migrations.json no Postgres (DATABASE_URL).
 * Uso:
 *   DATABASE_URL=... ROM_PANEL=iguatemi npm run db:migrate
 */
import { existsSync, readFileSync } from 'fs'
import { basename, join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { setDefaultResultOrder } from 'dns'
import postgres from 'postgres'

try {
  setDefaultResultOrder('ipv4first')
} catch {
  // ignore
}

function assertSafeDbFileName(fileName) {
  const base = basename(fileName)
  if (!base || base !== fileName || base.includes('..') || !/^[\w.-]+\.sql$/i.test(base)) {
    throw new Error(`Nome de migration SQL inválido: ${fileName}`)
  }
  return base
}

const cwd = join(dirname(fileURLToPath(import.meta.url)), '..')
const panel = (process.env.ROM_PANEL || process.env.NEXT_PUBLIC_ROM_PANEL || 'iguatemi')
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
const migrations = manifest.migrations.filter((m) => m.panels.includes(panel))
const missing = migrations
  .map((m) => assertSafeDbFileName(m.file))
  .filter((file) => !existsSync(join(cwd, 'db', file)))
if (missing.length > 0) {
  console.error(`Migrations sem arquivo em db/: ${missing.join(', ')}`)
  process.exit(1)
}

const sql = postgres(databaseUrl, {
  ssl: 'require',
  max: 1,
  prepare: false,
  connect_timeout: 30,
})

async function query(text, params = []) {
  return sql.unsafe(text, params)
}

try {
  await query(`
    create table if not exists schema_migrations (
      id text primary key,
      applied_at timestamptz not null default now()
    )
  `)

  const appliedRows = await query(`select id from schema_migrations`)
  const applied = new Set((appliedRows || []).map((r) => r.id))

  let appliedCount = 0
  for (const migration of migrations) {
    if (applied.has(migration.id)) {
      console.log(`skip  ${migration.id}`)
      continue
    }
    const file = assertSafeDbFileName(migration.file)
    const body = readFileSync(join(cwd, 'db', file), 'utf8')
    const statements = splitSqlStatements(body)
    if (statements.length === 0) {
      console.error(`Arquivo SQL vazio: ${file}`)
      process.exit(1)
    }
    console.log(`apply ${migration.id} (${statements.length} statements)`)
    for (const statement of statements) {
      await query(statement)
    }
    await query(`insert into schema_migrations (id) values ($1) on conflict (id) do nothing`, [
      migration.id,
    ])
    appliedCount += 1
  }

  console.log(`done panel=${panel} applied=${appliedCount} registered=${migrations.length}`)
} finally {
  await sql.end({ timeout: 5 })
}
