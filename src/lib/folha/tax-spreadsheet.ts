/**
 * Planilha manual de impostos/contabilidade da Folha (Q1).
 * Colunas flexíveis: Profissional/Nome (+ CNPJ opcional) + DARF + DAS + Mensalidade.
 */

import ExcelJS from 'exceljs'
import { isFolhaTaxPlaceholder } from '@/lib/folha/draft-from-8123'
import { normalizeCnpjDigits } from '@/lib/folha/tax-cnpj'

export type FolhaTaxSpreadsheetRow = {
  /** Nome como veio na planilha. */
  professionalName: string | null
  cnpj: string | null
  darf: number | null
  das: number | null
  mensalidade_contabilidade: number | null
  /** Linha 1-based na planilha (para relatório). */
  sheetRow: number
}

export type FolhaTaxSpreadsheetParseResult = {
  rows: FolhaTaxSpreadsheetRow[]
  headers: string[]
  /** Colunas reconhecidas (debug/UI). */
  mapped: {
    name: string | null
    cnpj: string | null
    darf: string | null
    das: string | null
    mensalidade: string | null
  }
}

function normHeader(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9%]+/g, ' ')
    .trim()
}

function classifyHeader(
  h: string,
): 'name' | 'cnpj' | 'darf' | 'das' | 'mensalidade' | null {
  if (!h) return null
  if (
    h === 'profissional' ||
    h === 'nome' ||
    h === 'name' ||
    h === 'colaborador' ||
    h.startsWith('nome do')
  ) {
    return 'name'
  }
  if (h === 'cnpj' || h.includes('cnpj')) return 'cnpj'
  if (h === 'darf' || h.includes('darf') || h.includes('gps')) return 'darf'
  if (h === 'das' || h.includes('simples nacional') || h === 'guia das') {
    return 'das'
  }
  if (
    h === 'mensalidade' ||
    h.includes('mensalidade') ||
    h === 'contabilidade' ||
    h.includes('contabilidade') ||
    h === 'mensal'
  ) {
    return 'mensalidade'
  }
  return null
}

/** Aceita 1234,56 / 1.234,56 / 1234.56. */
export function parseFolhaTaxSpreadsheetAmount(
  value: unknown,
): number | null {
  if (value == null || value === '') return null
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null
    return Math.round(value * 100) / 100
  }
  let s = String(value).trim()
  if (!s) return null
  s = s.replace(/r\$\s*/i, '').replace(/\s/g, '')
  if (/^\d{1,3}(\.\d{3})+,\d{1,2}$/.test(s) || /^\d+,\d{1,2}$/.test(s)) {
    s = s.replace(/\./g, '').replace(',', '.')
  } else if (/^\d{1,3}(,\d{3})+\.\d{1,2}$/.test(s)) {
    s = s.replace(/,/g, '')
  } else if (s.includes(',') && !s.includes('.')) {
    s = s.replace(',', '.')
  }
  const n = Number(s)
  if (!Number.isFinite(n)) return null
  return Math.round(n * 100) / 100
}

function sanitizeTaxAmount(value: number | null): number | null {
  if (value == null) return null
  if (value <= 0) return null
  if (isFolhaTaxPlaceholder(value)) return null
  return value
}

/**
 * Lê .xlsx/.xlsm (primeira aba com cabeçalho).
 * Exige coluna de nome (ou CNPJ) e ao menos uma de DARF/DAS/mensalidade.
 */
function cellToString(value: ExcelJS.CellValue): string | null {
  if (value == null || value === '') return null
  if (typeof value === 'string' || typeof value === 'number') {
    const s = String(value).trim()
    return s || null
  }
  if (typeof value === 'object' && value && 'text' in value) {
    const s = String((value as { text: unknown }).text ?? '').trim()
    return s || null
  }
  if (typeof value === 'object' && value && 'result' in value) {
    const s = String((value as { result: unknown }).result ?? '').trim()
    return s || null
  }
  const s = String(value).trim()
  return s || null
}

