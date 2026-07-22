import { getSql } from '@/lib/db'
import { logEvent } from '@/lib/contacts'
import { getWhatsAppAdapter } from '@/lib/whatsapp/adapter'
import { buildAftercareWhatsAppMessage } from '@/lib/whatsapp/aftercare-message'
import type { ClientService } from '@/lib/services'

const AFTERCARE_DELAY_HOURS = 2

export async function ensureAftercareTable() {
  const sql = getSql()
  await sql`
    create table if not exists whatsapp_aftercare_messages (
      id uuid primary key default gen_random_uuid(),
      contact_id uuid not null references contacts(id) on delete cascade,
      client_service_id uuid not null references client_services(id) on delete cascade,
      service_name text not null,
      cadence_days int,
      done_at timestamptz not null,
      send_after timestamptz not null,
      status text not null default 'pending'
        check (status in ('pending', 'sent', 'skipped', 'failed')),
      skip_reason text,
      error text,
      sent_at timestamptz,
      created_at timestamptz not null default now()
    )
  `
  await sql`
    create unique index if not exists whatsapp_aftercare_dedupe_idx
      on whatsapp_aftercare_messages (client_service_id, done_at)
  `
  await sql`
    create index if not exists whatsapp_aftercare_due_idx
      on whatsapp_aftercare_messages (send_after)
      where status = 'pending'
  `
}

/** Enfileira WhatsApp pós-visita (2h). Idempotente por (serviço, done_at). */
export async function enqueueAftercare(service: ClientService): Promise<void> {
  if (!service.contact_id || !service.last_done_at) return
  await ensureAftercareTable()
  const sql = getSql()
  const doneAt = service.last_done_at
  const sendAfter = new Date(new Date(doneAt).getTime() + AFTERCARE_DELAY_HOURS * 60 * 60 * 1000).toISOString()

  await sql`
    insert into whatsapp_aftercare_messages (
      contact_id, client_service_id, service_name, cadence_days, done_at, send_after, status
    )
    values (
      ${service.contact_id},
      ${service.id},
      ${service.name},
      ${service.cadence_days},
      ${doneAt}::timestamptz,
      ${sendAfter}::timestamptz,
      'pending'
    )
    on conflict (client_service_id, done_at) do nothing
  `
}

type DueRow = {
  id: string
  contact_id: string
  client_service_id: string
  service_name: string
  cadence_days: number | null
  contact_name: string | null
  phone: string | null
  anonymized_at: string | null
}

export async function processDueAftercare(limit = 40): Promise<{
  sent: number
  skipped: number
  failed: number
}> {
  await ensureAftercareTable()
  const sql = getSql()
  const due = (await sql`
    select
      m.id,
      m.contact_id,
      m.client_service_id,
      m.service_name,
      m.cadence_days,
      c.name as contact_name,
      c.phone,
      c.anonymized_at::text as anonymized_at
    from whatsapp_aftercare_messages m
    join contacts c on c.id = m.contact_id
    where m.status = 'pending'
      and m.send_after <= now()
    order by m.send_after asc
    limit ${limit}
  `) as DueRow[]

  let sent = 0
  let skipped = 0
  let failed = 0

  let adapter: ReturnType<typeof getWhatsAppAdapter>
  try {
    adapter = getWhatsAppAdapter()
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    for (const row of due) {
      await sql`
        update whatsapp_aftercare_messages
        set status = 'failed', error = ${message}, sent_at = now()
        where id = ${row.id}
      `
      failed++
    }
    return { sent, skipped, failed }
  }

  for (const row of due) {
    if (row.anonymized_at) {
      await sql`
        update whatsapp_aftercare_messages
        set status = 'skipped', skip_reason = 'anonymized', sent_at = now()
        where id = ${row.id}
      `
      skipped++
      continue
    }
    const phone = (row.phone ?? '').replace(/\D/g, '')
    if (phone.length < 10) {
      await sql`
        update whatsapp_aftercare_messages
        set status = 'skipped', skip_reason = 'no_phone', sent_at = now()
        where id = ${row.id}
      `
      skipped++
      continue
    }

    const text = buildAftercareWhatsAppMessage({
      contactName: row.contact_name,
      serviceName: row.service_name,
      cadenceDays: row.cadence_days,
    })

    try {
      await adapter.sendMessage(phone, text)
      await sql`
        update whatsapp_aftercare_messages
        set status = 'sent', sent_at = now(), error = null
        where id = ${row.id}
      `
      await logEvent({
        contactId: row.contact_id,
        channel: 'whatsapp',
        direction: 'out',
        handledBy: 'system',
        payload: {
          kind: 'aftercare_whatsapp',
          client_service_id: row.client_service_id,
          service_name: row.service_name,
        },
      })
      sent++
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      await sql`
        update whatsapp_aftercare_messages
        set status = 'failed', error = ${message}, sent_at = now()
        where id = ${row.id}
      `
      failed++
    }
  }

  return { sent, skipped, failed }
}
