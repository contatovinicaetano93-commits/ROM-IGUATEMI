import { getSql } from '@/lib/db'
import { anonymizeContact } from '@/lib/contacts'

/** Retenção padrão: 5 anos de inatividade (referência de mercado, não parecer jurídico). */
export const DEFAULT_RETENTION_DAYS = 5 * 365

export interface PurgeResult {
  checked_cutoff: string
  purged_ids: string[]
}

/** LGPD — anonimiza contatos inativos há mais de `retentionDays`. */
export async function purgeInactiveContacts(retentionDays = DEFAULT_RETENTION_DAYS): Promise<PurgeResult> {
  const sql = getSql()
  const rows = (await sql`
    select id from contacts
    where anonymized_at is null
      and last_contact_at < now() - make_interval(days => ${retentionDays})
  `) as { id: string }[]

  const purged_ids: string[] = []
  for (const row of rows) {
    const result = await anonymizeContact(row.id)
    if (result) purged_ids.push(row.id)
  }

  return {
    checked_cutoff: new Date(Date.now() - retentionDays * 86400000).toISOString(),
    purged_ids,
  }
}
