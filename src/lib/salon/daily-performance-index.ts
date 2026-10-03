/**
 * Índice de Performance Diária (V1).
 *
 * Por profissional no período:
 * - fat_bruto: MTD 0021 (`salon_p1_daily`) no fim da janela
 * - dias_trabalhados: dias distintos em `salon_client_visits` (proxy de “veio”)
 * - media_dia_trabalhado = fat / dias_trabalhados
 * - media_dia_salao = fat / dias úteis com receita no salão
 *
 * Índice do salão = média das medias_dia_trabalhado dos profissionais elegíveis.
 * Delta = media_dia_trabalhado − índice (acima / abaixo).
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
  /** media_dia_trabalhado − índice do salão */
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
  /** Média das medias/dia trabalhado (só quem tem base). */
  indice: number | null
  professionals: DailyPerformanceProRow[]
  note: string
}

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
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

export function meanOf(values: number[]): number | null {
  if (values.length === 0) return null
  const sum = values.reduce((a, b) => a + b, 0)
  return roundMoney(sum / values.length)
}

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

  const medias: number[] = []
  const draft: Array<Omit<DailyPerformanceProRow, 'delta_indice' | 'standing'>> =
    []

  for (const name of p1Names) {
    const fatRaw = args.fatByPro.get(name)
    const fat =
      fatRaw != null && Number.isFinite(fatRaw) && fatRaw > 0.02
        ? roundMoney(fatRaw)
        : null
    const daysWorked = daysWorkedByP1.get(name) ?? null
    const openDays = args.salonOpenDays
    const mediaTrab = avgPerDay(fat, daysWorked)
    const mediaSalao = avgPerDay(fat, openDays)
    if (mediaTrab != null) medias.push(mediaTrab)
    // Só lista quem faturou ou veio — evita elenco Avec morto.
    if (fat == null && (daysWorked == null || daysWorked <= 0)) continue
    draft.push({
      name,
      fat_bruto: fat,
      dias_trabalhados: daysWorked != null && daysWorked > 0 ? daysWorked : null,
      dias_uteis_salao: openDays != null && openDays > 0 ? openDays : null,
      media_dia_trabalhado: mediaTrab,
      media_dia_salao: mediaSalao,
    })
  }

  const indice = meanOf(medias)
  const professionals: DailyPerformanceProRow[] = draft
    .map((row) => {
      const delta =
        row.media_dia_trabalhado != null && indice != null
          ? roundMoney(row.media_dia_trabalhado - indice)
          : null
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
    indice,
    professionals,
    note:
      'Dias trabalhados = dias com visita registrada no Avec (proxy de presença). Índice = média das médias/dia trabalhado.',
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
