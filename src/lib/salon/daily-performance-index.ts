/**
 * Índice de Performance Diária (V1.2 — constância + Δ vs média dias).
 *
 * Por profissional no período:
 * - fat_bruto: MTD 0021 (`salon_p1_daily`) — contexto
 * - dias_trabalhados: dias distintos em `salon_client_visits` (proxy de “veio”)
 * - dias_uteis_salao: dias com receita em `salon_daily_metrics`
 * - constancia_pct = dias_trabalhados / dias_uteis_salao × 100
 * - media_dia_trabalhado / media_dia_salao: R$ (contexto)
 *
 * Índice do salão = média das constâncias (média dias veio ÷ dias úteis × 100).
 * Delta (%) = (dias_trabalhados ÷ média_dias_unidade − 1) × 100.
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
  getSalonP1DailyNear,
  type P1ProfessionalRow,
} from '@/lib/salon/p1-metrics'
import { compareByNamePtBr } from '@/lib/salon/sort'
import { asJsonArray } from '@/lib/jsonb'

export type DailyPerformanceStanding = 'acima' | 'abaixo' | 'neutro' | 'sem_base'

export type DailyPerformanceProRow = {
  name: string
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
}

export type DailyPerformanceIndex = {
  month: string
  from: string
  to: string
  mtd: boolean
  reference_day: string | null
  salon_open_days: number | null
  /** Média aritmética dos dias veio (só quem tem base). */
  media_dias_trabalhados: number | null
  /** Constância média do salão (%): media_dias ÷ dias úteis × 100. */
  indice: number | null
  professionals: DailyPerformanceProRow[]
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

export function buildDailyPerformanceIndex(args: {
  month: string
  from: string
  to: string
  mtd: boolean
  referenceDay: string | null
  salonOpenDays: number | null
  /** Nome canônico P1 → fat MTD no referenceDay */
  fatByPro: Map<string, number>
  /** Chave normalizada de visita → dias distintos */
  daysByVisitKey: Map<string, number>
}): DailyPerformanceIndex {
  const p1Names = [...args.fatByPro.keys()]
  const p1Keys = p1Names.map((n) => normalizeProKey(n))
  const keyToName = new Map(p1Names.map((n) => [normalizeProKey(n), n]))

  const daysWorkedByP1 = new Map<string, number>()
  for (const [visitKey, days] of args.daysByVisitKey) {
    const matched = matchVisitKeyToP1(visitKey, p1Keys)
    if (!matched) continue
    const name = keyToName.get(matched)
    if (!name) continue
    daysWorkedByP1.set(name, Math.max(daysWorkedByP1.get(name) ?? 0, days))
  }

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

    if (daysWorked != null) diasComBase.push(daysWorked)
    if (constancia != null) constancias.push(constancia)

    // Só lista quem faturou ou veio — evita elenco Avec morto.
    if (fat == null && daysWorked == null) continue
    draft.push({
      name,
      fat_bruto: fat,
      dias_trabalhados: daysWorked,
      dias_uteis_salao: openDays,
      media_dia_trabalhado: mediaTrab,
      media_dia_salao: mediaSalao,
      constancia_pct: constancia,
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

  return {
    month: args.month,
    from: args.from,
    to: args.to,
    mtd: args.mtd,
    reference_day: args.referenceDay,
    salon_open_days: args.salonOpenDays,
    media_dias_trabalhados: mediaDias,
    indice,
    professionals,
    note:
      'Constância = dias com visita Avec ÷ dias úteis do salão. Índice = média das constâncias. Δ índice = (dias veio ÷ média de dias veio da unidade − 1) × 100.',
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

/**
 * Carrega índice para o mês (MTD se corrente).
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

  const latest = await getSalonP1DailyNear(window.to, { maxSkewDays: 14 })
  const pros = asJsonArray<P1ProfessionalRow>(latest?.professionals)
  const fatByPro = new Map<string, number>()
  for (const p of pros) {
    const name = String(p.name ?? '').trim()
    if (!name) continue
    const rev = Number(p.revenue)
    if (!Number.isFinite(rev)) continue
    fatByPro.set(name, rev)
  }

  const [salonOpenDays, daysByVisitKey] = await Promise.all([
    countSalonOpenDays(window.from, window.to),
    loadVisitDaysByPro(window.from, window.to),
  ])

  return buildDailyPerformanceIndex({
    month: window.month,
    from: window.from,
    to: window.to,
    mtd: window.mtd,
    referenceDay: latest?.day ?? null,
    salonOpenDays,
    fatByPro,
    daysByVisitKey,
  })
}
