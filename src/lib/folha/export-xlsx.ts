/**
 * Export Excel da Folha (olerite da quinzena) — espelha as colunas Maykon da UI.
 */

import ExcelJS from 'exceljs'
import { getBrand, type RomPanelId } from '@/lib/brand'
import type { FolhaDraft, FolhaDraftLine } from '@/lib/folha/draft-from-8123'

export type FolhaExportResult = {
  buffer: Buffer
  filename: string
}

/** Magnitude Avec (8123 negativo) → número positivo para planilha; null permanece null. */
export function exportMagnitude(value: number | null | undefined): number | null {
  if (value == null || Number.isNaN(value)) return null
  return Math.abs(value)
}

export const FOLHA_EXPORT_HEADERS = [
  'Profissional',
  'Cargo',
  'Faturado',
  'Taxa cartão',
  'Rateio após cartão',
  'Produto',
  'Taxa adm',
  'Assistente',
  'Meio a meio',
  'Meio a meio %',
  'Outros (olerite)',
  'a_pagar 8123',
  'DARF',
  'DAS',
  'Mensalidade',
  'U (serv. assist. como pro)',
  'V (valor a pagar pro)',
  'W (taxa serviços)',
  'Taxa adm assistente',
  'Esteticista bônus',
  'Acumulado mês Romeu',
  'Parcela Romeu',
  'Líquido a pagar',
  'Exceção',
  'Alertas',
] as const

const MONEY_COLS = new Set([
  3, 4, 5, 6, 7, 8, 9, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23,
])

export function folhaLineToExportRow(line: FolhaDraftLine): (string | number | null)[] {
  const x = line.folha_extras
  return [
    line.name,
    line.cargo_raw ?? line.cargo,
    line.avec.charged,
    exportMagnitude(line.avec.card_fee),
    line.rateio_apos_cartao,
    exportMagnitude(line.avec.product_spend),
    line.taxa_administrativa ?? exportMagnitude(line.avec.admin_fee),
    exportMagnitude(line.avec.assistant_discount),
    line.meio_a_meio,
    line.meio_a_meio_rate,
    line.outros_descontos,
    line.avec.net_payable,
    x.darf,
    x.das,
    x.mensalidade_contabilidade,
    x.servicos_assistente_como_pro,
    x.valor_a_pagar_profissional,
    x.taxa_servicos,
    x.taxa_adm_assistente,
    x.esteticista_bonus,
    x.acumulado_mes,
    x.romeu_comissao_parcela,
    line.proposed_pay,
    line.exception_id,
    line.flags.length === 0 ? null : line.flags.join(', '),
  ]
}

export function folhaExportFilename(draft: FolhaDraft, panel: RomPanelId): string {
  const unit = panel === 'iguatemi' ? 'iguatemi' : 'brasil'
  return `folha-${unit}-${draft.quinzena.id}.xlsx`
}

/**
 * Monta workbook ExcelJS do rascunho da Folha.
 * `onlyWithPay` (default false) filtra quem não tem líquido.
 */
export async function buildFolhaWorkbook(
  draft: FolhaDraft,
  opts?: { onlyWithPay?: boolean; panel?: RomPanelId },
): Promise<FolhaExportResult> {
  const panel = opts?.panel ?? draft.panel
  const brand = getBrand(panel)
  const lines = opts?.onlyWithPay
    ? draft.lines.filter((l) => l.proposed_pay != null)
    : draft.lines

  const wb = new ExcelJS.Workbook()
  wb.creator = brand.displayName
  wb.created = new Date()
  wb.title = `Folha ${draft.quinzena.label}`

  const ws = wb.addWorksheet('Olerite')
  for (let c = 1; c <= FOLHA_EXPORT_HEADERS.length; c++) {
    ws.getColumn(c).width = c === 1 ? 36 : c === FOLHA_EXPORT_HEADERS.length ? 28 : 14
  }

  const title = ws.addRow([
    `${brand.displayName} · Folha PJ · ${draft.quinzena.label} · paga ${draft.quinzena.payDate}`,
  ])
  title.font = { bold: true, size: 13 }
  ws.mergeCells(1, 1, 1, FOLHA_EXPORT_HEADERS.length)

  const meta = ws.addRow([
    `Janela 8123 ${draft.quinzena.from}–${draft.reference_day} · ${lines.length} linhas · Total líquido ${
      draft.total_proposed_pay ?? '—'
    }`,
  ])
  meta.font = { italic: true, size: 10 }
  ws.mergeCells(2, 1, 2, FOLHA_EXPORT_HEADERS.length)

  const header = ws.addRow([...FOLHA_EXPORT_HEADERS])
  header.font = { bold: true }

  for (const line of lines) {
    const row = ws.addRow(folhaLineToExportRow(line))
    for (const col of MONEY_COLS) {
      const cell = row.getCell(col)
      if (typeof cell.value === 'number') cell.numFmt = '#,##0.00'
    }
    const pctCell = row.getCell(9)
    if (typeof pctCell.value === 'number') pctCell.numFmt = '0%'
  }

  const total = ws.addRow([
    'TOTAL',
    ...Array(17).fill(null),
    draft.total_proposed_pay,
    null,
    null,
  ])
  total.getCell(1).font = { bold: true }
  total.getCell(19).font = { bold: true }
  if (typeof total.getCell(19).value === 'number') {
    total.getCell(19).numFmt = '#,##0.00'
  }

  const arrBuf = await wb.xlsx.writeBuffer()
  return {
    buffer: Buffer.from(arrBuf),
    filename: folhaExportFilename(draft, panel),
  }
}
