/**
 * Índice de Performance Diária (V1.5 — constância + Δ + acumulado até o mês).
 *
 * Mês (dropdown):
 * - fat_bruto: 8123 `charged` MTD do mês (espelho Folha)
 * - dias_trabalhados: dias distintos com visita Avec no mês (“veio”)
 * - media_dia_trabalhado: fat_bruto ÷ dias_trabalhados
 * - constancia_pct = dias_trabalhados ÷ dias_uteis_salao × 100
 *
 * Acumulado até o mês escolhido (jan → fim do recorte):
 * - fat_bruto_ano: soma do MTD do último snapshot de cada mês
 *   · 8123 `charged` quando o mês tem sync; senão P1 `revenue` (0021)
 * - dias_trabalhados_ano: visitas no ano até o recorte
 * - media_dia_ano: fat_bruto_ano ÷ dias veio nos meses do acumulado
 *
 * Totais = soma das colunas (médias ponderadas fat÷dias).
 */
import { getSql } from '@/lib/db'
import {
  firstAndLastTokenKey,
  normalizeProKey,
  significantNameTokens,
} from '@/lib/director-report/match-pro'
import { todayIso } from '@/lib/salon/format'
import { resolveMonthWindow } from '@/lib/salon/month-window'
import {
  getSalonCommissionsDailyNear,
  type CommissionProfessionalRow,
} from '@/lib/salon/commission-metrics'
import {
  getSalonP1DailyNear,
  type P1ProfessionalRow,
} from '@/lib/salon/p1-metrics'
import { compareByNamePtBr } from '@/lib/salon/sort'
import { asJsonArray } from '@/lib/jsonb'

export type DailyPerformanceStanding = 'acima' | 'abaixo' | 'neutro' | 'sem_base'

export type DailyPerformanceProRow = {
  name: string
  /** Cargo 8123 (Cabeleireiro, Manicure, Assistente…). */
  categoria: string | null
  fat_bruto: number | null
  dias_trabalhados: number | null
  dias_uteis_salao: number | null
  media_dia_trabalhado: number | null
  media_dia_salao: number | null
  /** dias veio ÷ dias úteis salão × 100 */
  constancia_pct: number | null
  /** (dias veio ÷ média dias da unidade − 1) × 100 */
  delta_indice: number | null
  standing: DailyPerformanceStanding
  /** Fat acumulado jan → mês do dropdown (8123 ou P1 por mês). */
  fat_bruto_ano: number | null
  /** Dias distintos com visita no ano civil até o recorte. */
  dias_trabalhados_ano: number | null
  /** Dias veio nos meses que entraram no acumulado (denominador da média). */
  dias_base_media_ano: number | null
  /** fat_bruto_ano ÷ dias_base_media_ano. */
  media_dia_ano: number | null
}

export type DailyPerformanceTotals = {
  fat_bruto: number | null
  dias_trabalhados: number | null
  /** Dias úteis do salão no mês (não soma — mesma base para todos). */
  dias_uteis_salao: number | null
  /** Constância média do salão (mesmo que `indice`). */
  constancia_pct: number | null
  /** Fat mês ÷ dias veio (ponderado). */
  media_dia_trabalhado: number | null
  fat_bruto_ano: number | null
  dias_trabalhados_ano: number | null
  dias_base_media_ano: number | null
  media_dia_ano: number | null
  /** Δ não soma — sempre null no rodapé. */
  delta_indice: null
}

export type DailyPerformanceIndex = {
  month: string
  from: string
  to: string
  mtd: boolean
  /** Início do ano civil do mês selecionado. */
  year_from: string
  /** Fim do recorte anual (= `to` do mês). */
  year_to: string
  /**
   * Meses YYYY-MM que entraram no acumulado até o mês (último snapshot de cada um).
   * Vazio → sem base de fat acumulado.
   */
  year_months_covered: string[]
  /** Subconjunto coberto por 8123 charged. */
  year_months_from_8123: string[]
  /** Subconjunto coberto por P1 revenue (fallback sem 8123). */
  year_months_from_p1: string[]
  reference_day: string | null
  salon_open_days: number | null
  /** Média aritmética dos dias veio (só quem tem base). */
  media_dias_trabalhados: number | null
  /** Constância média do salão (%): media_dias ÷ dias úteis × 100. */
  indice: number | null
  professionals: DailyPerformanceProRow[]
  totals: DailyPerformanceTotals
  note: string
}

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

