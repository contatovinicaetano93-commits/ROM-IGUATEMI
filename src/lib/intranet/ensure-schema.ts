import 'server-only'

import { getIntranetSql, peekResolvedIntranetDatabaseUrl } from '@/lib/db'

/**
 * Schema da intranet (colaboradores) pode viver em INTRANET_DATABASE_URL
 * enquanto as migrations admin rodam no DATABASE_URL do salão.
 * Garante colunas críticas sem depender do runner único.
 */
let proLinkOnce: Promise<void> | null = null

export async function ensureIntranetProLinkColumn(): Promise<void> {
  if (!peekResolvedIntranetDatabaseUrl()) return
  if (!proLinkOnce) {
    proLinkOnce = (async () => {
      const sql = getIntranetSql()
      await sql.unsafe(`
        alter table intranet_employees
          add column if not exists professional_name text
      `)
    })().catch((err) => {
      proLinkOnce = null
      throw err
    })
  }
  await proLinkOnce
}
