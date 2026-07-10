import { isAvecConfigured, isAvecMock } from '@/lib/avec/client'
import { fetchLiveDirectorBlocks } from './avec-live'
import {
  buildMockReturnBlocks,
  buildMockRevenueBlocks,
  defaultCompareMonth,
  defaultCompareQuarter,
  defaultSelectedMonth,
  defaultSelectedQuarter,
} from './mock'
import { label0011, label0021, reportPeriodLabel, reportReferenceDate } from './period'
import { listDirectorProfessionals } from './professionals'
import type { DirectorReport, MonthKey, QuarterKey } from './types'

export interface BuildDirectorReportOptions {
  selectedMonth?: MonthKey
  compareMonth?: MonthKey | null
  /** false = 0021 só o mês selecionado (sem Δ) */
  compareMonths?: boolean
  selectedQuarter?: QuarterKey
  compareQuarter?: QuarterKey
  professionalId?: string
  forceMock?: boolean
}

export async function buildDirectorReport(
  opts: BuildDirectorReportOptions = {}
): Promise<DirectorReport> {
  const selectedMonth = opts.selectedMonth ?? defaultSelectedMonth()
  const compareMonths = opts.compareMonths !== false
  const compareMonth = compareMonths
    ? (opts.compareMonth ?? defaultCompareMonth())
    : null
  const selectedQuarter = opts.selectedQuarter ?? defaultSelectedQuarter()
  const compareQuarter = opts.compareQuarter ?? defaultCompareQuarter()

  let professionals = listDirectorProfessionals(true)
  if (opts.professionalId) {
    professionals = professionals.filter((p) => p.id === opts.professionalId)
  }

  const avecReady = isAvecConfigured() && !isAvecMock() && !opts.forceMock
  let source: 'mock' | 'avec' = 'mock'
  let return_blocks = buildMockReturnBlocks(professionals, selectedQuarter, compareQuarter)
  let revenue_blocks = buildMockRevenueBlocks(professionals, selectedMonth)
  let liveNote: string | null = null

  if (avecReady) {
    try {
      const live = await fetchLiveDirectorBlocks(
        professionals,
        selectedMonth,
        compareMonth,
        selectedQuarter,
        compareQuarter,
      )
      return_blocks = live.return_blocks
      revenue_blocks = live.revenue_blocks
      source = 'avec'
      if (live.warnings.length) {
        liveNote = live.warnings.slice(0, 3).join(' · ')
      }
    } catch (e) {
      liveNote = `Avec live falhou — usando fixture: ${e instanceof Error ? e.message : String(e)}`
      console.warn('[director-report]', liveNote)
    }
  }

  const selectedRevenue = revenue_blocks.map((b) => {
    const row = b.months.find((m) => m.month === selectedMonth)
    return row ?? { revenue: 0, ticket_avg: 0, attended: 0 }
  })
  const totalRev = selectedRevenue.reduce((s, r) => s + r.revenue, 0)
  const totalAtt = selectedRevenue.reduce((s, r) => s + r.attended, 0)

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
      compare_month: compareMonth,
      compare_months: compareMonths && Boolean(compareMonth),
      selected_quarter: selectedQuarter,
      compare_quarter: compareQuarter,
      label: '',
      label_0011: '',
      label_0021: '',
      reference_date: '',
    },
    source,
    avec_reports: { return: '0011', revenue: '0021' },
    schedule_note:
      source === 'avec'
        ? `Envio em 2 etapas (terças 08:00 SP): 0011/0021 live Avec${liveNote ? ` · ${liveNote}` : ''}`
        : avecReady
          ? `Envio em 2 etapas (terças 08:00 SP): 0011/0021 · fallback fixture${liveNote ? ` · ${liveNote}` : ''}`
          : 'Envio em 2 etapas (terças 08:00 SP): 0011 trimestre vs trimestre · 0021 mês (ou mês vs mês) · dados mock',
    return_blocks,
    revenue_blocks,
    summary: {
      professionals: professionals.length,
      avg_return_rate:
        returnRates.length > 0
          ? returnRates.reduce((a, b) => a + b, 0) / returnRates.length
          : null,
      total_revenue_selected_month: totalRev,
      avg_ticket_selected_month: totalAtt > 0 ? Math.round(totalRev / totalAtt) : null,
    },
  }

  draft.period.reference_date = reportReferenceDate(draft)
  draft.period.label_0011 = label0011(draft)
  draft.period.label_0021 = label0021(draft)
  draft.period.label = reportPeriodLabel(draft)

  return draft
}
