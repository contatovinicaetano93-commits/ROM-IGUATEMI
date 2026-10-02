/**
 * Auditoria completa: Fopag xlsx fórmulas + fixture vs motor (8123 Neon + extras Fopag).
 */
import ExcelJS from 'exceljs'
import { readFileSync, writeFileSync } from 'fs'
import postgres from 'postgres'
import { buildFolhaDraftLine } from '../src/lib/folha/draft-from-8123'
import {
  resolveFolhaPersonRules,
  resolveMeioAMeioRate,
  resolveGrossAdminFeeRate,
  resolveProfessionalServiceTaxRate,
  resolveRemitRate,
  usesNamedMeioOverride,
  romeuAssistantMetaTopUp,
} from '../src/lib/folha/exceptions'
import { normalizeFolhaCargo } from '../src/lib/folha/rules'
import {
  firstAndLastTokenKey,
  occupancyMergeKey,
} from '../src/lib/director-report/match-pro'

const XLSX =
  '/home/ubuntu/.cursor/projects/agent/uploads/Fopag_16.09___30.09.2026_2__-_META_ROMEU_90dc.xlsx'

type FRow = {
  name: string
  cargo: string | null
  faturado: number
  pct_salao: number
  taxa_cartao: number
  fat_liquido: number
  produto: number
  taxa_adm: number
  taxa_adm_formula: string | null
  desc_assistente: number
  meio_a_meio: number
  meio_formula: string | null
  parc: number
  darf: number
  das: number
  div_ativa: number
  mensalidade: number
  baru: number
  servicos_30: number // col T / our U raw
  U: number // valor a pagar pro col U excel = our V input base is servicos
  V: number // excel U = valor a pagar
  W: number // excel V = taxa
  desc_diversos_02: number
  liquido: number
  liquido_formula: string | null
}

function num(v: unknown): number {
  if (v == null) return 0
  if (typeof v === 'number') return v
  if (typeof v === 'object' && v && 'result' in v) return Number((v as { result: unknown }).result) || 0
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}
function formula(v: unknown): string | null {
  if (v && typeof v === 'object' && 'formula' in v) return String((v as { formula: string }).formula)
  return null
}

async function readXlsx(): Promise<FRow[]> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(XLSX)
  const ws = wb.getWorksheet('Base Folha Iguatemi ') || wb.worksheets[0]!
  const out: FRow[] = []
  for (let r = 2; r <= ws.rowCount; r++) {
    const name = String(ws.getCell(r, 1).value ?? '').trim()
    if (!name) continue
    const get = (c: number) => ws.getCell(r, c).value
    out.push({
      name,
      cargo: String(ws.getCell(r, 2).value ?? '').trim() || null,
      faturado: num(get(3)),
      pct_salao: num(get(4)),
      taxa_cartao: num(get(6)),
      fat_liquido: num(get(7)),
      produto: num(get(8)),
      taxa_adm: num(get(10)),
      taxa_adm_formula: formula(get(10)),
      desc_assistente: num(get(11)),
      meio_a_meio: num(get(12)),
      meio_formula: formula(get(12)),
      parc: num(get(13)),
      darf: num(get(14)),
      das: num(get(15)),
      div_ativa: num(get(16)),
      mensalidade: num(get(18)),
      baru: num(get(19)),
      servicos_30: num(get(20)),
      U: num(get(20)),
      V: num(get(21)),
      W: num(get(22)),
      desc_diversos_02: num(get(23)),
      liquido: num(get(24)),
      liquido_formula: formula(get(24)),
    })
  }
  return out
}

function lookup<T>(map: Map<string, T>, name: string): T | null {
  const key = occupancyMergeKey(name)
  if (key && map.has(key)) return map.get(key) ?? null
  const fl = firstAndLastTokenKey(key ?? '')
  const hits: T[] = []
  for (const [k, v] of map) {
    if (fl && firstAndLastTokenKey(k) === fl) hits.push(v)
    else if (key && (key.startsWith(k + ' ') || k.startsWith(key + ' '))) hits.push(v)
  }
  const uniq = [...new Set(hits)]
  return uniq.length === 1 ? uniq[0]! : null
}

