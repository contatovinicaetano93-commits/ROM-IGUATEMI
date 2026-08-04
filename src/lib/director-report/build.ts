import { isAvecConfigured, isAvecMock } from '@/lib/avec/client'
import {
  directorFullBudget,
  directorUiBudget,
  DIRECTOR_UI_SLIM_MAX_PAGES,
  fetchLiveDirectorBlocks,
  type LiveDirectorStage,
} from './avec-live'
import {
  buildMockReturnBlocks,
  buildMockRevenueBlocks,
  defaultCompareQuarter,
  defaultSelectedMonth,
  defaultSelectedQuarter,
} from './mock'
import {
  aggregateQuarterRevenue,
  label0011,
  label0021,
  monthsInComparableQuarter,
  orderQuarters,
  reportPeriodLabel,
  reportReferenceDate,
} from './period'
import { DIRECTOR_FLOOR_ROLES, listDirectorProfessionals } from './professionals'
import type { DirectorReport, DirectorReturnSource, MonthKey, QuarterKey } from './types'

/** Evita jogar JSON bruto de validação Avec na UI (HTTP 400 salao_id etc.). */
function shortenAvecWarning(w: string): string {
  if (/0011 local via 0002/i.test(w)) {
    return '0011 local (0002+0007 por profissional)'
  }
  if (
    /n[aã]o suportado/i.test(w) ||
    /usando taxa\/lista/i.test(w) ||
    /via 0007/i.test(w) ||
    /n[aã]o dispon[ií]vel neste sal[aã]o/i.test(w)
  ) {
    return '0011 via 0007 (taxa do salão Avec)'
  }
  if (/salao_id/i.test(w) && !/99801|AVEC_UNIT_ID já/i.test(w)) {
    return '0011: Avec exige salao_id — confira AVEC_UNIT_ID'
  }
  if (/HTTP 400/i.test(w)) {
    return w.replace(/\{[\s\S]*\}/, '').trim().slice(0, 120) || 'Avec HTTP 400'
  }
  return w.length > 160 ? `${w.slice(0, 157)}…` : w
}

export interface BuildDirectorReportOptions {
  selectedMonth?: MonthKey
  /** false = 0021 só o mês selecionado (sem comparativo) */
  compareMonths?: boolean
  /** Trimestre foco do comparativo 0021 */
  selectedQuarter0021?: QuarterKey
  /** Trimestre de comparação do 0021 */
  compareQuarter0021?: QuarterKey | null
  selectedQuarter?: QuarterKey
  compareQuarter?: QuarterKey
  professionalId?: string
  /** Só com “Forçar demo” / ?mock=1 — nunca no caminho normal. */
  forceMock?: boolean
  /** Qual etapa buscar na Avec (UI carrega 0011/0021 separado). */
  stages?: LiveDirectorStage
  /**
   * true (default na UI): só hairstylist/makeup — evita roster de 200+ staff.
   * false: roster ativo completo (envio/cron).
   */
  floorOnly?: boolean
  /** Cap de páginas Avec 0011 (default 40 na live). */
  maxPages0011?: number
  /**
   * true = budget Avec curto (UI JSON). false/omit = full (cron, CSV, e-mail).
   */
  interactive?: boolean
  /**
   * Limita clientes de reativação por profissional na resposta JSON (UI).
   * null/undefined = sem corte (CSV/e-mail).
   */
  reactivationLimit?: number | null
}

function comparisonMonthSet(
  selectedMonth: MonthKey,
  selectedQuarter: QuarterKey,
  compareQuarter: QuarterKey
) {
  return new Set([
    ...monthsInComparableQuarter(selectedQuarter, selectedMonth, selectedQuarter, compareQuarter),
    ...monthsInComparableQuarter(compareQuarter, selectedMonth, selectedQuarter, compareQuarter),
  ])
}

