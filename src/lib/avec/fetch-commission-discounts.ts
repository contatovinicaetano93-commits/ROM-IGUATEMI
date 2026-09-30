import {
  calendarMonthRangeBr,
  fetchAllAvecReport,
  withRequiredAvecReportParams,
} from '@/lib/avec/client'
import { normalizeCommission0029Row } from '@/lib/avec/normalize'
import { resolveReportId, getAvecReportRegistry } from '@/lib/avec/registry'
import {
  getSalonCommissionDiscountsDailyNear,
  upsertSalonCommissionDiscountsDaily,
  type CommissionDiscountLine,
} from '@/lib/salon/commission-discount-metrics'

function todayIsoLocal() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function asRows(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) {
    return result.every((item) => item && typeof item === 'object')
      ? (result as Record<string, unknown>[])
      : []
  }
  if (result && typeof result === 'object') {
    const rows = (result as { rows?: unknown }).rows
    if (Array.isArray(rows) && rows.every((item) => item && typeof item === 'object')) {
      return rows as Record<string, unknown>[]
    }
  }
  return []
}

function resolve0029ReportId(): string | null {
  const def = getAvecReportRegistry().find((r) => r.mapper === 'commission_discounts')
  return def ? resolveReportId(def) : null
}

export type CommissionDiscountsResult = {
  lines: CommissionDiscountLine[]
  reference_day: string | null
  avec_pro_id: string
  source: 'cache' | 'live' | 'none'
}

/**
 * Espelho 0029 para um profissional: cache diário, senão fetch live + upsert.
 * Falha Avec → devolve cache velho se houver; senão linhas vazias (não quebra o KPI).
 */
export async function getOrFetchCommissionDiscounts0029(
  avecProId: string,
  opts?: { anchorDay?: string; maxSkewDays?: number; forceRefresh?: boolean },
): Promise<CommissionDiscountsResult> {
  const id = avecProId.trim()
  const day =
    opts?.anchorDay && /^\d{4}-\d{2}-\d{2}$/.test(opts.anchorDay)
      ? opts.anchorDay
      : todayIsoLocal()
  const maxSkew = opts?.maxSkewDays ?? 14

  if (!id) {
    return { lines: [], reference_day: null, avec_pro_id: '', source: 'none' }
  }

  if (!opts?.forceRefresh) {
    const cached = await getSalonCommissionDiscountsDailyNear(day, id, { maxSkewDays: maxSkew })
    if (cached && cached.day === day) {
      return {
        lines: cached.lines,
        reference_day: cached.day,
        avec_pro_id: id,
        source: 'cache',
      }
    }
  }

  const reportId = resolve0029ReportId()
  if (!reportId) {
    const stale = await getSalonCommissionDiscountsDailyNear(day, id, { maxSkewDays: maxSkew })
    return {
      lines: stale?.lines ?? [],
      reference_day: stale?.day ?? null,
      avec_pro_id: id,
      source: stale ? 'cache' : 'none',
    }
  }

  const { inicio, fim } = calendarMonthRangeBr(day)
  const params = withRequiredAvecReportParams(reportId, {
    inicio,
    fim,
    limit: 250,
    profissional_id: id,
  })

  try {
    if (!params.profissional_id) {
      throw new Error('0029 exige profissional_id')
    }
    const result = await fetchAllAvecReport(reportId, params)
    if (result.truncated) {
      const stale = await getSalonCommissionDiscountsDailyNear(day, id, { maxSkewDays: maxSkew })
      return {
        lines: stale?.lines ?? [],
        reference_day: stale?.day ?? null,
        avec_pro_id: id,
        source: stale ? 'cache' : 'none',
      }
    }
    const lines: CommissionDiscountLine[] = []
    for (const row of asRows(result)) {
      const parsed = normalizeCommission0029Row(row)
      if (parsed) lines.push(parsed)
    }
    await upsertSalonCommissionDiscountsDaily(day, id, lines)
    return { lines, reference_day: day, avec_pro_id: id, source: 'live' }
  } catch {
    const stale = await getSalonCommissionDiscountsDailyNear(day, id, { maxSkewDays: maxSkew })
    return {
      lines: stale?.lines ?? [],
      reference_day: stale?.day ?? null,
      avec_pro_id: id,
      source: stale ? 'cache' : 'none',
    }
  }
}