/** Percentual com 1 casa (ex.: 72,5). */
export function roundPct(n: number): number {
  return Math.round(n * 10) / 10
}

/** fat / dias — null se fat ausente ou dias ≤ 0. */
export function avgPerDay(
  fat: number | null,
  days: number | null | undefined,
): number | null {
  if (fat == null || !Number.isFinite(fat)) return null
  if (days == null || days <= 0) return null
  return roundMoney(fat / days)
}

/**
 * Constância: dias trabalhados ÷ dias úteis viáveis × 100.
 * Cap em 100% (dias veio não deveriam passar dos úteis; se passarem, satura).
 */
export function constanciaPct(
  diasTrabalhados: number | null | undefined,
  diasUteisSalao: number | null | undefined,
): number | null {
  if (diasTrabalhados == null || diasTrabalhados <= 0) return null
  if (diasUteisSalao == null || diasUteisSalao <= 0) return null
  const raw = (diasTrabalhados / diasUteisSalao) * 100
  return roundPct(Math.min(100, raw))
}

export function meanOf(values: number[]): number | null {
  if (values.length === 0) return null
  const sum = values.reduce((a, b) => a + b, 0)
  return roundMoney(sum / values.length)
}

export function meanPct(values: number[]): number | null {
  if (values.length === 0) return null
  const sum = values.reduce((a, b) => a + b, 0)
  return roundPct(sum / values.length)
}

/**
 * % do profissional vs média de dias trabalhados da unidade.
 * Ex.: 24 dias com média 18 → +33,3%.
 */
export function deltaVsMediaDias(
  diasTrabalhados: number | null | undefined,
  mediaDiasUnidade: number | null | undefined,
): number | null {
  if (diasTrabalhados == null || diasTrabalhados <= 0) return null
  if (mediaDiasUnidade == null || mediaDiasUnidade <= 0) return null
  return roundPct((diasTrabalhados / mediaDiasUnidade - 1) * 100)
}

/** Standing a partir do Δ % vs média de dias. */
export function standingFromDelta(
  delta: number | null,
  tol = 0.5,
): DailyPerformanceStanding {
  if (delta == null) return 'sem_base'
  if (Math.abs(delta) <= tol) return 'neutro'
  return delta > 0 ? 'acima' : 'abaixo'
}

/** Jan…mês selecionado (YYYY-MM). */
export function monthKeysFromJanThrough(monthKey: string): string[] {
  if (!/^\d{4}-\d{2}$/.test(monthKey)) return []
  const [y, m] = monthKey.split('-').map(Number)
  const keys: string[] = []
  for (let i = 1; i <= (m ?? 0); i++) {
    keys.push(`${y}-${String(i).padStart(2, '0')}`)
  }
  return keys
}

export function sumMoney(
  values: ReadonlyArray<number | null | undefined>,
): number | null {
  let sum = 0
  let any = false
  for (const v of values) {
    if (v == null || !Number.isFinite(v)) continue
    sum += v
    any = true
  }
  return any ? roundMoney(sum) : null
}

export function sumPositiveInts(
  values: ReadonlyArray<number | null | undefined>,
): number | null {
  let sum = 0
  let any = false
  for (const v of values) {
    if (v == null || !Number.isFinite(v) || v <= 0) continue
    sum += v
    any = true
  }
  return any ? sum : null
}

