import { neon } from '@neondatabase/serverless'

// Cliente Neon (Postgres serverless) — uso exclusivo em route handlers (server-side).
// Acesso por SQL direto via connection string DATABASE_URL.
let cachedSql: ReturnType<typeof neon> | null = null

export function getSql() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL não configurada')

  // Connection pooling: reutiliza conexão ao invés de criar nova a cada chamada
  if (!cachedSql) {
    cachedSql = neon(url)
  }
  return cachedSql
}
