#!/usr/bin/env node
/**
 * Aplica db/migrations.json no Postgres (DATABASE_URL).
 * Uso:
 *   DATABASE_URL=... ROM_PANEL=brasil npm run db:migrate
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
  const statements = []
  let current = ''
  let i = 0
  let inSingle = false
  let dollarTag = null

  const startsDollarTag = (from) => {
    if (sql[from] !== '$') return null
    let j = from + 1
    while (j < sql.length && /[A-Za-z0-9_]/.test(sql[j])) j += 1
    if (j < sql.length && sql[j] === '$') return sql.slice(from, j + 1)
    return null
  }

  while (i < sql.length) {
    const ch = sql[i]

    if (dollarTag) {
      if (sql.startsWith(dollarTag, i)) {
        current += dollarTag
        i += dollarTag.length
        dollarTag = null
        continue
      }
      current += ch
      i += 1
      continue
    }

    if (inSingle) {
      current += ch
      if (ch === "'" && sql[i + 1] === "'") {
        current += "'"
        i += 2
        continue
      }
      if (ch === "'") inSingle = false
      i += 1
      continue
    }

    if (ch === '-' && sql[i + 1] === '-') {
      i += 2
      while (i < sql.length && sql[i] !== '\n') i += 1
      continue
    }

    const tag = startsDollarTag(i)
    if (tag) {
      dollarTag = tag
      current += tag
      i += tag.length
      continue
    }

    if (ch === "'") {
      inSingle = true
      current += ch
      i += 1
      continue
    }

    if (ch === ';') {
      const trimmed = current.trim()
      if (trimmed.length > 0) statements.push(trimmed)
      current = ''
      i += 1
      continue
    }

    current += ch
    i += 1
  }

  const tail = current.trim()
  if (tail.length > 0) statements.push(tail)
  return statements
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