export function buildDailyPerformanceTotals(
  rows: readonly DailyPerformanceProRow[],
  salonOpenDays: number | null,
  indice: number | null,
): DailyPerformanceTotals {
  const fat = sumMoney(rows.map((r) => r.fat_bruto))
  const dias = sumPositiveInts(rows.map((r) => r.dias_trabalhados))
  const fatAno = sumMoney(rows.map((r) => r.fat_bruto_ano))
  const diasAno = sumPositiveInts(rows.map((r) => r.dias_trabalhados_ano))
  const diasBaseMediaAno = sumPositiveInts(
    rows.map((r) => r.dias_base_media_ano),
  )
  return {
    fat_bruto: fat,
    dias_trabalhados: dias,
    dias_uteis_salao:
      salonOpenDays != null && salonOpenDays > 0 ? salonOpenDays : null,
    constancia_pct: indice,
    media_dia_trabalhado: avgPerDay(fat, dias),
    fat_bruto_ano: fatAno,
    dias_trabalhados_ano: diasAno,
    dias_base_media_ano: diasBaseMediaAno,
    media_dia_ano: avgPerDay(fatAno, diasBaseMediaAno),
    delta_indice: null,
  }
}

/**
 * Casa nome do P1 com chave de visitas (apelidos / nome curto).
 * Prefere chave exata; senão first+last; senão overlap de tokens significativos.
 */
export function matchVisitKeyToP1(
  visitKey: string,
  p1Keys: string[],
): string | null {
  if (p1Keys.includes(visitKey)) return visitKey
  const fl = firstAndLastTokenKey(visitKey)
  if (fl) {
    const hit = p1Keys.find((k) => firstAndLastTokenKey(k) === fl)
    if (hit) return hit
  }
  const vt = significantNameTokens(visitKey)
  if (vt.length === 0) return null
  let best: string | null = null
  let bestScore = 0
  for (const k of p1Keys) {
    const pt = significantNameTokens(k)
    if (pt.length === 0) continue
    const inter = pt.filter((t) => vt.includes(t)).length
    const need = Math.min(2, pt.length, vt.length)
    if (inter >= need && inter > bestScore) {
      best = k
      bestScore = inter
    }
  }
  return best
}

/**
 * Casa cargo 8123 → nome canônico P1 (mesma lógica de visitas).
 */
export function mapCategoriaByP1Name(
  p1Names: string[],
  commissionRows: readonly { name: string; role: string | null }[],
): Map<string, string> {
  const p1Keys = p1Names.map((n) => normalizeProKey(n))
  const keyToName = new Map(p1Names.map((n) => [normalizeProKey(n), n]))
  const out = new Map<string, string>()
  for (const row of commissionRows) {
    const role = String(row.role ?? '').trim()
    if (!role) continue
    const visitKey = normalizeProKey(String(row.name ?? ''))
    if (!visitKey) continue
    const matched = matchVisitKeyToP1(visitKey, p1Keys)
    if (!matched) continue
    const name = keyToName.get(matched)
    if (!name || out.has(name)) continue
    out.set(name, role)
  }
  return out
}

/**
 * Casa fat bruto 8123 (`charged` / valor_cobrado) → nome canônico P1.
 * Ausente ou ≤ 0,02 → não entra no mapa (KPI null na UI, não inventa 0).
 */
export function mapFatBrutoByP1Name(
  p1Names: string[],
  commissionRows: readonly { name: string; charged: number | null }[],
): Map<string, number> {
  const p1Keys = p1Names.map((n) => normalizeProKey(n))
  const keyToName = new Map(p1Names.map((n) => [normalizeProKey(n), n]))
  const out = new Map<string, number>()
  for (const row of commissionRows) {
    const charged = Number(row.charged)
    if (!Number.isFinite(charged) || charged <= 0.02) continue
    const visitKey = normalizeProKey(String(row.name ?? ''))
    if (!visitKey) continue
    const matched = matchVisitKeyToP1(visitKey, p1Keys)
    if (!matched) continue
    const name = keyToName.get(matched)
    if (!name || out.has(name)) continue
    out.set(name, charged)
  }
  return out
}