export async function buildDirectorReport(
  opts: BuildDirectorReportOptions = {}
): Promise<DirectorReport> {
  const selectedMonth = opts.selectedMonth ?? defaultSelectedMonth()
  const compareMonths = opts.compareMonths === true
  const selectedQuarter0021 = opts.selectedQuarter0021 ?? defaultSelectedQuarter()
  const compareQuarter0021 = compareMonths
    ? (opts.compareQuarter0021 ?? defaultCompareQuarter())
    : null
  const selectedQuarter = opts.selectedQuarter ?? defaultSelectedQuarter()
  const compareQuarter = opts.compareQuarter ?? defaultCompareQuarter()
  const stages: LiveDirectorStage = opts.stages ?? 'all'
  const want0011 = stages === '0011' || stages === 'all'
  const want0021 = stages === '0021' || stages === 'all'
  const floorOnly = opts.floorOnly !== false

  let professionals = listDirectorProfessionals(
    true,
    floorOnly ? { roles: DIRECTOR_FLOOR_ROLES } : undefined,
  )
  if (opts.professionalId) {
    const all = listDirectorProfessionals(true)
    professionals = all.filter((p) => p.id === opts.professionalId)
  }

  // Demo explícito — único caminho que inventa números.
  if (opts.forceMock || isAvecMock()) {
    const return_blocks = want0011
      ? buildMockReturnBlocks(professionals, selectedQuarter, compareQuarter)
      : []
    const revenue_blocks = want0021
      ? buildMockRevenueBlocks(professionals, selectedMonth)
      : []
    const returnRates = return_blocks
      .map((b) => b.quarters.find((x) => x.quarter === selectedQuarter)?.return_rate ?? null)
      .filter((x): x is number => x != null)
    const selectedRevenue = !want0021
      ? []
      : revenue_blocks.map((b) => {
          const row = b.months.find((m) => m.month === selectedMonth)
          return row ?? { revenue: 0, ticket_avg: 0, attended: 0 }
        })
    const totalRev = selectedRevenue.reduce((s, r) => s + r.revenue, 0)
    const totalAtt = selectedRevenue.reduce((s, r) => s + r.attended, 0)
    const draft: DirectorReport = {
      generated_at: new Date().toISOString(),
      period: {
        selected_month: selectedMonth,
        compare_months: compareMonths && Boolean(compareQuarter0021),
        selected_quarter_0021: selectedQuarter0021,
        compare_quarter_0021: compareQuarter0021,
        selected_quarter: selectedQuarter,
        compare_quarter: compareQuarter,
        label: '',
        label_0011: '',
        label_0021: '',
        reference_date: '',
      },
      source: 'mock',
      return_source: 'mock',
      avec_reports: { return: '0011', revenue: '0021' },
      schedule_note: 'Dados de demonstração (mock) — não usar para decisão',
      return_blocks,
      revenue_blocks,
      summary: {
        professionals: professionals.length,
        avg_return_rate:
          returnRates.length > 0
            ? returnRates.reduce((a, b) => a + b, 0) / returnRates.length
            : null,
        total_revenue_selected_month: want0021 ? totalRev : null,
        avg_ticket_selected_month:
          want0021 && totalAtt > 0 ? Math.round(totalRev / totalAtt) : null,
      },
    }
    draft.period.reference_date = reportReferenceDate(draft)
    draft.period.label_0011 = label0011(draft)
    draft.period.label_0021 = label0021(draft)
    draft.period.label = reportPeriodLabel(draft)
    return draft
  }

  const avecReady = isAvecConfigured()
  let source: 'mock' | 'avec' | 'error' | 'partial' = 'error'
  let return_blocks: DirectorReport['return_blocks'] = []
  let revenue_blocks: DirectorReport['revenue_blocks'] = []
  let liveNote: string | null = null
  let live0011 = false
  let live0021 = false
  let returnSource: DirectorReturnSource = 'none'

  if (!avecReady) {
    liveNote = 'Avec não configurada — sem dados inventados'
  } else {
    try {
      const live = await fetchLiveDirectorBlocks(
        professionals,
        selectedMonth,
        selectedQuarter0021,
        compareQuarter0021,
        selectedQuarter,
        compareQuarter,
        {
          stages,
          maxPages0011: opts.maxPages0011,
          budget: opts.interactive
            ? directorUiBudget(
                Date.now(),
                opts.maxPages0011 ?? DIRECTOR_UI_SLIM_MAX_PAGES,
              )
            : directorFullBudget(),
        },
      )
      // null = falha → vazio; [] = Avec OK sem dados no período.
      if (want0011) {
        if (live.return_blocks !== null) {
          return_blocks = live.return_blocks
          live0011 = true
          returnSource = live.return_source
        } else {
          return_blocks = []
          returnSource = 'none'
        }
      }
      if (want0021) {
        if (live.revenue_blocks !== null) {
          revenue_blocks = live.revenue_blocks
          live0021 = true
        } else {
          revenue_blocks = []
        }
      }
      const ok0011 = !want0011 || live0011
      const ok0021 = !want0021 || live0021
      if (ok0011 && ok0021) {
        source = 'avec'
      } else if (live0011 || live0021) {
        source = 'partial'
        const missing = [
          want0011 && !live0011 ? '0011' : null,
          want0021 && !live0021 ? '0021' : null,
        ]
          .filter(Boolean)
          .join('+')
        liveNote = [
          liveNote,
          `Etapa ${missing} sem dado Avec — bloco vazio (sem fixture).`,
        ]
          .filter(Boolean)
          .join(' · ')
      } else {
        source = 'error'
        liveNote = [
          liveNote,
          'Avec sem dados utilizáveis — relatório vazio (sem fixture)',
        ]
          .filter(Boolean)
          .join(' · ')
      }
      if (live.warnings.length) {
        liveNote = [
          liveNote,
          ...live.warnings.slice(0, 3).map((w) => shortenAvecWarning(w)),
        ]
          .filter(Boolean)
          .join(' · ')
      }
    } catch (e) {
      source = 'error'
      return_blocks = []
      revenue_blocks = []
      liveNote = `Avec live falhou — sem fixture: ${e instanceof Error ? e.message : String(e)}`
      console.warn('[director-report]', liveNote)
    }
  }

  const reactivationLimit = opts.reactivationLimit
  if (
    want0011 &&
    reactivationLimit != null &&
    Number.isFinite(reactivationLimit) &&
    reactivationLimit >= 0
  ) {
    return_blocks = return_blocks.map((b) => ({
      ...b,
      reactivation: b.reactivation.slice(0, reactivationLimit),
    }))
  }

  if (compareMonths && compareQuarter0021) {
    const quarterMonths = comparisonMonthSet(
      selectedMonth,
      selectedQuarter0021,
      compareQuarter0021
    )
    revenue_blocks = revenue_blocks.map((block) => ({
      ...block,
      quarters: aggregateQuarterRevenue(block.months.filter((m) => quarterMonths.has(m.month))),
    }))
  }

  const selectedRevenue =
    !want0021
      ? []
      : compareMonths && compareQuarter0021
      ? revenue_blocks.map((b) => {
          const [, newer] = orderQuarters(selectedQuarter0021, compareQuarter0021)
          const row = b.quarters.find((q) => q.quarter === newer)
          return row ?? { revenue: 0, ticket_avg: 0, attended: 0 }
        })
      : revenue_blocks.map((b) => {
          const row = b.months.find((m) => m.month === selectedMonth)
          return row ?? { revenue: 0, ticket_avg: 0, attended: 0 }
        })
  const totalRev = selectedRevenue.reduce((s, r) => s + r.revenue, 0)
  const totalAtt = selectedRevenue.reduce((s, r) => s + r.attended, 0)
  // want0021 com revenue_blocks vazio (timeout/erro) → null, não 0 do reduce vazio.
  const hasRevenueData = want0021 && revenue_blocks.length > 0

  const returnRates = return_blocks
    .map((b) => {
      const q = b.quarters.find((x) => x.quarter === selectedQuarter)
      return q?.return_rate ?? null
    })
    .filter((x): x is number => x != null)

  const draft: DirectorReport = {
    generated_at: new Date().toISOString(),
    period: {
      selected_month: selectedMonth,
      compare_months: compareMonths && Boolean(compareQuarter0021),
      selected_quarter_0021: selectedQuarter0021,
      compare_quarter_0021: compareQuarter0021,
      selected_quarter: selectedQuarter,
      compare_quarter: compareQuarter,
      label: '',
      label_0011: '',
      label_0021: '',
      reference_date: '',
    },
    source,
    return_source: returnSource,
    avec_reports: { return: '0011', revenue: '0021' },
    schedule_note:
      professionals.length === 0
        ? '⚠ Nenhum profissional cadastrado no roster desta unidade — relatório sai vazio (sem envio útil).'
        : source === 'avec'
          ? `Envio em 2 etapas (terças 08:00 SP): 0011/0021 live Avec${liveNote ? ` · ${liveNote}` : ''}`
          : source === 'partial'
            ? `Dados parciais Avec (etapa faltante vazia, sem fixture)${liveNote ? ` · ${liveNote}` : ''}`
            : `Sem dados Avec — relatório vazio (sem fixture)${liveNote ? ` · ${liveNote}` : ''}`,
    return_blocks,
    revenue_blocks,
    summary: {
      professionals: professionals.length,
      avg_return_rate:
        returnRates.length > 0
          ? returnRates.reduce((a, b) => a + b, 0) / returnRates.length
          : null,
      total_revenue_selected_month: hasRevenueData ? totalRev : null,
      avg_ticket_selected_month:
        hasRevenueData && totalAtt > 0 ? Math.round(totalRev / totalAtt) : null,
    },
  }

  draft.period.reference_date = reportReferenceDate(draft)
  draft.period.label_0011 = label0011(draft)
  draft.period.label_0021 = label0021(draft)
  draft.period.label = reportPeriodLabel(draft)

  return draft
}
