import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/api-response'
import { requireAdmin } from '@/lib/auth'
import { buildDirectorReport } from '@/lib/director-report/build'
import {
  reactivationCsv,
  returnCompareCsv,
  returnCsv,
  revenueCompareCsv,
  revenueCsv,
} from '@/lib/director-report/csv'
import { deliverDirectorReport } from '@/lib/director-report/deliver'
import {
  getDirectorReportRecipients,
  isDirectorEmailConfigured,
} from '@/lib/director-report/email'
import type { DirectorReportStage, MonthKey, QuarterKey } from '@/lib/director-report/types'

function asMonth(v: string | null): MonthKey | undefined {
  if (!v || !/^\d{4}-\d{2}$/.test(v)) return undefined
  return v as MonthKey
}

function asQuarter(v: string | null): QuarterKey | undefined {
  if (!v || !/^\d{4}-Q[1-4]$/.test(v)) return undefined
  return v as QuarterKey
}

function asStage(v: string | null | undefined): DirectorReportStage {
  if (v === '0011' || v === '0021' || v === 'all') return v
  return 'all'
}

/** GET /api/director-report — só admin. */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdmin(req)
    if (!auth.ok) return err(auth.message, auth.status)

    const { searchParams } = req.nextUrl
    const compareMonthsParam = searchParams.get('compare_months')
    const report = await buildDirectorReport({
      selectedMonth: asMonth(searchParams.get('month')),
      compareMonth: asMonth(searchParams.get('compare_month')),
      compareMonths: compareMonthsParam === null ? true : compareMonthsParam !== '0',
      selectedQuarter: asQuarter(searchParams.get('quarter')),
      compareQuarter: asQuarter(searchParams.get('compare')),
      professionalId: searchParams.get('professional_id') ?? undefined,
      forceMock: searchParams.get('mock') === '1',
    })

    const format = searchParams.get('format') ?? 'json'
    if (format === 'json') {
      return ok({
        ...report,
        delivery: {
          email_configured: isDirectorEmailConfigured(),
          recipients: getDirectorReportRecipients(),
        },
      })
    }

    let body = ''
    let filename = 'relatorio-diretoria.csv'
    if (format === 'csv-revenue') {
      body = revenueCsv(report)
      filename = '0021-faturamento-ticket-serie.csv'
    } else if (format === 'csv-revenue-compare') {
      body = revenueCompareCsv(report)
      filename = '0021-comparativo-mes.csv'
    } else if (format === 'csv-return') {
      body = returnCsv(report)
      filename = '0011-retorno-serie-trimestre.csv'
    } else if (format === 'csv-return-compare') {
      body = returnCompareCsv(report)
      filename = '0011-comparativo-trimestre.csv'
    } else if (format === 'csv-reactivation') {
      body = reactivationCsv(report)
      filename = '0011-lista-clientes-por-profissional.csv'
    } else {
      return err('format inválido', 400)
    }

    return new Response('\uFEFF' + body, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (e) {
    return handleError(e)
  }
}

/** POST — dispara etapa(s) do relatório (cron ou admin). */
export async function POST(req: NextRequest) {
  try {
    const cron = process.env.CRON_SECRET?.trim()
    const authHeader = req.headers.get('authorization')
    const isCron = Boolean(cron && authHeader === `Bearer ${cron}`)

    if (!isCron) {
      const auth = await requireAdmin(req)
      if (!auth.ok) return err(auth.message, auth.status)
    }

    const body = await req.json().catch(() => ({}))
    const forceMock = body?.mock !== false
    const stage = asStage(typeof body?.stage === 'string' ? body.stage : 'all')

    const report = await buildDirectorReport({
      forceMock,
      selectedMonth: asMonth(typeof body?.month === 'string' ? body.month : null),
      compareMonth: asMonth(typeof body?.compare_month === 'string' ? body.compare_month : null),
      compareMonths: body?.compare_months !== false && body?.compare_months !== 0,
      selectedQuarter: asQuarter(typeof body?.quarter === 'string' ? body.quarter : null),
      compareQuarter: asQuarter(typeof body?.compare === 'string' ? body.compare : null),
    })
    const delivery = await deliverDirectorReport(report, stage)

    console.info('[director-report] run', {
      at: report.generated_at,
      stage,
      professionals: report.summary.professionals,
      email: delivery.email.ok,
      telegram: delivery.telegram?.ok,
      cron: isCron,
    })

    const parts: string[] = []
    if (delivery.email.ok) parts.push(`e-mail → ${delivery.email.to.join(', ')} (${stage})`)
    else parts.push(`e-mail falhou (${delivery.email.error})`)
    if (delivery.telegram?.ok) parts.push('Telegram OK')
    else if (delivery.telegram) parts.push(`Telegram falhou: ${delivery.telegram.error}`)

    return ok({
      ran: true,
      stage,
      generated_at: report.generated_at,
      professionals: report.summary.professionals,
      summary: report.summary,
      period: report.period,
      delivery,
      note: parts.join(' · '),
    })
  } catch (e) {
    return handleError(e)
  }
}
