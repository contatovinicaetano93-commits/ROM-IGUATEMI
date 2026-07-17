import { readFileSync } from 'fs'
import { join } from 'path'

/** Remove comentários de linha SQL e parte o arquivo em statements. */
export function splitSqlStatements(sql: string): string[] {
  const withoutLineComments = sql
    .split('\n')
    .map((line) => {
      const trimmed = line.trim()
      if (trimmed.startsWith('--')) return ''
      const commentIdx = line.indexOf('--')
      if (commentIdx === -1) return line
      // Mantém `--` dentro de strings simples (casos raros nos nossos deltas).
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

export function readDbSqlFile(fileName: string, cwd = process.cwd()): string {
  const path = join(cwd, 'db', fileName)
  return readFileSync(path, 'utf8')
}