/**
 * Casa receita P1 (0021) → nome canônico P1 — fallback do acumulado sem 8123.
 */
export function mapP1RevenueByP1Name(
  p1Names: string[],
  p1Rows: readonly { name: string; revenue: number | null | undefined }[],
): Map<string, number> {
  const p1Keys = p1Names.map((n) => normalizeProKey(n))
  const keyToName = new Map(p1Names.map((n) => [normalizeProKey(n), n]))
  const out = new Map<string, number>()
  for (const row of p1Rows) {
    const revenue = Number(row.revenue)
    if (!Number.isFinite(revenue) || revenue <= 0.02) continue
    const visitKey = normalizeProKey(String(row.name ?? ''))
    if (!visitKey) continue
    const matched = matchVisitKeyToP1(visitKey, p1Keys)
    if (!matched) continue
    const name = keyToName.get(matched)
    if (!name || out.has(name)) continue
    out.set(name, revenue)
  }
  return out
}

/**
 * Acumulado jan→mês: por mês, 8123 se existir; senão P1.
 * `monthsThrough` = monthKeysFromJanThrough(mês do dropdown).
 */
export function buildFatYtdThroughMonth(args: {
  monthsThrough: readonly string[]
  byMonth8123: Map<string, Map<string, number>>
  byMonthP1: Map<string, Map<string, number>>
}): {
  fatByPro: Map<string, number>
  monthsCovered: string[]
  monthsFrom8123: string[]
  monthsFromP1: string[]
} {
  const entries: Array<{ month: string; chargedByPro: Map<string, number> }> =
    []
  const monthsFrom8123: string[] = []
  const monthsFromP1: string[] = []
  for (const month of args.monthsThrough) {
    if (!/^\d{4}-\d{2}$/.test(month)) continue
    const m8123 = args.byMonth8123.get(month)
    if (m8123 && m8123.size > 0) {
      entries.push({ month, chargedByPro: m8123 })
      monthsFrom8123.push(month)
      continue
    }
    const mP1 = args.byMonthP1.get(month)
    if (mP1 && mP1.size > 0) {
      entries.push({ month, chargedByPro: mP1 })
      monthsFromP1.push(month)
    }
  }
  const merged = mergeExactMonthChargedMaps(entries)
  return {
    fatByPro: merged.fatByPro,
    monthsCovered: merged.monthsCovered,
    monthsFrom8123,
    monthsFromP1,
  }
}

/** Soma mapas de charged (ex.: meses → acumulado). */
export function addChargedMaps(
  maps: readonly Map<string, number>[],
): Map<string, number> {
  const out = new Map<string, number>()
  for (const map of maps) {
    for (const [name, charged] of map) {
      if (!Number.isFinite(charged) || charged <= 0.02) continue
      out.set(name, roundMoney((out.get(name) ?? 0) + charged))
    }
  }
  return out
}

/**
 * Junta charged de meses distintos — 1 mapa por mês, sem reutilizar mês.
 * Entradas com o mesmo `month`: fica a primeira (idempotente).
 */
export function mergeExactMonthChargedMaps(
  entries: ReadonlyArray<{ month: string; chargedByPro: Map<string, number> }>,
): { fatByPro: Map<string, number>; monthsCovered: string[] } {
  const seen = new Set<string>()
  const maps: Map<string, number>[] = []
  const months: string[] = []
  for (const e of entries) {
    if (!/^\d{4}-\d{2}$/.test(e.month)) continue
    if (seen.has(e.month)) continue
    seen.add(e.month)
    months.push(e.month)
    maps.push(e.chargedByPro)
  }
  months.sort()
  return { fatByPro: addChargedMaps(maps), monthsCovered: months }
}

/** Primeiro dia do primeiro mês coberto → fim do recorte (para média/dia justa). */
export function coveredMonthsDayRange(
  monthsCovered: readonly string[],
  yearTo: string,
): { from: string; to: string } | null {
  if (monthsCovered.length === 0) return null
  const sorted = [...monthsCovered].sort()
  const first = sorted[0]
  if (!first || !/^\d{4}-\d{2}$/.test(first)) return null
  return { from: `${first}-01`, to: yearTo }
}