/** Y Fopag: G-H-J-K+L-M-N-O-P-R-S-W+U-V (Excel cols) */
function fopagY(f: FRow): number {
  return (
    f.fat_liquido -
    f.produto -
    f.taxa_adm -
    f.desc_assistente +
    f.meio_a_meio -
    f.parc -
    f.darf -
    f.das -
    f.div_ativa -
    f.mensalidade -
    f.baru -
    f.desc_diversos_02 +
    f.V -
    f.W
  )
}

async function main() {
  const fopag = await readXlsx()
  const fixture = JSON.parse(
    readFileSync('./src/lib/folha/fixtures/fopag-ig-q2-parsed.json', 'utf8'),
  )
  const bonus = (fixture.bonus_romeu_ig ?? []) as Array<{
    name: string
    total: number
    adic_10: number
  }>
  const bonusBy = new Map(bonus.map((b) => [occupancyMergeKey(b.name)!, b]))

  // Sample formulas
  const samples = ['ANA CRISTINA', 'BRUNNA', 'ROMEU FELIPE', 'GABRIELA DA SILVA', 'DIELLO', 'JOANIDES', 'AMAURI', 'ALANA']
  console.log('=== FÓRMULAS AMOSTRA ===')
  for (const s of samples) {
    const f = fopag.find((x) => x.name.toUpperCase().includes(s))
    if (!f) continue
    console.log(
      JSON.stringify({
        name: f.name,
        adm_f: f.taxa_adm_formula,
        meio_f: f.meio_formula,
        y_f: f.liquido_formula,
        y_recalc: Math.round(fopagY(f) * 10000) / 10000,
        y_cell: f.liquido,
        y_ok: Math.abs(fopagY(f) - f.liquido) < 0.05,
        U: f.U,
        V: f.V,
        W: f.W,
        baru: f.baru,
        adm: f.taxa_adm,
        meio: f.meio_a_meio,
      }),
    )
  }

  // Adm rate patterns
  const admRates = new Map<string, number>()
  for (const f of fopag) {
    if (f.faturado > 0.02 && f.taxa_adm > 0.02) {
      const rate = Math.round((f.taxa_adm / f.faturado) * 1000) / 1000
      admRates.set(String(rate), (admRates.get(String(rate)) ?? 0) + 1)
    }
  }
  console.log('=== ADM RATES ===', Object.fromEntries(admRates))

  // Meio formulas
  const meioForms = new Map<string, number>()
  for (const f of fopag) {
    const mf = f.meio_formula ?? (f.meio_a_meio > 0 ? 'value' : 'zero')
    const key = mf.replace(/\d+/g, 'N')
    meioForms.set(key, (meioForms.get(key) ?? 0) + 1)
  }
  console.log('=== MEIO FORMULA PATTERNS ===', Object.fromEntries(meioForms))

  // Y formula patterns
  const yForms = new Map<string, number>()
  for (const f of fopag) {
    const yf = f.liquido_formula ?? 'value'
    const key = yf.replace(/\d+/g, 'N')
    yForms.set(key, (yForms.get(key) ?? 0) + 1)
  }
  console.log('=== Y FORMULA PATTERNS ===', Object.fromEntries(yForms))

  // Neon audit
  const sql = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false })
  const rows = await sql`
    select lines, source_professionals from folha_periods where id = ${'2026-09-q2'}
  `
  const source =
    typeof rows[0].source_professionals === 'string'
      ? JSON.parse(rows[0].source_professionals)
      : rows[0].source_professionals
  const srcBy = new Map<string, (typeof source)[0]>()
  for (const s of source) {
    const k = occupancyMergeKey(s.name)
    if (k) srcBy.set(k, s)
  }

  type Gap = {
    name: string
    cargo: string | null
    fopag_liq: number
    target_liq: number
    motor_liq: number | null
    diff: number | null
    status: string
    notes: string[]
    cols: Record<string, number | null>
  }
  const gaps: Gap[] = []
  const matches: Gap[] = []
  let yFormulaOk = 0
  let yFormulaBad = 0

  for (const f of fopag) {
    if (f.liquido <= 0.005 && f.faturado <= 0.005 && f.U <= 0.005) continue
    const yRecalc = fopagY(f)
    if (Math.abs(yRecalc - f.liquido) < 0.05) yFormulaOk++
    else yFormulaBad++

    const src = lookup(srcBy, f.name)
    const person = resolveFolhaPersonRules(f.name)
    const bonus = lookup(bonusBy, f.name)
    const notes: string[] = []
    let target = f.liquido

    // Diello/Dayana: planilha meio 50% genérico → alvo motor 5%
    if (usesNamedMeioOverride(person) && f.desc_assistente > 0.02) {
      const motorMeio = resolveMeioAMeioRate(person) * f.desc_assistente
      if (Math.abs(motorMeio - f.meio_a_meio) > 1) {
        target = f.liquido - f.meio_a_meio + motorMeio
        notes.push(`target_meio5=${target.toFixed(2)}`)
      }
    }
    // Romeu assistant top-up on Q2
    if (person?.isRomeuAssistant && bonus && bonus.adic_10 > 0.005) {
      target = target + bonus.adic_10
      notes.push(`topup=+${bonus.adic_10}`)
    }

    if (!src) {
      gaps.push({
        name: f.name,
        cargo: f.cargo,
        fopag_liq: f.liquido,
        target_liq: target,
        motor_liq: null,
        diff: null,
        status: 'no_8123',
        notes,
        cols: {},
      })
      continue
    }

    const extras: Record<string, number> = {}
    if (f.U > 0.005) extras.servicos_assistente_como_pro = f.U
    if (f.baru > 0.005) extras.consumo_baru = f.baru
    if (f.parc > 0.005) extras.parc = f.parc
    if (f.div_ativa > 0.005) extras.div_ativa = f.div_ativa
    if (f.desc_diversos_02 > 0.005) extras.descontos_diversos = f.desc_diversos_02
    if (f.produto > 0.005) extras.produto_referencia = f.produto
    if (f.liquido > 0.005) extras.liquido_referencia = f.liquido
    if (f.fat_liquido > 0.005) extras.fat_liquido_referencia = f.fat_liquido
    if (bonus) extras.acumulado_mes = bonus.total

    const line = buildFolhaDraftLine('iguatemi', src, extras, {
      applyTaxExtras: false,
      // Alana: a_pagar ≈ Y → Baru só coluna; Monique: a_pagar > Y → abate.
      liquidoReferencia: f.liquido,
      fatLiquidoReferencia: f.fat_liquido,
    })
    const prop = line.proposed_pay
    const diff = prop == null ? null : prop - target
    const row: Gap = {
      name: f.name,
      cargo: f.cargo,
      fopag_liq: f.liquido,
      target_liq: target,
      motor_liq: prop,
      diff,
      status:
        prop != null && Math.abs(diff!) <= 1
          ? 'match'
          : prop != null && Math.abs(diff!) <= 3
            ? 'match_tol'
            : 'gap',
      notes,
      cols: {
        fopag_adm: f.taxa_adm,
        // Fopag J no assistente = taxa_adm_assistente (U×2%/3%); no pro é C×%.
        motor_adm: (() => {
          const cargo = normalizeFolhaCargo(f.cargo)
          const assistLike =
            cargo === 'assistente' ||
            cargo === 'multiplicador' ||
            cargo === 'colorista'
          if (assistLike) {
            return (
              line.taxa_administrativa ??
              line.folha_extras.taxa_adm_assistente
            )
          }
          return line.taxa_administrativa
        })(),
        fopag_meio: f.meio_a_meio,
        motor_meio: line.meio_a_meio,
        fopag_baru: f.baru,
        motor_baru: line.folha_extras.consumo_baru,
        fopag_U: f.U,
        motor_U: line.folha_extras.servicos_assistente_como_pro,
        fopag_V: f.V,
        motor_V: line.folha_extras.valor_a_pagar_profissional,
        fopag_W: f.W,
        motor_W: line.folha_extras.taxa_servicos,
        avec_net: src.net_payable,
        topup: line.folha_extras.romeu_comissao_parcela,
      },
    }
    if (row.status.startsWith('match')) matches.push(row)
    else gaps.push(row)
  }

  // Column-level mismatches among matches+gaps with 8123
  const colGaps: Array<{ name: string; field: string; fopag: number; motor: number | null; d: number }> = []
  for (const m of [...matches, ...gaps]) {
    if (m.motor_liq == null) continue
    const checks: Array<[string, number, number | null]> = [
      ['adm', m.cols.fopag_adm!, m.cols.motor_adm],
      ['meio', m.cols.fopag_meio!, m.cols.motor_meio],
      ['baru', m.cols.fopag_baru!, m.cols.motor_baru],
      ['U', m.cols.fopag_U!, m.cols.motor_U],
      ['V', m.cols.fopag_V!, m.cols.motor_V],
      ['W', m.cols.fopag_W!, m.cols.motor_W],
    ]
    for (const [field, fv, mv] of checks) {
      // Diello meio expected different
      if (field === 'meio' && /diello|dayana/i.test(m.name)) continue
      const motor = mv ?? 0
      const fopagV = fv ?? 0
      if (Math.abs(motor - fopagV) > 1 && (fopagV > 0.02 || motor > 0.02)) {
        colGaps.push({
          name: m.name,
          field,
          fopag: fopagV,
          motor: mv,
          d: Math.round((motor - fopagV) * 100) / 100,
        })
      }
    }
  }

  const out = {
    period: '2026-09-q2',
    fopag_y_formula:
      'G-H-J-K+L-M-N-O-P-R-S-W+U-V  (U=V_pay, V=W_taxa, W=desc_diversos, S=Baru)',
    y_formula_cells_ok: yFormulaOk,
    y_formula_cells_bad: yFormulaBad,
    adm_rate_histogram: Object.fromEntries(admRates),
    counts: {
      active: matches.length + gaps.length,
      match: matches.filter((m) => m.status === 'match').length,
      match_tol: matches.filter((m) => m.status === 'match_tol').length,
      gap: gaps.filter((g) => g.status === 'gap').length,
      no_8123: gaps.filter((g) => g.status === 'no_8123').length,
    },
    gaps: gaps
      .filter((g) => g.status !== 'match')
      .sort((a, b) => Math.abs(b.diff ?? 0) - Math.abs(a.diff ?? 0)),
    column_mismatches_top: colGaps
      .sort((a, b) => Math.abs(b.d) - Math.abs(a.d))
      .slice(0, 40),
    highlight: ['BRUNNA', 'JOANIDES', 'ROMEU FELIPE', 'DIELLO', 'GABRIELA DA SILVA', 'DANIEL CHAB', 'LIRIA', 'AMAURI', 'ALANA', 'AMANDA'].map(
      (k) => {
        const m = [...matches, ...gaps].find((x) =>
          x.name.toUpperCase().includes(k),
        )
        return m
      },
    ),
  }

  writeFileSync(
    '/opt/cursor/artifacts/fopag-motor-full-audit.json',
    JSON.stringify(out, null, 2),
  )
  console.log('=== COUNTS ===', JSON.stringify(out.counts, null, 2))
  console.log('=== GAPS ===')
  for (const g of out.gaps.slice(0, 30)) {
    console.log(
      JSON.stringify({
        name: g.name,
        fopag: g.fopag_liq,
        target: g.target_liq,
        motor: g.motor_liq,
        diff: g.diff != null ? Math.round(g.diff * 100) / 100 : null,
        status: g.status,
        notes: g.notes,
      }),
    )
  }
  console.log('=== COL MISMATCH TOP ===')
  console.log(JSON.stringify(out.column_mismatches_top.slice(0, 25), null, 2))
  await sql.end({ timeout: 5 })
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
