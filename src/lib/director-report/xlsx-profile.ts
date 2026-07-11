import ExcelJS from 'exceljs'
import { getBrand } from '@/lib/brand'
import { isAvecConfigured, isAvecMock } from '@/lib/avec/client'
import { fetchProfessionalProfileMonths } from './avec-live'
import { buildMockRevenueBlocks, defaultSelectedMonth } from './mock'
import { aggregateQuarterRevenue, labelQuarter, monthsInQuarter, quarterOfMonth } from './period'
import { listDirectorProfessionals } from './professionals'
import type { MonthRevenueRow, QuarterKey } from './types'

const MONTH_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

function yearOf(month: string) {
  return Number(month.split('-')[0])
}

function monthIndexOf(month: string) {
  return Number(month.split('-')[1]) - 1
}

function groupByYear(months: MonthRevenueRow[]) {
  const byYear = new Map<number, MonthRevenueRow[]>()
  for (const m of months) {
    const y = yearOf(m.month)
    const arr = byYear.get(y) ?? []
    arr.push(m)
    byYear.set(y, arr)
  }
  return Array.from(byYear.entries()).sort((a, b) => a[0] - b[0])
}

export interface ProfessionalProfileResult {
  buffer: Buffer
  filename: string
  professionalName: string
  source: 'mock' | 'avec'
}

/**
 * Perfil individual (022/0021) — série mensal completa por ano + variação de
 * faturamento trimestre a trimestre, no mesmo formato da planilha "um a um"
 * já usada manualmente para acompanhar cada profissional.
 */
export async function buildProfessionalProfileWorkbook(
  professionalId: string,
  opts: { forceMock?: boolean } = {}
): Promise<ProfessionalProfileResult> {
  const professionals = listDirectorProfessionals(true)
  const professional = professionals.find((p) => p.id === professionalId)
  if (!professional) {
    throw new Error('Profissional não encontrado')
  }

  const selectedMonth = defaultSelectedMonth()
  const avecReady = isAvecConfigured() && !isAvecMock() && !opts.forceMock

  let months: MonthRevenueRow[]
  let source: 'mock' | 'avec' = 'mock'
  if (avecReady) {
    try {
      months = await fetchProfessionalProfileMonths(professional, selectedMonth)
      source = 'avec'
    } catch {
      months = buildMockRevenueBlocks([professional], selectedMonth)[0]!.months
    }
  } else {
    months = buildMockRevenueBlocks([professional], selectedMonth)[0]!.months
  }

  const quarters = aggregateQuarterRevenue(months)
  const currentQuarter = quarterOfMonth(selectedMonth)

  /** Fat. dos primeiros `n` meses de um trimestre — usado pra comparar o trimestre corrente (parcial) de forma justa. */
  function truncatedQuarterRevenue(quarter: QuarterKey, n: number): number {
    const wanted = new Set(monthsInQuarter(quarter).slice(0, n))
    return months.filter((m) => wanted.has(m.month)).reduce((s, r) => s + r.revenue, 0)
  }

  const wb = new ExcelJS.Workbook()
  wb.creator = getBrand().displayName
  wb.created = new Date()
  const ws = wb.addWorksheet('resumo')

  ws.getColumn(1).width = 18
  for (let c = 2; c <= 14; c++) ws.getColumn(c).width = 12

  const titleRow = ws.addRow([`${getBrand().displayName} · Relatório 022 (0021) — Perfil individual`])
  titleRow.font = { bold: true, size: 13 }
  ws.mergeCells(1, 1, 1, 12)

  const nameRow = ws.addRow([professional.name])
  nameRow.font = { bold: true, size: 12, color: { argb: 'FFB8860B' } }

  if (source === 'mock') {
    const warnRow = ws.addRow([
      'DADOS DE DEMONSTRAÇÃO (mock) — não usar para decisão financeira até o mapper Avec 0021 estar ativo.',
    ])
    warnRow.font = { bold: true, italic: true, color: { argb: 'FF8A4B00' } }
    warnRow.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF4E5' } }
    })
    ws.mergeCells(warnRow.number, 1, warnRow.number, 12)
  }

  ws.addRow([])

  const header = ws.addRow(['Ano', ...MONTH_PT, 'Média'])
  header.font = { bold: true }
  header.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F3F3' } }
  })

  for (const [year, rows] of groupByYear(months)) {
    const byMonthIdx = new Map(rows.map((r) => [monthIndexOf(r.month), r]))
    const revenueCells: (number | string)[] = []
    const ticketCells: (number | string)[] = []
    let revSum = 0
    let ticketSum = 0
    let count = 0
    for (let i = 0; i < 12; i++) {
      const row = byMonthIdx.get(i)
      if (row) {
        revenueCells.push(row.revenue)
        ticketCells.push(row.ticket_avg)
        revSum += row.revenue
        ticketSum += row.ticket_avg
        count += 1
      } else {
        revenueCells.push('')
        ticketCells.push('')
      }
    }
    const revAvg = count > 0 ? Math.round(revSum / count) : ''
    const ticketAvg = count > 0 ? Math.round(ticketSum / count) : ''
    ws.addRow([year, ...revenueCells, revAvg])
    const ticketRow = ws.addRow(['Ticket médio', ...ticketCells, ticketAvg])
    ticketRow.font = { italic: true, color: { argb: 'FF666666' } }
  }

  ws.addRow([])

  if (quarters.length > 1) {
    const labels: string[] = ['Trimestre']
    const values: (number | string)[] = ['Variação Fat %']
    for (let i = 1; i < quarters.length; i++) {
      const prev = quarters[i - 1]!
      const cur = quarters[i]!
      labels.push(`${labelQuarter(prev.quarter)} → ${labelQuarter(cur.quarter)}`)
      // Trimestre corrente ainda em andamento: compara só os meses já decorridos
      // dos dois lados, senão o trimestre parcial parece uma queda de faturamento falsa.
      const elapsedInCur = months.filter((m) => quarterOfMonth(m.month) === cur.quarter).length
      const prevRevenue =
        cur.quarter === currentQuarter && elapsedInCur < 3
          ? truncatedQuarterRevenue(prev.quarter, elapsedInCur)
          : prev.revenue
      values.push(
        prevRevenue > 0
          ? Math.round(((cur.revenue - prevRevenue) / prevRevenue) * 1000) / 10
          : ''
      )
    }
    const labelRow = ws.addRow(labels)
    labelRow.font = { bold: true }
    ws.addRow(values)
  }

  const arrBuf = await wb.xlsx.writeBuffer()
  const safeName = professional.name.replace(/[^a-zA-Z0-9]+/g, '-')
  return {
    buffer: Buffer.from(arrBuf),
    filename: `0021-perfil-${safeName}.xlsx`,
    professionalName: professional.name,
    source,
  }
}
