/**
 * One-shot: no-shows (0248 status=Faltou) no mês + TM (0223).
 * Usage: DATABASE_URL=... AVEC_API_TOKEN=... AVEC_UNIT_ID=... npx tsx scripts/run-noshow-tm-once.ts
 */
import {
  fetchAllAvecReport,
  withRequiredAvecReportParams,
} from '../src/lib/avec/client'
import { normalizeAppointmentRow } from '../src/lib/avec/normalize'
import { upsertSalonMetrics } from '../src/lib/salon/metrics'
import { toSalonDateIso } from '../src/lib/salon/format'

function todayIsoLocal() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function monthStartBr(todayYmd: string) {
  const [y, m] = todayYmd.split('-')
  return `01/${m}/${y}`
}

function ymdToBr(ymd: string) {
  const [y, m, d] = ymd.split('-')
  return `${d}/${m}/${y}`
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL obrigatório')
  if (!process.env.AVEC_API_TOKEN) throw new Error('AVEC_API_TOKEN obrigatório')

  const today = todayIsoLocal()
  const inicio = monthStartBr(today)
  const fim = ymdToBr(today)

  const noshowParams = withRequiredAvecReportParams('0248', {
    inicio,
    fim,
    status: '0.6',
    limit: 250,
  })
  console.log('0248', noshowParams)
  const noshowResult = await fetchAllAvecReport('0248', noshowParams)
  const noshowRows = Array.isArray(noshowResult)
    ? noshowResult
    : ((noshowResult as { rows?: Record<string, unknown>[] }).rows ?? [])
  const byDay = new Map<string, number>()
  for (const row of noshowRows as Record<string, unknown>[]) {
    const appt = normalizeAppointmentRow(row)
    const day =
      (appt?.scheduledAt ? toSalonDateIso(appt.scheduledAt) : null) ??
      (typeof row.data === 'string' ? String(row.data).slice(0, 10) : null)
    if (!day) continue
    byDay.set(day, (byDay.get(day) ?? 0) + 1)
  }
  for (const [day, no_shows] of byDay) {
    await upsertSalonMetrics(day, { no_shows })
  }
  console.log(
    'no-shows',
    JSON.stringify({
      rows: noshowRows.length,
      days: Object.fromEntries(byDay),
      total: [...byDay.values()].reduce((a, b) => a + b, 0),
    }),
  )

  const tmParams = withRequiredAvecReportParams('0223', {
    inicio,
    fim,
    limit: 250,
    profissional_id: '',
  })
  console.log('0223', tmParams)
  try {
    const tmResult = await fetchAllAvecReport('0223', tmParams)
    const tmRows = Array.isArray(tmResult)
      ? tmResult
      : ((tmResult as { rows?: unknown[] }).rows ?? [])
    console.log('0223 rows', tmRows.length, 'sample', JSON.stringify(tmRows[0] ?? null)?.slice(0, 300))
  } catch (e) {
    console.log('0223 ERR', e instanceof Error ? e.message : e)
  }

  console.log('OK noshow/tm')
}

main().catch((e) => {
  console.error('FATAL', e)
  process.exit(1)
})
