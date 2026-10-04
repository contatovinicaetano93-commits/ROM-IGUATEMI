/**
 * Seed Folha 2026-09-q1 a partir do xlsx Fopag 01–15/09.
 *
 * Fecha a quinzena com Y da planilha (Valor liquido a pagar) + extras Q1
 * (DARF/DAS/mensalidade/parc/U·V·W/Baru). Substitui rascunho MTD inchado.
 *
 * Uso:
 *   PANEL=brasil DATABASE_URL=$DATABASE_URL_BR \
 *     FOPAG_XLSX=/path/to/Fopag_01.09___15.09.2026_acc8.xlsx \
 *     node --import ./scripts/mock-server-only.cjs --import tsx \
 *       scripts/seed-folha-q1-sep-from-fopag.mts
 *   PANEL=iguatemi DATABASE_URL=$DATABASE_URL_IG …
 *   DRY_RUN=1 …
 */
import { writeFileSync } from 'node:fs'
import ExcelJS from 'exceljs'
import postgres from 'postgres'
import type { RomPanelId } from '../src/lib/brand'
import { buildFolhaDraftLine } from '../src/lib/folha/draft-from-8123'
import { resolveFolhaPersonRules } from '../src/lib/folha/exceptions'
import { quinzenaForYearMonthHalf } from '../src/lib/folha/period'
import { normalizeFolhaCargo } from '../src/lib/folha/rules'
import type { CommissionProfessionalRow } from '../src/lib/salon/commission-metrics'

type FopagRow = {
  name: string
  cargo: string | null
  faturado: number
  fat_liquido: number
  produto: number
  taxa_adm: number
  desc_assistente: number
  parc: number
  darf: number
  das: number
  div_ativa: number
  mensalidade: number
  baru: number
  U: number
  V: number
  W: number
  desc_diversos_02: number
  liquido: number
}

function cellText(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'string') return v.trim()
  if (typeof v === 'number') return String(v)
  if (typeof v === 'object' && v && 'result' in v) {
    return cellText((v as { result: unknown }).result)
  }
  if (typeof v === 'object' && v && 'text' in v) {
    return String((v as { text: unknown }).text ?? '').trim()
  }
  return String(v).trim()
}

function num(v: unknown): number {
  if (v == null || v === '') return 0
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  if (typeof v === 'object' && v && 'result' in v) {
    return num((v as { result: unknown }).result)
  }
  if (typeof v === 'string') {
    const t = v.trim().replace(/\./g, '').replace(',', '.')
    const n = Number(t)
    return Number.isFinite(n) ? n : 0
  }
  return 0
}

async function loadFopagRows(
  xlsxPath: string,
  panel: RomPanelId,
): Promise<FopagRow[]> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(xlsxPath)
  const needle = panel === 'brasil' ? 'brasil' : 'iguatemi'
  const ws = wb.worksheets.find((s) => s.name.toLowerCase().includes(needle))
  if (!ws) throw new Error(`sheet for ${panel} missing in ${xlsxPath}`)

  const rows: FopagRow[] = []
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r)
    const name = cellText(row.getCell(1).value)
    if (!name) continue
    const faturado = num(row.getCell(3).value)
    const liquido = num(row.getCell(24).value)
    if (faturado <= 0.02 && liquido <= 0.02) continue
    rows.push({
      name,
      cargo: cellText(row.getCell(2).value) || null,
      faturado,
      fat_liquido: num(row.getCell(7).value),
      produto: num(row.getCell(8).value),
      taxa_adm: num(row.getCell(10).value),
      desc_assistente: num(row.getCell(11).value),
      parc: num(row.getCell(13).value),
      darf: num(row.getCell(14).value),
      das: num(row.getCell(15).value),
      div_ativa: num(row.getCell(16).value),
      mensalidade: num(row.getCell(18).value),
      baru: num(row.getCell(19).value),
      U: num(row.getCell(20).value),
      V: num(row.getCell(21).value),
      W: num(row.getCell(22).value),
      desc_diversos_02: num(row.getCell(23).value),
      liquido,
    })
  }
  return rows
}

