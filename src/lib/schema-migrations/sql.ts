import { readFileSync } from 'fs'
import { basename, join } from 'path'

/** Garante que o nome venha só de `db/<arquivo>.sql` (sem path traversal). */
export function assertSafeDbFileName(fileName: string): string {
  const base = basename(fileName)
  if (
    !base ||
    base !== fileName ||
    base.includes('..') ||
    !/^[\w.-]+\.sql$/i.test(base)
  ) {
    throw new Error(`Nome de migration SQL inválido: ${fileName}`)
  }
  return base
}

/**
 * Remove comentários de linha SQL e parte o arquivo em statements.
 * Respeita strings `'...'` e dollar-quotes `$$...$$` / `$tag$...$tag$`
 * para não cortar `;` internos (ex.: blocos DO).
 */
export function splitSqlStatements(sql: string): string[] {
  const statements: string[] = []
  let current = ''
  let i = 0
  let inSingle = false
  let dollarTag: string | null = null

  const startsDollarTag = (from: number): string | null => {
    if (sql[from] !== '$') return null
    let j = from + 1
    while (j < sql.length && /[A-Za-z0-9_]/.test(sql[j]!)) j += 1
    if (j < sql.length && sql[j] === '$') return sql.slice(from, j + 1)
    return null
  }

  while (i < sql.length) {
    const ch = sql[i]!

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

export function readDbSqlFile(fileName: string, cwd = process.cwd()): string {
  const safe = assertSafeDbFileName(fileName)
  const path = join(cwd, 'db', safe)
  return readFileSync(path, 'utf8')
}