export async function parseFolhaTaxSpreadsheet(
  buffer: ArrayBuffer | Buffer | Uint8Array,
): Promise<FolhaTaxSpreadsheetParseResult> {
  const wb = new ExcelJS.Workbook()
  // ExcelJS tipa `load` com Buffer próprio (≠ Node Buffer); Uint8Array cobre os três inputs.
  const bytes =
    buffer instanceof ArrayBuffer
      ? new Uint8Array(buffer)
      : buffer instanceof Uint8Array
        ? buffer
        : new Uint8Array(buffer)
  // exceljs declara Buffer próprio ≠ Node Buffer — never evita o choque de tipos.
  await wb.xlsx.load(bytes as never)
  const ws = wb.worksheets[0]
  if (!ws) {
    throw new Error('Planilha vazia — nenhuma aba encontrada')
  }

  const headerRow = ws.getRow(1)
  const headers: string[] = []
  const colByKind: Partial<
    Record<'name' | 'cnpj' | 'darf' | 'das' | 'mensalidade', number>
  > = {}
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const raw = cell.text?.trim() || String(cell.value ?? '').trim()
    headers[colNumber - 1] = raw
    const kind = classifyHeader(normHeader(raw))
    if (kind && colByKind[kind] == null) colByKind[kind] = colNumber
  })

  if (colByKind.name == null && colByKind.cnpj == null) {
    throw new Error(
      'Cabeçalho sem coluna Profissional/Nome (ou CNPJ). Use: Profissional | DARF | DAS | Mensalidade',
    )
  }
  if (
    colByKind.darf == null &&
    colByKind.das == null &&
    colByKind.mensalidade == null
  ) {
    throw new Error(
      'Cabeçalho sem colunas DARF, DAS ou Mensalidade. Use: Profissional | DARF | DAS | Mensalidade',
    )
  }

  const rows: FolhaTaxSpreadsheetRow[] = []
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return
    const cell = (col: number | undefined) =>
      col == null ? null : row.getCell(col).value

    const professionalName = cellToString(cell(colByKind.name))
    const cnpj = normalizeCnpjDigits(cellToString(cell(colByKind.cnpj)))

    const darf = sanitizeTaxAmount(
      parseFolhaTaxSpreadsheetAmount(cell(colByKind.darf)),
    )
    const das = sanitizeTaxAmount(
      parseFolhaTaxSpreadsheetAmount(cell(colByKind.das)),
    )
    const mensalidade_contabilidade = sanitizeTaxAmount(
      parseFolhaTaxSpreadsheetAmount(cell(colByKind.mensalidade)),
    )

    if (
      !professionalName &&
      !cnpj &&
      darf == null &&
      das == null &&
      mensalidade_contabilidade == null
    ) {
      return
    }
    if (darf == null && das == null && mensalidade_contabilidade == null) {
      return
    }

    rows.push({
      professionalName,
      cnpj,
      darf,
      das,
      mensalidade_contabilidade,
      sheetRow: rowNumber,
    })
  })

  return {
    rows,
    headers: headers.filter((h) => h != null && h !== ''),
    mapped: {
      name:
        colByKind.name != null ? headers[colByKind.name - 1] ?? null : null,
      cnpj:
        colByKind.cnpj != null ? headers[colByKind.cnpj - 1] ?? null : null,
      darf:
        colByKind.darf != null ? headers[colByKind.darf - 1] ?? null : null,
      das: colByKind.das != null ? headers[colByKind.das - 1] ?? null : null,
      mensalidade:
        colByKind.mensalidade != null
          ? headers[colByKind.mensalidade - 1] ?? null
          : null,
    },
  }
}

/** Modelo vazio para a equipe preencher. */
export async function buildFolhaTaxSpreadsheetTemplate(): Promise<{
  buffer: Buffer
  filename: string
}> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Impostos')
  ws.addRow(['Profissional', 'CNPJ', 'DARF', 'DAS', 'Mensalidade'])
  ws.getRow(1).font = { bold: true }
  ws.columns = [
    { width: 36 },
    { width: 20 },
    { width: 12 },
    { width: 12 },
    { width: 14 },
  ]
  const arrBuf = await wb.xlsx.writeBuffer()
  return {
    buffer: Buffer.from(arrBuf),
    filename: 'folha-impostos-modelo.xlsx',
  }
}
