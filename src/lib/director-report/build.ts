import { isAvecConfigured, isAvecMock } from '@/lib/avec/client'
import {
  buildMockReturnBlocks,
  buildMockRevenueBlocks,
  defaultCompareQuarter,
  defaultSelectedMonth,
  defaultSelectedQuarter,
} from './mock'
import { listDirectorProfessionals } from './professionals'
import type { DirectorReport, MonthKey, QuarterKey } from './types'

export interface BuildDirectorReportOptions {
  selectedMonth?: MonthKey
  selectedQuarter?: QuarterKey
  compareQuarter?: QuarterKey
  professionalId?: string
  /** Força mock mesmo com token (preview). */
  forceMock?: boolean
}

export async function buildDirectorReport(
  opts: BuildDirectorReportOptions = {}
): Promise<DirectorReport> {
  const selectedMonth = opts.selectedMonth ?? defaultSelectedMonth()
  const selectedQuarter = opts.selectedQuarter ?? defaultSelectedQuarter()
  const compareQuarter = opts.compareQuarter ?? defaultCompareQuarter()

  let professionals = listDirectorProfessionals(true)
  if (opts.professionalId) {
    professionals = professionals.filter((p) => p.id === opts.professionalId)
  }

  // Avec real entra quando token + parsers 0011/0021 estiverem validados.
  // Até lá (e sem token), entrega mock fiel à planilha Vitor + equipe portfólio.
  const useMock = opts.forceMock || !isAvecConfigured() || isAvecMock()

  const return_blocks = buildMockReturnBlocks(professionals, selectedQuarter, compareQuarter)
  const revenue_blocks = buildMockRevenueBlocks(professionals, selectedMonth)

  const selectedRevenue = revenue_blocks.map((b) => {
    const row = b.months.find((m) => m.month === selectedMonth)
    return row ?? { revenue: 0, ticket_avg: 0, attended: 0 }
  })
  const totalRev = selectedRevenue.reduce((s, r) => s + r.revenue, 0)
  const totalAtt = selectedRevenue.reduce((s, r) => s + r.attended, 0)

  const returnRates = return_blocks.map((b) => {
    const q = b.quarters.find((x) => x.quarter === selectedQuarter)
    return q?.return_rate ?? null
  }).filter((x): x is number => x != null)

  return {
    generated_at: new Date().toISOString(),
    source: useMock ? 'mock' : 'mock', // 'avec' quando sync real estiver ligado
    avec_reports: { return: '0011', revenue: '0021' },
    schedule_note: 'Envio automático: terças 08:00 (America/Sao_Paulo) — só admin operacional',
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
}
