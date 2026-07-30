import { NextRequest } from 'next/server'
import { ok, err, handleError } from '@/lib/api-response'
import { requireAdmin, requireSession } from '@/lib/auth'
import { cachedFetch } from '@/lib/cache'
import { isCronAuthorized } from '@/lib/cron-auth'
import { buildDirectorReport, type BuildDirectorReportOptions } from '@/lib/director-report/build'
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
import { isHistoricalDirectorPeriod } from '@/lib/director-report/period'
import type { DirectorReport, DirectorReportStage, MonthKey, QuarterKey } from '@/lib/director-report/types'
import { buildProfessionalProfileWorkbook } from '@/lib/director-report/xlsx-profile'

export const maxDuration = 300

/** Teto duro da UI (mês/ano corrente) — se Avec travar, devolve vazio em vez de spinner infinito. */
const DIRECTOR_UI_HARD_MS = 55_000

async function buildForUi(
  opts: Parameters<typeof buildDirectorReport>[0],
): Promise<DirectorReport> {
  try {
    return await Promise.race([
      buildDirectorReport({ ...opts, interactive: true }),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(Object.assign(new Error('UI_DEADLINE'), { code: 'UI_DEADLINE' })), DIRECTOR_UI_HARD_MS)
      }),
    ])
  } catch (e) {
    const code = e && typeof e === 'object' && 'code' in e ? (e as { code?: string }).code : null
    if (code === 'UI_DEADLINE' || (e instanceof Error && e.message === 'UI_DEADLINE')) {
      // Sem mock automático: devolve estrutura vazia (source=error). Demo só com ?mock=1.
      const note =
        'Avec demorou demais — sem dados inventados. Toque Atualizar. Use “Forçar demo” só para treino.'
      const skeleton = await buildDirectorReport({ ...opts, forceMock: true, interactive: true })
      return {
        ...skeleton,
        source: 'error',
        return_blocks: [],
        revenue_blocks: [],
        schedule_note: note,
        summary: {
          professionals: skeleton.summary.professionals,
          avg_return_rate: null,
          total_revenue_selected_month: 0,
          avg_ticket_selected_month: null,
        },
      }
    }
    throw e
  }
}

/** Anos históricos (ex. 2025): budget Avec completo, sem teto de 55s. */
async function buildForHistorical(
  opts: Parameters<typeof buildDirectorReport>[0],
): Promise<DirectorReport> {
  return buildDirectorReport({
    ...opts,
    interactive: false,
    maxPages0011: undefined,
    reactivationLimit: null,
  })
}

function shouldCacheDirectorReport(report: DirectorReport): boolean {
  // Não cachear casca vazia de timeout — gruda “2025 zerado” por minutos.
  return report.source !== 'error'
}

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
    stages: opts.stage === 'all' ? 'all' : opts.stage,
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

    const auth = await requireSession(req)
    if (!auth.ok) return err(auth.message, auth.status)
    const canViewRevenue = auth.session.role === 'admin'

    const { searchParams } = req.nextUrl
    const format = searchParams.get('format') ?? 'json'

    // Faturamento (0021) — só admin. Retorno/reativação (0011) não tem valor em R$.
    const revenueFormats = ['xlsx-profile', 'csv-revenue', 'csv-revenue-compare']
    if (revenueFormats.includes(format) && !canViewRevenue) {
      return err('Acesso restrito ao admin operacional', 403)
    }

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
    const stageParam = searchParams.get('stage')
    const stages =
      stageParam === '0011' || stageParam === '0021' || stageParam === 'all'
        ? stageParam
        : 'all'
    const professionalId = searchParams.get('professional_id') ?? undefined
    const forceMock = searchParams.get('mock') === '1'
    const selectedMonth = asMonth(searchParams.get('month'))
    const selectedQuarter0021 = asQuarter(searchParams.get('quarter_0021'))
    const compareQuarter0021 = asQuarter(searchParams.get('compare_0021'))
    const compareMonths = compareMonthsParam === null ? false : compareMonthsParam !== '0'
    const selectedQuarter = asQuarter(searchParams.get('quarter'))
    const compareQuarter = asQuarter(searchParams.get('compare'))
    const historical = isHistoricalDirectorPeriod({
      month: selectedMonth,
      quarter: selectedQuarter,
      compare: compareQuarter,
      quarter0021: selectedQuarter0021,
      compare0021: compareQuarter0021,
      stage: stages,
      compareMonths,
    })
    // Histórico: nunca slim — precisa do walk Avec completo ou o relatório fica zerado.
    const slim = historical ? false : searchParams.get('slim') === '1'
    const buildOpts: BuildDirectorReportOptions = {
      selectedMonth,
      selectedQuarter0021,
      compareQuarter0021,
      compareMonths,
      selectedQuarter,
      compareQuarter,
      professionalId,
      forceMock,
      stages,
      // CSV/e-mail: roster piso + lista completa. UI slim: corta reativação.
      floorOnly: true,
      reactivationLimit:
        format === 'json' && slim ? (professionalId ? 80 : 8) : null,
      maxPages0011: slim ? 6 : undefined,
    }

    const report =
      format === 'json'
        ? await cachedFetch(
            [
              'director:json:v8-hist-stage',
              stages,
              `slim=${slim ? 1 : 0}`,
              `hist=${historical ? 1 : 0}`,
              `m=${buildOpts.selectedMonth ?? ''}`,
              `q21=${buildOpts.selectedQuarter0021 ?? ''}`,
              `c21=${buildOpts.compareQuarter0021 ?? ''}`,
              `cm=${buildOpts.compareMonths ? 1 : 0}`,
              `q=${buildOpts.selectedQuarter ?? ''}`,
              `c=${buildOpts.compareQuarter ?? ''}`,
              `pro=${professionalId ?? ''}`,
              `mock=${forceMock ? 1 : 0}`,
            ].join(':'),
            () => (historical ? buildForHistorical(buildOpts) : buildForUi(buildOpts)),
            // Mock/demo não cacheia — UI_DEADLINE não deve “grudar” após Avec recuperar.
            forceMock ? 0 : historical ? 300 : 45,
            { shouldCache: shouldCacheDirectorReport },
          )
        : await buildDirectorReport({ ...buildOpts, interactive: false })

    if (format === 'json') {
      return ok({
        ...report,
        // Staff não vê faturamento (0021) — 0011 (retorno/reativação) não tem valor em R$.
        ...(canViewRevenue
          ? {}
          : {
              revenue_blocks: [],
              summary: {
                ...report.summary,
                total_revenue_selected_month: 0,
                avg_ticket_selected_month: null,
              },
            }),
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