function matchDaysByVisitKeyToP1(
  daysByVisitKey: Map<string, number>,
  p1Names: string[],
): Map<string, number> {
  const p1Keys = p1Names.map((n) => normalizeProKey(n))
  const keyToName = new Map(p1Names.map((n) => [normalizeProKey(n), n]))
  const daysWorkedByP1 = new Map<string, number>()
  for (const [visitKey, days] of daysByVisitKey) {
    const matched = matchVisitKeyToP1(visitKey, p1Keys)
    if (!matched) continue
    const name = keyToName.get(matched)
    if (!name) continue
    daysWorkedByP1.set(name, Math.max(daysWorkedByP1.get(name) ?? 0, days))
  }
  return daysWorkedByP1
}

export function buildDailyPerformanceIndex(args: {
  month: string
  from: string
  to: string
  mtd: boolean
  yearFrom?: string
  yearTo?: string
  yearMonthsCovered?: string[]
  yearMonthsFrom8123?: string[]
  yearMonthsFromP1?: string[]
  referenceDay: string | null
  salonOpenDays: number | null
  /** Nome canônico P1 → fat 8123 charged (mês/MTD no referenceDay) */
  fatByPro: Map<string, number>
  /** Chave normalizada de visita → dias distintos (mês) */
  daysByVisitKey: Map<string, number>
  /** Nome canônico P1 → fat acumulado até o mês */
  fatYtdByPro?: Map<string, number>
  /** Chave normalizada de visita → dias distintos (ano civil) */
  daysYtdByVisitKey?: Map<string, number>
  /**
   * Dias veio nos meses do acumulado (base da média/dia acumulada).
   * Se omitido, cai no ano civil.
   */
  daysYtdCoveredByVisitKey?: Map<string, number>
  /** Nome canônico P1 → cargo 8123 */
  categoriaByPro?: Map<string, string>
}): DailyPerformanceIndex {
  const p1Names = [...args.fatByPro.keys()]
  const categoriaByPro = args.categoriaByPro ?? new Map<string, string>()
  const fatYtdByPro = args.fatYtdByPro ?? new Map<string, number>()
  const yearMonthsCovered = [...(args.yearMonthsCovered ?? [])].sort()
  const yearMonthsFrom8123 = [...(args.yearMonthsFrom8123 ?? [])].sort()
  const yearMonthsFromP1 = [...(args.yearMonthsFromP1 ?? [])].sort()
  const daysWorkedByP1 = matchDaysByVisitKeyToP1(args.daysByVisitKey, p1Names)
  const daysYtdByP1 = matchDaysByVisitKeyToP1(
    args.daysYtdByVisitKey ?? new Map(),
    p1Names,
  )
  const daysYtdCoveredByP1 = matchDaysByVisitKeyToP1(
    args.daysYtdCoveredByVisitKey ?? args.daysYtdByVisitKey ?? new Map(),
    p1Names,
  )

  const yearFrom = args.yearFrom ?? `${args.month.slice(0, 4)}-01-01`
  const yearTo = args.yearTo ?? args.to

  const diasComBase: number[] = []
  const constancias: number[] = []
  const draft: Array<
    Omit<DailyPerformanceProRow, 'delta_indice' | 'standing'>
  > = []

  for (const name of p1Names) {
    const fatRaw = args.fatByPro.get(name)
    const fat =
      fatRaw != null && Number.isFinite(fatRaw) && fatRaw > 0.02
        ? roundMoney(fatRaw)
        : null
    const daysWorkedRaw = daysWorkedByP1.get(name)
    const daysWorked =
      daysWorkedRaw != null && daysWorkedRaw > 0 ? daysWorkedRaw : null
    const openDays =
      args.salonOpenDays != null && args.salonOpenDays > 0
        ? args.salonOpenDays
        : null
    const mediaTrab = avgPerDay(fat, daysWorked)
    const mediaSalao = avgPerDay(fat, openDays)
    const constancia = constanciaPct(daysWorked, openDays)
    const categoria = categoriaByPro.get(name)?.trim() || null

    const fatYtdRaw = fatYtdByPro.get(name)
    const fatYtd =
      fatYtdRaw != null && Number.isFinite(fatYtdRaw) && fatYtdRaw > 0.02
        ? roundMoney(fatYtdRaw)
        : null
    const daysYtdRaw = daysYtdByP1.get(name)
    const daysYtd =
      daysYtdRaw != null && daysYtdRaw > 0 ? daysYtdRaw : null
    const daysCoveredRaw = daysYtdCoveredByP1.get(name)
    const daysCovered =
      daysCoveredRaw != null && daysCoveredRaw > 0 ? daysCoveredRaw : null
    // Média acumulada usa dias dos meses que entraram no acumulado.
    const mediaAno = avgPerDay(fatYtd, daysCovered)

    if (daysWorked != null) diasComBase.push(daysWorked)
    if (constancia != null) constancias.push(constancia)

    // Só lista quem faturou ou veio no mês — evita elenco Avec morto.
    if (fat == null && daysWorked == null) continue
    draft.push({
      name,
      categoria,
      fat_bruto: fat,
      dias_trabalhados: daysWorked,
      dias_uteis_salao: openDays,
      media_dia_trabalhado: mediaTrab,
      media_dia_salao: mediaSalao,
      constancia_pct: constancia,
      fat_bruto_ano: fatYtd,
      dias_trabalhados_ano: daysYtd,
      dias_base_media_ano: daysCovered,
      media_dia_ano: mediaAno,
    })
  }

  const mediaDias = meanOf(diasComBase)
  const indice = meanPct(constancias)
  const professionals: DailyPerformanceProRow[] = draft
    .map((row) => {
      const delta = deltaVsMediaDias(row.dias_trabalhados, mediaDias)
      return {
        ...row,
        delta_indice: delta,
        standing: standingFromDelta(delta),
      }
    })
    .sort((a, b) => {
      const da = a.delta_indice
      const db = b.delta_indice
      if (da != null && db != null && da !== db) return db - da
      if (da != null && db == null) return -1
      if (da == null && db != null) return 1
      const ca = a.constancia_pct ?? -1
      const cb = b.constancia_pct ?? -1
      if (ca !== cb) return cb - ca
      const fa = a.fat_bruto ?? -1
      const fb = b.fat_bruto ?? -1
      if (fa !== fb) return fb - fa
      return compareByNamePtBr(a.name, b.name)
    })

  const totals = buildDailyPerformanceTotals(
    professionals,
    args.salonOpenDays,
    indice,
  )

  const coveredLabel =
    yearMonthsCovered.length === 0
      ? 'sem meses'
      : yearMonthsCovered.length === 1
        ? yearMonthsCovered[0]!
        : `${yearMonthsCovered[0]}…${yearMonthsCovered[yearMonthsCovered.length - 1]} (${yearMonthsCovered.length} meses)`
  const sourceBits: string[] = []
  if (yearMonthsFrom8123.length > 0) {
    sourceBits.push(`8123: ${yearMonthsFrom8123.join(', ')}`)
  }
  if (yearMonthsFromP1.length > 0) {
    sourceBits.push(`P1: ${yearMonthsFromP1.join(', ')}`)
  }
  const sourceLabel =
    sourceBits.length > 0 ? sourceBits.join(' · ') : 'sem fonte'

  return {
    month: args.month,
    from: args.from,
    to: args.to,
    mtd: args.mtd,
    year_from: yearFrom,
    year_to: yearTo,
    year_months_covered: yearMonthsCovered,
    year_months_from_8123: yearMonthsFrom8123,
    year_months_from_p1: yearMonthsFromP1,
    reference_day: args.referenceDay,
    salon_open_days: args.salonOpenDays,
    media_dias_trabalhados: mediaDias,
    indice,
    professionals,
    totals,
    note:
      `Média/dia (mês) = fat 8123 do mês ÷ dias com visita. Constância = dias no mês ÷ dias úteis. Δ = (dias ÷ média da unidade − 1) × 100. Fat acumulado = soma jan→mês do dropdown (${coveredLabel}; ${sourceLabel}) — 8123 quando houver, senão P1. Dias no ano = visitas no ano. Média/dia (acumulado) = fat acumulado ÷ dias veio nos meses do acumulado.`,
  }
}

