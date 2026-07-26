/**
 * One-shot: backfill receita (0088) + formas de pagamento (0081) do mês até hoje.
 * Corrige dias faltando em salon_daily_metrics / salon_p2_daily após migração ou gap de sync.
 *
 * Usage:
 *   DATABASE_URL=... AVEC_API_TOKEN=... AVEC_UNIT_ID=... \
 *     npx tsx scripts/run-revenue-month-backfill.ts
 *
 * Opcional: FROM=2026-07-01 TO=2026-07-26
 */
import { fetchAllAvecReport } from '../src/lib/avec/client'
import { normalizeRevenueRow } from '../src/lib/avec/normalize'
import { syncPaymentMixRecent } from '../src/lib/avec/sync-p2'
import { avecSiteParam } from '../src/lib/brand'
import { materializeSalonMonthMetrics, monthKeyFromDay } from '../src/lib/salon/month-metrics'
import { upsertSalonMetrics } from '../src/lib/salon/metrics'

function todayIsoLocal() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function addCalendarDays(isoYmd: string, delta: number) {
  const [y, m, d] = isoYmd.split('-').map(Number)
  return new Date(Date.UTC(y!, m! - 1, d! + delta)).toISOString().slice(0, 10)
}

function isoToBr(isoYmd: string) {
  const [y, m, d] = isoYmd.split('-')
  return `${d}/${m}/${y}`
}

function listDaysInclusive(fromIso: string, toIso: string): string[] {
  const out: string[] = []
  let cur = fromIso
  while (cur <= toIso) {
    out.push(cur)
    cur = addCalendarDays(cur, 1)
  }
  return out
}

function monthStartOf(todayYmd: string) {
  return `${todayYmd.slice(0, 7)}-01`
}

async function backfillRevenue(from: string, to: string) {
  const days = listDaysInclusive(from, to)
  const summary: { day: string; revenue: number; attended: number }[] = []
  const errors: string[] = []

  for (const day of days) {
    const params = {
      inicio: isoToBr(day),
      fim: isoToBr(day),
      site: avecSiteParam(),
      limit: 250,
    }
    try {
      const result = await fetchAllAvecReport('0088', params)
      const rows = Array.isArray(result)
        ? result
        : ((result as { rows?: Record<string, unknown>[] }).rows ?? [])

      let revenue = 0
      let attended = 0
      for (const row of rows as Record<string, unknown>[]) {
        const rev = normalizeRevenueRow(row)
        if (!rev) continue
        if (!rev.day || rev.day === day) {
          revenue += rev.revenue
          attended += rev.attended
        }
      }

      const attendedInt = Math.round(attended)
      // Sempre grava a linha do dia (mesmo 0) — senão Relatórios marca INCOMPLETO.
      await upsertSalonMetrics(day, {
        revenue: Math.round(revenue * 100) / 100,
        attended: attendedInt,
        ticket_avg: attendedInt > 0 ? Math.round((revenue / attendedInt) * 100) / 100 : null,
      })
      summary.push({ day, revenue: Math.round(revenue * 100) / 100, attended: attendedInt })
      console.log(
        `0088 ${day} revenue=${Math.round(revenue)} attended=${attendedInt} rows=${rows.length}`,
      )
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      errors.push(`${day}: ${msg}`)
      console.error(`0088 ERR ${day}`, msg)
    }
  }

  return { summary, errors }
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL obrigatório')
  if (!process.env.AVEC_API_TOKEN) throw new Error('AVEC_API_TOKEN obrigatório')

  const today = todayIsoLocal()
  const from = process.env.FROM?.trim() || monthStartOf(today)
  const to = process.env.TO?.trim() || today
  if (to < from) throw new Error(`TO (${to}) < FROM (${from})`)

  const daysBack = listDaysInclusive(from, to).length - 1
  console.log('backfill', { from, to, daysBack, unit: process.env.AVEC_UNIT_ID ?? null })

  const revenue = await backfillRevenue(from, to)

  const payStats = {
    snapshots_saved: 0,
    errors: [] as string[],
    warnings: [] as string[],
    p2_rows: 0,
  }
  console.log('0081 start', { daysBack })
  await syncPaymentMixRecent(payStats, undefined, daysBack)
  console.log(
    '0081 done',
    JSON.stringify({
      snapshots_saved: payStats.snapshots_saved,
      p2_rows: payStats.p2_rows,
      errors: payStats.errors.slice(0, 12),
    }),
  )

  const month = monthKeyFromDay(to)
  try {
    const materialized = await materializeSalonMonthMetrics(month)
    console.log(
      'month_metrics',
      JSON.stringify({
        month: materialized.month,
        status: materialized.status,
        days_present: materialized.days_present,
        days_expected: materialized.days_expected,
        days_missing: materialized.days_missing,
        revenue: Number(materialized.revenue),
        attended: materialized.attended,
      }),
    )
  } catch (e) {
    console.error('month_metrics WARN', e instanceof Error ? e.message : e)
  }

  const withRev = revenue.summary.filter((r) => r.revenue > 0)
  console.log(
    'OK revenue-month-backfill',
    JSON.stringify({
      days: revenue.summary.length,
      days_with_revenue: withRev.length,
      sum_revenue: Math.round(withRev.reduce((a, b) => a + b.revenue, 0)),
      revenue_errors: revenue.errors.slice(0, 12),
      payment_errors: payStats.errors.slice(0, 12),
    }),
  )
}

main().catch((e) => {
  console.error('FATAL', e)
  process.exit(1)
})
