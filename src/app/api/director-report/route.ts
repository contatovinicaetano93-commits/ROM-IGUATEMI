import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/api-response'
import { requireAdmin } from '@/lib/auth'
import { isCronAuthorized } from '@/lib/cron-auth'
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
import { buildProfessionalProfileWorkbook } from '@/lib/director-report/xlsx-profile'

export const maxDuration = 300

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

async function runDelivery(
  _req: NextRequest,
  opts: {
    stage: DirectorReportStage
    forceMock: boolean
    isCron: boolean
    professionalId?: string
    month?: MonthKey
    quarter0021?: QuarterKey
    compareQuarter0021?: QuarterKey | null
    compareMonths?: boolean
    quarter?: QuarterKey
    compare?: QuarterKey
  }
) {
  const report = await buildDirectorReport({
    forceMock: opts.forceMock,
    selectedMonth: opts.month,
    selectedQuarter0021: opts.quarter0021,
    compareQuarter0021: opts.compareQuarter0021,
    compareMonths: opts.compareMonths,
    selectedQuarter: opts.quarter,
    compareQuarter: opts.compare,
    professionalId: opts.professionalId,
  })
  const delivery = await deliverDirectorReport(report, opts.stage)

  console.info('[director-report] run', {
    at: report.generated_at,
    stage: opts.stage,
    source: report.source,
    professionals: report.summary.professionals,
    email: delivery.email.ok,
    telegram: delivery.telegram?.ok,
    cron: opts.isCron,
  })

  const parts: string[] = []
  if (delivery.email.ok) parts.push(`e-mail → ${delivery.email.to.join(', ')} (${opts.stage})`)
  else parts.push(`e-mail falhou (${delivery.email.error})`)
  if (delivery.telegram?.ok) parts.push('Telegram OK')
  else if (delivery.telegram) parts.push(`Telegram falhou: ${delivery.telegram.error}`)

  return ok({
    ran: true,
    stage: opts.stage,
    source: report.source,
    generated_at: report.generated_at,
    professionals: report.summary.professionals,
    summary: report.summary,
    period: report.period,
    delivery,
    note: parts.join(' · '),
  })
}

/** GET — admin: JSON/CSV · cron Vercel: dispara envio (terças). */
export async function GET(req: NextRequest) {
  try {
    const cron = isCronAuthorized(req)

    // Vercel Cron = GET + Authorization: Bearer CRON_SECRET
    if (cron) {
      return await runDelivery(req, {
        stage: 'all',
        forceMock: false,
        isCron: true,
        // 0021 no cron semanal: trimestre atual vs anterior
        compareMonths: true,
      })
    }

    const auth = await requireAdmin(req)
    if (!auth.ok) return err(auth.message, auth.status)

    const { searchParams } = req.nextUrl
    const format = searchParams.get('format') ?? 'json'

    if (format === 'xlsx-profile') {
      const professionalId = searchParams.get('professional_id')
      if (!professionalId) return err('professional_id obrigatório', 400)
      const profile = await buildProfessionalProfileWorkbook(professionalId, {
        forceMock: searchParams.get('mock') === '1',
      })
      return new Response(new Uint8Array(profile.buffer), {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${profile.filename}"`,
        },
      })
    }

    const compareMonthsParam = searchParams.get('compare_months')
    const report = await buildDirectorReport({
      selectedMonth: asMonth(searchParams.get('month')),
      selectedQuarter0021: asQuarter(searchParams.get('quarter_0021')),
      compareQuarter0021: asQuarter(searchParams.get('compare_0021')),
      compareMonths: compareMonthsParam === null ? false : compareMonthsParam !== '0',
      selectedQuarter: asQuarter(searchParams.get('quarter')),
      compareQuarter: asQuarter(searchParams.get('compare')),
      professionalId: searchParams.get('professional_id') ?? undefined,
      forceMock: searchParams.get('mock') === '1',
    })

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
      filename = '0021-comparativo-trimestre.csv'
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

/** POST — dispara etapa(s) do relatório (cron com body ou admin). */
export async function POST(req: NextRequest) {
  try {
    const cron = isCronAuthorized(req)

    if (!cron) {
      const auth = await requireAdmin(req)
      if (!auth.ok) return err(auth.message, auth.status)
    }

    const body = await req.json().catch(() => ({}))
    // Só força mock se pedido explicitamente; senão build usa Avec live quando token OK.
    const forceMock = body?.mock === true || body?.mock === 1 || body?.mock === '1'
    const stage = asStage(typeof body?.stage === 'string' ? body.stage : 'all')

    const professionalId =
      typeof body?.professional_id === 'string' && body.professional_id.trim()
        ? body.professional_id.trim()
        : undefined

    return await runDelivery(req, {
      stage,
      forceMock,
      isCron: cron,
      professionalId,
      month: asMonth(typeof body?.month === 'string' ? body.month : null),
      quarter0021: asQuarter(typeof body?.quarter_0021 === 'string' ? body.quarter_0021 : null),
      compareQuarter0021: asQuarter(
        typeof body?.compare_0021 === 'string' ? body.compare_0021 : null
      ),
      compareMonths:
        body?.compare_months === undefined
          ? stage !== '0021'
            ? true
            : false
          : body?.compare_months !== false && body?.compare_months !== 0,
      quarter: asQuarter(typeof body?.quarter === 'string' ? body.quarter : null),
      compare: asQuarter(typeof body?.compare === 'string' ? body.compare : null),
    })
  } catch (e) {
    return handleError(e)
  }
}