async function countSalonOpenDays(from: string, to: string): Promise<number | null> {
  const sql = getSql()
  try {
    const rows = (await sql`
      select count(*)::int as n
      from salon_daily_metrics
      where day >= ${from}::date
        and day <= ${to}::date
        and coalesce(revenue, 0) > 0
    `) as { n: number }[]
    const n = Number(rows[0]?.n ?? 0)
    return n > 0 ? n : null
  } catch {
    return null
  }
}

async function loadVisitDaysByPro(
  from: string,
  to: string,
): Promise<Map<string, number>> {
  const sql = getSql()
  const out = new Map<string, number>()
  try {
    const rows = (await sql`
      select unnest(professional_names) as name, count(distinct visited_on)::int as days
      from salon_client_visits
      where visited_on >= ${from}::date
        and visited_on <= ${to}::date
        and professional_names is not null
        and cardinality(professional_names) > 0
      group by 1
    `) as { name: string; days: number }[]
    for (const r of rows) {
      const key = normalizeProKey(String(r.name ?? ''))
      if (!key) continue
      const days = Number(r.days) || 0
      if (days <= 0) continue
      out.set(key, Math.max(out.get(key) ?? 0, days))
    }
  } catch {
    /* tabela ausente */
  }
  return out
}

/** Último snapshot por mês → mapa month → (nome P1 → valor). */
async function loadLastMonthlyMoneyByPro(
  kind: '8123' | 'p1',
  p1Names: string[],
  yearFrom: string,
  yearTo: string,
): Promise<Map<string, Map<string, number>>> {
  const out = new Map<string, Map<string, number>>()
  if (p1Names.length === 0) return out
  const sql = getSql()
  try {
    const rows =
      kind === '8123'
        ? ((await sql`
            select distinct on (date_trunc('month', day))
              to_char(day, 'YYYY-MM') as month,
              professionals
            from salon_commissions_daily
            where day >= ${yearFrom}::date
              and day <= ${yearTo}::date
            order by date_trunc('month', day), day desc
          `) as { month: string; professionals: unknown }[])
        : ((await sql`
            select distinct on (date_trunc('month', day))
              to_char(day, 'YYYY-MM') as month,
              professionals
            from salon_p1_daily
            where day >= ${yearFrom}::date
              and day <= ${yearTo}::date
            order by date_trunc('month', day), day desc
          `) as { month: string; professionals: unknown }[])

    for (const row of rows) {
      const month = String(row.month ?? '')
      if (!/^\d{4}-\d{2}$/.test(month)) continue
      if (kind === '8123') {
        const pros = asJsonArray<CommissionProfessionalRow>(row.professionals)
        const mapped = mapFatBrutoByP1Name(p1Names, pros)
        if (mapped.size > 0) out.set(month, mapped)
      } else {
        const pros = asJsonArray<P1ProfessionalRow>(row.professionals)
        const mapped = mapP1RevenueByP1Name(p1Names, pros)
        if (mapped.size > 0) out.set(month, mapped)
      }
    }
  } catch {
    /* tabela ausente */
  }
  return out
}