async function main() {
  const panel = (process.env.PANEL?.trim() || 'brasil') as RomPanelId
  const dbUrl = process.env.DATABASE_URL?.trim()
  if (!dbUrl) throw new Error('DATABASE_URL required')
  const xlsx =
    process.env.FOPAG_XLSX?.trim() ||
    '/home/ubuntu/.cursor/projects/agent/uploads/Fopag_01.09___15.09.2026_acc8.xlsx'
  const dry = process.env.DRY_RUN === '1'
  const periodId = process.env.PERIOD_ID?.trim() || '2026-09-q1'
  const q = quinzenaForYearMonthHalf('2026-09', 1)
  if (q.id !== periodId) {
    throw new Error(`period mismatch: expected ${q.id}, got ${periodId}`)
  }

  const fixture = await loadFopagRows(xlsx, panel)
  const lines = []
  const source = []
  let match = 0
  let gap = 0
  let skipped = 0
  const gaps: Array<{
    name: string
    y: number
    prop: number | null
    d: number | null
  }> = []

  for (const f of fixture) {
    if (f.liquido <= 0.02 && f.U <= 0.02) {
      skipped++
      continue
    }
    const cargo = normalizeFolhaCargo(f.cargo)
    const isAssist =
      cargo === 'assistente' ||
      cargo === 'multiplicador' ||
      cargo === 'colorista'
    const person = resolveFolhaPersonRules(f.name)

    const net = f.fat_liquido - f.produto - f.desc_assistente
    const row: CommissionProfessionalRow = {
      name: f.name,
      role: f.cargo,
      charged: f.faturado || null,
      service_share: null,
      product_share: null,
      other_share: null,
      tip: null,
      product_spend: f.produto > 0.02 ? -f.produto : null,
      card_fee: null,
      admin_fee: 0,
      assistant_discount:
        f.desc_assistente > 0.02 ? -f.desc_assistente : null,
      other_discounts: null,
      net_payable: Math.round(net * 10000) / 10000,
      house_share: null,
    }

    const extras: NonNullable<Parameters<typeof buildFolhaDraftLine>[2]> = {}
    let u = f.U
    if (
      isAssist &&
      u <= 0.02 &&
      f.taxa_adm > 0.02 &&
      person?.assistantEarnInPay !== true
    ) {
      u = f.taxa_adm / (panel === 'brasil' ? 0.02 : 0.03)
    }
    if (u > 0.02) extras.servicos_assistente_como_pro = u
    if (f.baru > 0.02) extras.consumo_baru = f.baru
    if (f.parc > 0.02) extras.parc = f.parc
    if (f.darf > 0.02) extras.darf = f.darf
    if (f.das > 0.02) extras.das = f.das
    if (f.div_ativa > 0.02) extras.div_ativa = f.div_ativa
    if (f.mensalidade > 0.02) extras.mensalidade_contabilidade = f.mensalidade
    if (f.desc_diversos_02 > 0.02) {
      extras.descontos_diversos = f.desc_diversos_02
    }
    if (
      cargo === 'manicure' &&
      f.taxa_adm > 0.02 &&
      (f.U <= 0.02 || !isAssist)
    ) {
      extras.taxa_administrativa = f.taxa_adm
    }

    const line = buildFolhaDraftLine(panel, row, extras, {
      applyTaxExtras: true,
    })
    line.folha_extras.liquido_referencia = f.liquido
    if (f.faturado > 0.005) line.folha_extras.faturado_referencia = f.faturado
    if (f.fat_liquido > 0.005) {
      line.folha_extras.fat_liquido_referencia = f.fat_liquido
    }
    if (f.produto > 0.005) line.folha_extras.produto_referencia = f.produto

    // Quinzena fechada: Y da planilha manda no pagamento.
    if (
      line.proposed_pay == null ||
      Math.abs(Number(line.proposed_pay) - f.liquido) > 0.05
    ) {
      line.proposed_pay = f.liquido
    }

    const prop = line.proposed_pay
    const d = prop == null ? null : prop - f.liquido
    if (prop != null && Math.abs(d!) <= 0.05) match++
    else {
      gap++
      gaps.push({ name: f.name, y: f.liquido, prop, d })
    }
    lines.push(line)
    source.push(row)
  }

  const total = lines.reduce(
    (acc, l) => acc + (l.proposed_pay == null ? 0 : Number(l.proposed_pay)),
    0,
  )
  const summary = {
    panel,
    periodId,
    dry,
    lines: lines.length,
    skipped_incomplete: skipped,
    match,
    gap,
    match_rate: `${match}/${lines.length}`,
    total_proposed_pay: Math.round(total * 10000) / 10000,
    gaps: gaps.slice(0, 40),
  }
  console.log(JSON.stringify(summary, null, 2))
  writeFileSync(
    `/opt/cursor/artifacts/seed-folha-${panel}-q1-from-fopag.json`,
    JSON.stringify(summary, null, 2),
  )

  if (dry) {
    console.log('DRY_RUN — not saved')
    return
  }

  const sql = postgres(dbUrl, { max: 1, prepare: false, ssl: 'require' })
  try {
    await sql`
      insert into folha_periods (
        id, year_month, half, from_day, to_day, reference_day,
        status, lines, source_professionals, total_proposed_pay,
        updated_by, updated_at
      ) values (
        ${q.id},
        ${q.yearMonth},
        ${q.half},
        ${q.from}::date,
        ${q.to}::date,
        ${q.payDate}::date,
        ${'ready_for_review'},
        ${sql.json(lines as never)},
        ${sql.json(source as never)},
        ${total},
        ${`seed-folha-${panel}-q1-from-fopag`},
        now()
      )
      on conflict (id) do update set
        reference_day = excluded.reference_day,
        status = case
          when folha_periods.status in ('approved', 'paid') then folha_periods.status
          else excluded.status
        end,
        lines = excluded.lines,
        source_professionals = excluded.source_professionals,
        total_proposed_pay = excluded.total_proposed_pay,
        updated_by = excluded.updated_by,
        updated_at = now()
    `
    console.log('saved', q.id)
  } finally {
    await sql.end({ timeout: 5 })
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
