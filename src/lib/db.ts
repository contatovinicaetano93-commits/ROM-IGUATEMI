import postgres, { type Sql as PostgresSql } from 'postgres'

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('dns').setDefaultResultOrder('ipv4first')
} catch {
  // older Node / non-Node
}

/**
 * Tagged-template client (compatível com o uso anterior do neon HTTP).
 * Neon HTTP não funciona em *.supabase.com — use postgres.js + pooler.
 *
 * Preferir Transaction Pooler (6543) na Vercel:
 * postgresql://postgres.<ref>:<senha>@aws-0-<region>.pooler.supabase.com:6543/postgres
 * (senha URL-encoded: @ → %40)
 */
export type Sql = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (strings: TemplateStringsArray, ...values: any[]): Promise<any[]>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  begin: <T>(fn: (sql: Sql) => Promise<T>) => Promise<T>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  unsafe: (query: string, params?: any[]) => Promise<any[]>
}

let cached: PostgresSql | null = null
let cachedUrl: string | null = null

function wrap(sql: PostgresSql): Sql {
  const tagged = ((strings: TemplateStringsArray, ...values: unknown[]) =>
    sql(strings, ...(values as never[]))) as unknown as Sql

  tagged.begin = <T>(fn: (tx: Sql) => Promise<T>) =>
    sql.begin(async (tx) => fn(wrap(tx as unknown as PostgresSql))) as Promise<T>

  tagged.unsafe = async (query: string, params: unknown[] = []) =>
    sql.unsafe(query, params as never[]) as unknown as unknown[]

  return tagged
}

export function getSql(): Sql {
  const url = process.env.DATABASE_URL?.trim()
  if (!url) throw new Error('DATABASE_URL não configurada')

  if (!cached || cachedUrl !== url) {
    cached?.end({ timeout: 1 }).catch(() => {})
    cached = postgres(url, {
      ssl: 'require',
      max: 1,
      prepare: false,
      idle_timeout: 20,
      max_lifetime: 60 * 5,
      connect_timeout: 15,
    })
    cachedUrl = url
  }
  return wrap(cached)
}