/**
 * Fat acumulado jan → mês do dropdown: 8123 por mês, senão P1.
 */
async function loadFatBrutoYtdThroughMonth(
  p1Names: string[],
  monthKey: string,
  yearFrom: string,
  yearTo: string,
): Promise<{
  fatByPro: Map<string, number>
  monthsCovered: string[]
  monthsFrom8123: string[]
  monthsFromP1: string[]
}> {
  const monthsThrough = monthKeysFromJanThrough(monthKey)
  if (monthsThrough.length === 0 || p1Names.length === 0) {
    return {
      fatByPro: new Map(),
      monthsCovered: [],
      monthsFrom8123: [],
      monthsFromP1: [],
    }
  }
  const [byMonth8123, byMonthP1] = await Promise.all([
    loadLastMonthlyMoneyByPro('8123', p1Names, yearFrom, yearTo),
    loadLastMonthlyMoneyByPro('p1', p1Names, yearFrom, yearTo),
  ])
  return buildFatYtdThroughMonth({ monthsThrough, byMonth8123, byMonthP1 })
}

/**
 * Carrega índice para o mês (MTD se corrente), com YTD até o fim do recorte.
 */
export async function computeDailyPerformanceIndex(opts?: {
  month?: string | null
  referenceDay?: string | null
}): Promise<DailyPerformanceIndex> {
  const referenceDay = opts?.referenceDay?.trim() || todayIso()
  const monthKey =
    opts?.month && /^\d{4}-\d{2}$/.test(opts.month)
      ? opts.month
      : referenceDay.slice(0, 7)
  const window = resolveMonthWindow(monthKey, referenceDay)
  const yearFrom = `${window.month.slice(0, 4)}-01-01`
  const yearTo = window.to

  const [latest, commissions] = await Promise.all([
    getSalonP1DailyNear(window.to, { maxSkewDays: 14 }),
    getSalonCommissionsDailyNear(window.to, { maxSkewDays: 45 }),
  ])
  const pros = asJsonArray<P1ProfessionalRow>(latest?.professionals)
  /** Elenco canônico P1 (presença / match de visitas); fat vem do 8123. */
  const p1Names: string[] = []
  for (const p of pros) {
    const name = String(p.name ?? '').trim()
    if (!name) continue
    p1Names.push(name)
  }

  const commissionPros = asJsonArray<CommissionProfessionalRow>(
    commissions?.professionals,
  )
  const chargedByPro = mapFatBrutoByP1Name(p1Names, commissionPros)
  const categoriaByPro = mapCategoriaByP1Name(p1Names, commissionPros)

  // Roster P1 com fat 8123 quando houver; 0 placeholder → null na UI (não coalescer).
  const fatByPro = new Map<string, number>()
  for (const name of p1Names) {
    fatByPro.set(name, chargedByPro.get(name) ?? 0)
  }

  const [salonOpenDays, daysByVisitKey, daysYtdByVisitKey, fatYtd] =
    await Promise.all([
      countSalonOpenDays(window.from, window.to),
      loadVisitDaysByPro(window.from, window.to),
      loadVisitDaysByPro(yearFrom, yearTo),
      loadFatBrutoYtdThroughMonth(p1Names, window.month, yearFrom, yearTo),
    ])

  const coveredRange = coveredMonthsDayRange(fatYtd.monthsCovered, yearTo)
  const daysYtdCoveredByVisitKey = coveredRange
    ? coveredRange.from === yearFrom && coveredRange.to === yearTo
      ? daysYtdByVisitKey
      : await loadVisitDaysByPro(coveredRange.from, coveredRange.to)
    : new Map<string, number>()

  return buildDailyPerformanceIndex({
    month: window.month,
    from: window.from,
    to: window.to,
    mtd: window.mtd,
    yearFrom,
    yearTo,
    yearMonthsCovered: fatYtd.monthsCovered,
    yearMonthsFrom8123: fatYtd.monthsFrom8123,
    yearMonthsFromP1: fatYtd.monthsFromP1,
    referenceDay: commissions?.day ?? latest?.day ?? null,
    salonOpenDays,
    fatByPro,
    daysByVisitKey,
    fatYtdByPro: fatYtd.fatByPro,
    daysYtdByVisitKey,
    daysYtdCoveredByVisitKey,
    categoriaByPro,
  })
}
