import { getSql } from '@/lib/db'
import { DUE_SOON_DAYS } from '@/lib/salon/constants'

/**
 * Contatos novos do dia (Hoje KPI) — paridade com filtro Contatos Novos
 * (`countNewContactsNotInAvec`), mas fixo na janela de 1 dia (não herda 30d).
 * Inclui a mesma exclusão de quem já conta em Vencendo/Atrasados.
 */
export async function countNovosHoje(day: string): Promise<number> {
  const sql = getSql()
  const rows = (await sql`
    select count(*)::int as n
    from contacts
    where anonymized_at is null
      and channel = 'avec'
      and avec_client_id is null
      and status = 'novo'
      and coalesce(source, '') not like 'avec_sync_clients%'
      and coalesce(source, '') not like 'avec_backfill%'
      and coalesce(source, '') not like 'avec_lake%'
      and coalesce(source, '') not like 'avec_last_done%'
      and coalesce(source, '') not like 'avec_sync_returning%'
      and created_at >= (${day}::date::timestamp at time zone 'America/Sao_Paulo')
      and created_at < ((${day}::date + 1)::timestamp at time zone 'America/Sao_Paulo')
      and not exists (
        select 1
        from client_services cs
        where cs.contact_id = contacts.id
          and cs.active = true
          and cs.last_done_at is not null
          and cs.cadence_days is not null
          and cs.last_done_at + (cs.cadence_days * interval '1 day')
            <= now() + (${DUE_SOON_DAYS} * interval '1 day')
      )
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
      and coalesce(source, '') not like 'avec_last_done%'
      and coalesce(source, '') not like 'avec_sync_returning%'
      and created_at >= (${day}::date::timestamp at time zone 'America/Sao_Paulo')
      and created_at < ((${day}::date + 1)::timestamp at time zone 'America/Sao_Paulo')
  `) as { n: number }[]
  return Number(rows[0]?.n ?? 0) || 0
}
