import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/api-response'
import { requireFinance } from '@/lib/auth'
import { isCronAuthorized } from '@/lib/cron-auth'
import { isAvecConfigured } from '@/lib/avec/client'
import {
  monthsNeedingAnalyticsBackfill,
  runAnalyticsMonthBackfill,
  type AnalyticsBackfillStep,
} from '@/lib/avec/analytics-backfill'

/** Snapshots P1/P2/P3 cabem bem; cancelamentos vão em chunks de ≤7 dias. */
export const maxDuration = 300

async function authorize(req: NextRequest) {
  if (isCronAuthorized(req)) return { ok: true as const }
  const auth = await requireFinance(req)
  if (!auth.ok) return auth
  return { ok: true as const }
}

function parseMonth(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const v = value.trim()
  if (!/^\d{4}-\d{2}$/.test(v)) return undefined
  return v
}

function parseSteps(value: unknown): AnalyticsBackfillStep[] | undefined {
  if (!Array.isArray(value)) return undefined
  const allowed = new Set(['p1', 'p2', 'p3', 'snapshots', 'cancellations'])
  const steps = value.filter((s): s is AnalyticsBackfillStep => typeof s === 'string' && allowed.has(s))
  return steps.length ? steps : undefined
}

function parseIsoDay(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const v = value.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined
  return v
}

/**
 * POST — preenche Visão analítica de um mês.
 * Body:
 *   { month: "2026-04" }                         → só p1 (default)
 *   { month, steps: ["cancellations"], cancelFrom, cancelMaxDays }
 *   { months: ["2026-01","2026-02"], steps: ["snapshots"] }  (máx. 2)
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await authorize(req)
    if (!auth.ok) return err(auth.message, auth.status)

    if (!isAvecConfigured()) {
      return err('Avec não configurado (AVEC_API_TOKEN)', 503)
    }

    let body: Record<string, unknown> = {}
    try {
      body = (await req.json()) as Record<string, unknown>
    } catch {
      body = {}
    }

    const single = parseMonth(body.month)
    const listRaw = Array.isArray(body.months) ? body.months : []
    const months = [
      ...(single ? [single] : []),
      ...listRaw.map(parseMonth).filter((m): m is string => Boolean(m)),
    ]
    const unique = [...new Set(months)]

    if (unique.length === 0) {
      return err('Informe month (YYYY-MM) ou months[]', 400)
    }
    if (unique.length > 3) {
      return err('Máximo 3 meses por chamada quando steps=p1|p2|p3 (evita timeout)', 400)
    }

    const steps = parseSteps(body.steps)
    // Default seguro: um slice por vez. Se caller passar months[] sem steps, usa p1.
    const effectiveSteps = steps ?? (unique.length > 1 ? (['p1'] as AnalyticsBackfillStep[]) : undefined)
    const cancelFrom = parseIsoDay(body.cancelFrom)
    const cancelMaxDaysRaw = body.cancelMaxDays
    const cancelMaxDays =
      typeof cancelMaxDaysRaw === 'number' && Number.isFinite(cancelMaxDaysRaw)
        ? Math.floor(cancelMaxDaysRaw)
        : typeof cancelMaxDaysRaw === 'string' && cancelMaxDaysRaw.trim()
          ? Math.floor(Number(cancelMaxDaysRaw))
          : undefined

    const results = []
    for (const month of unique) {
      results.push(
        await runAnalyticsMonthBackfill(month, {
          steps: effectiveSteps,
          cancelFrom,
          cancelMaxDays,
        }),
      )
    }

    return ok({
      results,
      suggested_remaining: monthsNeedingAnalyticsBackfill().filter((m) => !unique.includes(m)),
      note: 'Default = p1. Rode p2, p3 e cancellations em chamadas separadas. cancelFrom=next_cancel_from até done.',
    })
  } catch (e) {
    return handleError(e)
  }
}

export async function GET(req: NextRequest) {
  try {
    const auth = await authorize(req)
    if (!auth.ok) return err(auth.message, auth.status)

    return ok({
      endpoint: '/api/admin/analytics-backfill',
      method: 'POST',
      body: {
        month: 'YYYY-MM (um mês)',
        months: 'string[] (máx. 3 com steps finos)',
        steps: '["p1"] | ["p2"] | ["p3"] | ["snapshots"] | ["cancellations"]',
        cancelFrom: 'YYYY-MM-DD (chunk cancelamentos)',
        cancelMaxDays: '1–14 (default 5)',
      },
      suggested: monthsNeedingAnalyticsBackfill(),
      note: 'Ordem recomendada por mês: p1 → p2 → p3 → cancellations (chunks).',
    })
  } catch (e) {
    return handleError(e)
  }
}
