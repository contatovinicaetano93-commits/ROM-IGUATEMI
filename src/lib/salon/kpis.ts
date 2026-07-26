import { getSql } from '@/lib/db'
import { contactKpiWindow } from '@/lib/salon/contact-kpi-chart'

export interface ContactKpis {
  /** Entrada real no funil (exclui dump Avec `importado`). */
  byDay: { day: string; channel: string; contacts_count: number }[]
  byStatus: { status: string; contacts_count: number }[]
  conversion: {
    /** Convertidos ÷ funil ativo (sem importado). */
    conversion_rate: number
    /** Base completa (inclui importado). */
    total_contacts: number
    /** Só status ≠ importado. */
    funnel_contacts: number
    /** Dump 0004 / base Avec. */
    imported_contacts: number
  } | null
  window: { from: string; to: string; days: number }
}

export { contactKpiWindow }

export async function fetchContactKpis(dayLimit = 30): Promise<ContactKpis> {
  const sql = getSql()
  const window = contactKpiWindow(dayLimit)

  // byDay = entrada real no funil (exclui dump Avec 0004 / status importado).
  // byStatus = inventário completo da base (transparência).
  // conversion_rate = convertidos ÷ funil ativo (sem importado).
  const [byDay, byStatus, conversionRows] = await Promise.all([
    sql`
      select
        (timezone('America/Sao_Paulo', coalesce(first_contact_at, created_at)))::date::text as day,
        channel,
        count(*)::int as contacts_count
      from contacts
      where anonymized_at is null
        and status <> 'importado'
        and coalesce(source, '') not like 'avec_sync_clients%'
        and coalesce(source, '') not like 'avec_backfill%'
        and coalesce(source, '') not like 'avec_lake%'
        and (timezone('America/Sao_Paulo', coalesce(first_contact_at, created_at)))::date
          >= ${window.from}::date
        and (timezone('America/Sao_Paulo', coalesce(first_contact_at, created_at)))::date
          <= ${window.to}::date
      group by 1, 2
      order by 1 asc, 2 asc
    `,
    sql`
      select status, count(*)::int as contacts_count
      from contacts
      where anonymized_at is null
      group by 1
      order by 2 desc
    `,
    sql`
      select
        coalesce(
          count(*) filter (where status = 'convertido')::float
            / nullif(count(*) filter (where status <> 'importado'), 0)::float,
          0
        ) as conversion_rate,
        count(*)::int as total_contacts,
        count(*) filter (where status <> 'importado')::int as funnel_contacts,
        count(*) filter (where status = 'importado')::int as imported_contacts
      from contacts
      where anonymized_at is null
      limit 1
    ` as unknown as Promise<NonNullable<ContactKpis['conversion']>[]>,
  ])

  return {
    byDay: byDay as ContactKpis['byDay'],
    byStatus: byStatus as ContactKpis['byStatus'],
    conversion: conversionRows[0]
      ? {
          conversion_rate: Number(conversionRows[0].conversion_rate) || 0,
          total_contacts: Number(conversionRows[0].total_contacts) || 0,
          funnel_contacts: Number(conversionRows[0].funnel_contacts) || 0,
          imported_contacts: Number(conversionRows[0].imported_contacts) || 0,
        }
      : null,
    window,
  }
}
