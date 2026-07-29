import 'server-only'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import postgres, { type Sql as PostgresSql } from 'postgres'
import { DEPLOY_DATABASE_URL } from '@/lib/db-url.generated'

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('dns').setDefaultResultOrder('ipv4first')
} catch {
  // older Node / non-Node
}

/**
 * Tagged-template client (postgres.js).
 * Não use neon() HTTP — falha em *.supabase.com; use pooler Supabase.
 *
 * Preferir Transaction Pooler (6543) na Vercel:
 * postgresql://postgres.<ref>:<senha>@aws-0-<region>.pooler.supabase.com:6543/postgres
 * (senha URL-encoded: @ → %40)
 *
 * Overlay de deploy: `secrets/database-url.txt` (gitignore) tem prioridade sobre
 * DATABASE_URL — pooler Supabase; usado quando a API de env da Vercel
 * não está disponível neste agente.
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

/**
 * Session pooler (5432) no Supabase tem poucas slots (EMAXCONNSESSION / pool_size 15).
 * Em serverless (Vercel), transaction mode (6543) libera a conexão a cada query.
 */
export function toTransactionPoolerUrl(raw: string): string {
  const trimmed = raw.trim()
  try {
    const u = new URL(trimmed)
    const isSupabasePooler =
      u.hostname.includes('pooler.supabase.com') || u.hostname.includes('.pooler.supabase.')
    const port = u.port || '5432'
    if (isSupabasePooler && port === '5432') {
      u.port = '6543'
      return u.toString()
    }
  } catch {
    // URL inválida — deixa o postgres.js falhar com a string original.
  }
  return trimmed
}

export function isDbPoolExhaustedError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e)
  return /EMAXCONNSESSION|max clients reached|remaining connection slots|too many connections/i.test(
    msg,
  )
}

function wrap(sql: PostgresSql): Sql {
  const tagged = ((strings: TemplateStringsArray, ...values: unknown[]) =>
    sql(strings, ...(values as never[]))) as unknown as Sql

  tagged.begin = <T>(fn: (tx: Sql) => Promise<T>) =>
    sql.begin(async (tx) => fn(wrap(tx as unknown as PostgresSql))) as Promise<T>

  tagged.unsafe = async (query: string, params: unknown[] = []) =>
    sql.unsafe(query, params as never[]) as unknown as unknown[]

  return tagged
}

function readDeployOverlayUrl(): string | null {
  const candidates = [
    join(process.cwd(), 'secrets', 'database-url.txt'),
    join(process.cwd(), '.secrets', 'database-url.txt'),
  ]
  for (const path of candidates) {
    try {
      if (!existsSync(path)) continue
      const url = readFileSync(path, 'utf8').trim()
      if (url.startsWith('postgres')) return url
    } catch {
      // ignore
    }
  }
  return null
}

/** URL efetiva (ainda sem rewrite de porta): bake → overlay → DATABASE_URL. */
export function peekResolvedDatabaseUrl(): string | null {
  const baked = typeof DEPLOY_DATABASE_URL === 'string' ? DEPLOY_DATABASE_URL.trim() : ''
  if (baked.startsWith('postgres')) return baked
  const overlay = readDeployOverlayUrl()
  if (overlay) return overlay
  return process.env.DATABASE_URL?.trim() || null
}

/** De onde veio a URL — útil no /api/health público pra auditar deploy. */
export function peekDatabaseUrlSource(): 'baked' | 'overlay' | 'env' | 'none' {
  const baked = typeof DEPLOY_DATABASE_URL === 'string' ? DEPLOY_DATABASE_URL.trim() : ''
  if (baked.startsWith('postgres')) return 'baked'
  if (readDeployOverlayUrl()) return 'overlay'
  if (process.env.DATABASE_URL?.trim()) return 'env'
  return 'none'
}

/** Hostname sem credenciais (nunca retorna user/senha). */
export function peekDatabaseHost(): string | null {
  const url = peekResolvedDatabaseUrl()
  if (!url) return null
  try {
    return new URL(url).hostname
  } catch {
    return 'invalid_url'
  }
}

function resolveDatabaseUrl(): string {
  const url = peekResolvedDatabaseUrl()
  if (!url) throw new Error('DATABASE_URL não configurada')
  return toTransactionPoolerUrl(url)
}

export function getSql(): Sql {
  const url = resolveDatabaseUrl()

  if (!cached || cachedUrl !== url) {
    cached?.end({ timeout: 1 }).catch(() => {})
    cached = postgres(url, {
      ssl: 'require',
      // 1 conn por isolate — várias lambdas × max alto estouram session pooler.
      max: 1,
      // Transaction pooler: prepared statements quebram no modo transaction.
      prepare: false,
      idle_timeout: 5,
      max_lifetime: 60 * 2,
      connect_timeout: 10,
    })
    cachedUrl = url
  }
  return wrap(cached)
}
