import { getSql } from '@/lib/db'

/**
 * Contatos novos do dia (Hoje KPI) — paridade com filtro Contatos Novos em main
 * (`countNewContactsNotInAvec`), mas fixo na janela de 1 dia (não herda 30d de
 * feat/contatos-novos-data).
 */
export async function countNovosHoje(day: string): Promise<number> {
  const sql = getSql()
  const rows = (await sql`
    select count(*)::int as n
    from contacts
    where anonymized_at is null
      and channel = 'avec'
      and avec_client_id is null
      and status <> 'importado'
      and coalesce(source, '') not like 'avec_sync_clients%'
      and coalesce(source, '') not like 'avec_backfill%'
      and coalesce(source, '') not like 'avec_lake%'
      and created_at >= (${day}::date::timestamp at time zone 'America/Sao_Paulo')
      and created_at < ((${day}::date + 1)::timestamp at time zone 'America/Sao_Paulo')
  `) as { n: number }[]
  return Number(rows[0]?.n ?? 0) || 0
}

/**
 * WhatsApp novos do dia (Hoje KPI).
 * Mesmas exclusões de dump que Contatos Novos; mantém canal whatsapp + status novo.
 */
export async function countWhatsappNovosToday(day: string): Promise<number> {
  const sql = getSql()
  const rows = (await sql`
    select count(*)::int as n
    from contacts
    where anonymized_at is null
      and channel = 'whatsapp'
      and status = 'novo'
      and avec_client_id is null
      and coalesce(source, '') not like 'avec_sync_clients%'
      and coalesce(source, '') not like 'avec_backfill%'
      and coalesce(source, '') not like 'avec_lake%'
      and created_at >= (${day}::date::timestamp at time zone 'America/Sao_Paulo')
      and created_at < ((${day}::date + 1)::timestamp at time zone 'America/Sao_Paulo')
  `) as { n: number }[]
  return Number(rows[0]?.n ?? 0) || 0
}
