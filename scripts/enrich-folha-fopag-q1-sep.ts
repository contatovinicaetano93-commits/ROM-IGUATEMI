/**
 * One-shot: apply Fopag xlsx extras (DARF/DAS/mensalidade/U·V·W…) onto Folha Q1.
 *
 * Usage:
 *   NODE_OPTIONS='-r ./scripts/mock-server-only.cjs' \
 *   DATABASE_URL=... ROM_PANEL=brasil \
 *   FOPAG_XLSX=/path/to/Fopag.xlsx \
 *   npx tsx scripts/enrich-folha-fopag-q1-sep.ts
 *
 * Optional:
 *   PERIOD_ID=2026-09-q1 SHEET_NAME='Base Folha Brasil '
 */
import ExcelJS from 'exceljs'
import { getFolhaPeriod, saveFolhaPeriodLines } from '../src/lib/folha/store'
import { patchFolhaLineExtras } from '../src/lib/folha/workflow'
import { occupancyMergeKey } from '../src/lib/director-report/match-pro'
import type { FolhaDraftLine } from '../src/lib/folha/draft-from-8123'
import type { RomPanelId } from '../src/lib/brand'

type ExtrasPatch = Partial<FolhaDraftLine['folha_extras']>

function numOrNull(v: unknown): number | null {
  if (v == null || v === '') return null
  if (typeof v === 'object' && v && 'result' in v) {
    return numOrNull((v as { result: unknown }).result)
  }
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return null
    return Math.abs(v) < 1e-9 ? null : Math.round(v * 100) / 100
  }
  if (typeof v === 'string') {
    const t = v.trim().replace(/\./g, '').replace(',', '.')
    if (!t) return null
    const n = Number(t)
    if (!Number.isFinite(n) || Math.abs(n) < 1e-9) return null
    return Math.round(n * 100) / 100
  }
  return null
}

function cellText(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'string') return v.trim()
  if (typeof v === 'number') return String(v)
  if (typeof v === 'object' && v && 'text' in v) {
    return String((v as { text: unknown }).text ?? '').trim()
  }
  if (typeof v === 'object' && v && 'result' in v) {
    return cellText((v as { result: unknown }).result)
  }
  return String(v).trim()
}

function headerMap(row: ExcelJS.Row): Map<string, number> {
  const map = new Map<string, number>()
  row.eachCell({ includeEmpty: false }, (cell, col) => {
    const key = cellText(cell.value)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim()
    if (key) map.set(key, col)
  })
  return map
}

function col(headers: Map<string, number>, ...aliases: string[]): number | null {
  for (const a of aliases) {
    const k = a
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim()
    const found = headers.get(k)
    if (found != null) return found
  }
  // prefix match
  for (const [h, c] of headers) {
    for (const a of aliases) {
      const k = a
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim()
      if (h.startsWith(k)) return c
    }
  }
  return null
}

function extrasFromRow(
  row: ExcelJS.Row,
  headers: Map<string, number>,
): { name: string; extras: ExtrasPatch } | null {
  const nameCol = col(headers, 'profissional')
  if (nameCol == null) return null
  const name = cellText(row.getCell(nameCol).value)
  if (!name) return null

  const get = (...aliases: string[]) => {
    const c = col(headers, ...aliases)
    if (c == null) return null
    return numOrNull(row.getCell(c).value)
  }

  const parc = get('parc')
  const darf = get('darf')
  const das = get('das')
  const divAtiva = get('div ativa')
  const mensalidade = get('mensalidade contabilidade')
  const consumoBaru = get('consumo baru')
  const descontosW = get('descontos diversos')
  const servicosU = get('servicos 30%', 'serviços 30%')
  const valorV = get('valor a pagar profissional')
  const taxaW = get('taxa 3%', 'taxa 4%', 'taxa')

  let descontos: number | null = null
  const parts = [consumoBaru, descontosW].filter((x): x is number => x != null)
  if (parts.length) {
    descontos = Math.round(parts.reduce((a, b) => a + b, 0) * 100) / 100
  }

  const extras: ExtrasPatch = {}
  if (parc != null) extras.parc = parc
  if (darf != null) extras.darf = darf
  if (das != null) extras.das = das
  if (divAtiva != null) extras.div_ativa = divAtiva
  if (mensalidade != null) extras.mensalidade_contabilidade = mensalidade
  if (descontos != null) extras.descontos_diversos = descontos
  if (servicosU != null) extras.servicos_assistente_como_pro = servicosU
  if (valorV != null) extras.valor_a_pagar_profissional = valorV
  if (taxaW != null) extras.taxa_servicos = taxaW

  if (Object.keys(extras).length === 0) return { name, extras: {} }
  return { name, extras }
}

async function loadFopagRows(
  xlsxPath: string,
  sheetName: string,
): Promise<{ name: string; extras: ExtrasPatch }[]> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(xlsxPath)
  const sheet =
    wb.getWorksheet(sheetName) ||
    wb.worksheets.find(
      (s) => s.name.trim().toLowerCase() === sheetName.trim().toLowerCase(),
    )
  if (!sheet) {
    const names = wb.worksheets.map((s) => s.name)
    throw new Error(`Sheet not found: ${sheetName}. Have: ${names.join(' | ')}`)
  }
  const headers = headerMap(sheet.getRow(1))
  const out: { name: string; extras: ExtrasPatch }[] = []
  for (let r = 2; r <= sheet.rowCount; r++) {
    const parsed = extrasFromRow(sheet.getRow(r), headers)
    if (parsed) out.push(parsed)
  }
  return out
}

