/**
 * TM por observação do ROM: 1ª vez que vimos a pessoa no salão (comanda aberta)
 * vs 1ª vez que vimos Pago. Não é relógio Avec — granularidade = intervalo do sync.
 * Sem span aberto → não inventa duração. Fora de 1 min–8h → não entra na média.
 */
import { getSql } from '@/lib/db'
import { upsertSalonMetrics } from '@/lib/salon/metrics'

export const MIN_COMANDA_DURATION_MINUTES = 1
export const MAX_COMANDA_DURATION_MINUTES = 8 * 60

export type ComandaDurationClass =
  | { kind: 'ok'; minutes: number }
  | { kind: 'too_short' }
  | { kind: 'too_long' }
  | { kind: 'invalid' }

export function classifyComandaDuration(
  openedSeenAt: string,
  paidSeenAt: string,
): ComandaDurationClass {
  const start = new Date(openedSeenAt).getTime()
  const end = new Date(paidSeenAt).getTime()
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return { kind: 'invalid' }
  const minutes = (end - start) / 60_000
  if (minutes < MIN_COMANDA_DURATION_MINUTES) return { kind: 'too_short' }
  if (minutes > MAX_COMANDA_DURATION_MINUTES) return { kind: 'too_long' }
  return { kind: 'ok', minutes: Math.round(minutes * 10) / 10 }
}

export function computeComandaDurationMinutes(
  openedSeenAt: string,
  paidSeenAt: string,
): number | null {
  const classified = classifyComandaDuration(openedSeenAt, paidSeenAt)
  return classified.kind === 'ok' ? classified.minutes : null
}

export function addCalendarDaysYmd(day: string, delta: number): string {
  const d = new Date(`${day}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + delta)
  return d.toISOString().slice(0, 10)
}

/**
 * Relógio no dia da visita (hoje/ontem).
 * Começa: no salão, walk-in/comanda, ou Agendado cuja hora marcada já passou.
 * Não começa em Agendado futuro (ainda não deveria estar no salão).
 */
export function shouldStartComandaClock(opts: {
  apptDay: string | null
  today: string
  yesterday: string
  isPaid: boolean
  isLost: boolean
  isOpenComanda: boolean
  inSalonOpen: boolean
  scheduleOrigin: 'comanda' | 'agenda'
  scheduledAt?: string | null
  nowMs?: number
}): boolean {
  if (opts.isPaid || opts.isLost || !opts.isOpenComanda) return false
  if (opts.apptDay !== opts.today && opts.apptDay !== opts.yesterday) return false
  if (opts.inSalonOpen) return true
  if (opts.scheduleOrigin === 'comanda') return true
  if (!opts.scheduledAt) return false
  const start = new Date(opts.scheduledAt).getTime()
  if (Number.isNaN(start)) return false
  return (opts.nowMs ?? Date.now()) >= start
}

/** Fecha só quando o 0051 não mostra mais linha aberta — ainda no salão + Pago antigo não queima a amostra. */
export function shouldCloseComandaClock(opts: {
  stillOpenInBatch: boolean
  isPaid: boolean
}): boolean {
  return opts.isPaid && !opts.stillOpenInBatch
}

let ensurePromise: Promise<void> | null = null

async function ensureComandaSpansTable(): Promise<void> {
  if (!ensurePromise) {
    ensurePromise = (async () => {
      const sql = getSql()
      await sql`
        create table if not exists salon_comanda_spans (
          contact_id uuid not null references contacts (id) on delete cascade,
          day date not null,
          opened_seen_at timestamptz not null,
          paid_seen_at timestamptz,
          duration_minutes numeric(8, 1),
          created_at timestamptz not null default now(),
          primary key (contact_id, day)
        )
      `
      await sql`
        create index if not exists salon_comanda_spans_day_idx on salon_comanda_spans (day)
      `
      // Mesmo sync abria+fechava em ~2s e gravava paid sem duração — reabre pra fechar de verdade.
      await sql`
        update salon_comanda_spans
        set paid_seen_at = null
        where paid_seen_at is not null
          and duration_minutes is null
          and paid_seen_at < opened_seen_at + interval '1 minute'
      `
    })().catch((e) => {
      ensurePromise = null
      throw e
    })
  }
  return ensurePromise
}

export async function markComandaOpenedSeen(contactId: string, day: string, seenAt = new Date()) {
  await ensureComandaSpansTable()
  const sql = getSql()
  await sql`
    insert into salon_comanda_spans (contact_id, day, opened_seen_at)
    values (${contactId}::uuid, ${day}::date, ${seenAt.toISOString()}::timestamptz)
    on conflict (contact_id, day) do nothing
  `
}

export async function markComandaPaidSeen(
  contactId: string,
  day: string,
  seenAt = new Date(),
  fallbackDay?: string,
): Promise<boolean> {
  await ensureComandaSpansTable()
  const sql = getSql()
  const days = fallbackDay && fallbackDay !== day ? [day, fallbackDay] : [day]
  const paidIso = seenAt.toISOString()

  for (const d of days) {
    const rows = (await sql`
      select opened_seen_at::text as opened_seen_at
      from salon_comanda_spans
      where contact_id = ${contactId}::uuid
        and day = ${d}::date
        and paid_seen_at is null
      limit 1
    `) as { opened_seen_at: string }[]
    const opened = rows[0]?.opened_seen_at
    if (!opened) continue
    const classified = classifyComandaDuration(opened, paidIso)
    if (classified.kind === 'too_short') {
      // Mesmo ciclo do sync — não queima o span; o próximo 0051 fecha com intervalo real.
      return false
    }
    const duration = classified.kind === 'ok' ? classified.minutes : null
    await sql`
      update salon_comanda_spans
      set
        paid_seen_at = ${paidIso}::timestamptz,
        duration_minutes = ${duration}::numeric
      where contact_id = ${contactId}::uuid
        and day = ${d}::date
        and paid_seen_at is null
    `
    return true
  }
  return false
}

export async function rollupComandaDurations(days: string[]): Promise<void> {
  const unique = [...new Set(days.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)))]
  if (unique.length === 0) return
  await ensureComandaSpansTable()
  const sql = getSql()
  for (const day of unique) {
    const rows = (await sql`
      select
        coalesce(sum(duration_minutes), 0) as sum_minutes,
        count(*)::int as sample_count
      from salon_comanda_spans
      where day = ${day}::date
        and duration_minutes is not null
    `) as { sum_minutes: string | number; sample_count: string | number }[]
    const sampleCount = Number(rows[0]?.sample_count ?? 0) || 0
    if (sampleCount <= 0) continue
    const sumMinutes = Number(rows[0]?.sum_minutes ?? 0) || 0
    await upsertSalonMetrics(day, {
      service_duration_sum_minutes: sumMinutes,
      service_duration_count: sampleCount,
    })
  }
}