function findLineIndex(lines: FolhaDraftLine[], name: string): number {
  const key = occupancyMergeKey(name)
  const exact = lines.findIndex((l) => l.name === name)
  if (exact >= 0) return exact
  if (key) {
    const byKey = lines.findIndex((l) => occupancyMergeKey(l.name) === key)
    if (byKey >= 0) return byKey
  }
  // first+last token fallback
  const tokens = key.split(/\s+/).filter(Boolean)
  if (tokens.length >= 2) {
    const fl = `${tokens[0]} ${tokens[tokens.length - 1]}`
    return lines.findIndex((l) => {
      const lk = occupancyMergeKey(l.name)
      const lt = lk.split(/\s+/).filter(Boolean)
      if (lt.length < 2) return false
      return `${lt[0]} ${lt[lt.length - 1]}` === fl
    })
  }
  return -1
}

function sumProposed(lines: FolhaDraftLine[]): number | null {
  let total: number | null = null
  for (const l of lines) {
    if (l.proposed_pay == null) continue
    total = (total ?? 0) + l.proposed_pay
  }
  return total == null ? null : Math.round(total * 100) / 100
}

async function main() {
  const panel = ((process.env.ROM_PANEL || 'brasil').trim().toLowerCase() ===
  'iguatemi'
    ? 'iguatemi'
    : 'brasil') as RomPanelId
  const periodId = (process.env.PERIOD_ID || '2026-09-q1').trim()
  const xlsxPath = (process.env.FOPAG_XLSX || '').trim()
  if (!xlsxPath) throw new Error('FOPAG_XLSX required')
  if (!process.env.DATABASE_URL?.trim()) throw new Error('DATABASE_URL required')

  const defaultSheet =
    panel === 'iguatemi' ? 'Base Folha Iguatemi ' : 'Base Folha Brasil '
  const sheetName = (process.env.SHEET_NAME || defaultSheet).trim()

  const fopagRows = await loadFopagRows(xlsxPath, sheetName)
  const withExtras = fopagRows.filter((r) => Object.keys(r.extras).length > 0)

  const period = await getFolhaPeriod(periodId)
  if (!period) throw new Error(`folha_periods ${periodId} not found`)

  let lines = period.lines.map((l) => ({ ...l, folha_extras: { ...l.folha_extras } }))
  let matched = 0
  let unmatched: string[] = []
  let patchedFields = 0

  for (const row of withExtras) {
    const idx = findLineIndex(lines, row.name)
    if (idx < 0) {
      unmatched.push(row.name)
      continue
    }
    matched += 1
    patchedFields += Object.keys(row.extras).length
    const source =
      period.source_professionals.find(
        (p) =>
          p.name === lines[idx]!.name ||
          occupancyMergeKey(p.name) === occupancyMergeKey(lines[idx]!.name),
      ) ?? null
    lines[idx] = patchFolhaLineExtras({
      panel,
      line: lines[idx]!,
      source,
      extras: row.extras,
    })
  }

  const total = sumProposed(lines)
  const saved = await saveFolhaPeriodLines({
    id: periodId,
    lines,
    totalProposedPay: total,
    updatedBy: 'enrich-folha-fopag-q1-sep',
  })

  const samplePatched = lines
    .filter(
      (l) =>
        l.folha_extras.darf != null ||
        l.folha_extras.das != null ||
        l.folha_extras.servicos_assistente_como_pro != null ||
        l.folha_extras.mensalidade_contabilidade != null,
    )
    .slice(0, 5)
    .map((l) => ({
      name: l.name.split(/\s+/)[0],
      darf: l.folha_extras.darf,
      das: l.folha_extras.das,
      mensalidade: l.folha_extras.mensalidade_contabilidade,
      U: l.folha_extras.servicos_assistente_como_pro,
      V: l.folha_extras.valor_a_pagar_profissional,
      W: l.folha_extras.taxa_servicos,
      proposed_pay: l.proposed_pay,
    }))

  console.log(
    JSON.stringify(
      {
        panel,
        period_id: periodId,
        sheet: sheetName,
        fopag_rows: fopagRows.length,
        fopag_with_extras: withExtras.length,
        folha_lines: lines.length,
        matched,
        unmatched_count: unmatched.length,
        unmatched_sample: unmatched.slice(0, 10).map((n) => n.split(/\s+/)[0]),
        patched_field_assignments: patchedFields,
        total_proposed_pay_before: period.total_proposed_pay,
        total_proposed_pay_after: saved?.total_proposed_pay ?? total,
        sample_patched: samplePatched,
      },
      null,
      2,
    ),
  )
}

main().catch((e) => {
  console.error('FATAL', e instanceof Error ? e.message : String(e))
  process.exit(1)
})
