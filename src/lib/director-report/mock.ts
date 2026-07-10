import daniFixture from './fixtures/0011-dani-mariniello.json'
import { previousMonth } from './period'
import type {
  DirectorProfessional,
  MonthKey,
  MonthRevenueRow,
  ProfessionalReturnBlock,
  ProfessionalRevenueBlock,
  QuarterKey,
  ReactivationClient,
  ReturnQuarterRow,
} from './types'

function spParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(now)
  const year = Number(parts.find((p) => p.type === 'year')?.value)
  const month = Number(parts.find((p) => p.type === 'month')?.value)
  return { year, month }
}

/** Série real da planilha FATURAMENTOVITOR (Vitor M) — 2025 + 2026. */
const VITOR_REVENUE_2025 = [51947, 55962, 54108, 49162, 60735, 44140, 50696, 41295, 39690, 46587, 49601, 62639]
const VITOR_TICKET_2025 = [577, 708, 644, 622, 613, 711, 938, 536, 610, 665, 670, 846]
const VITOR_REVENUE_2026 = [45928, 25413, 46496]
const VITOR_TICKET_2026 = [706, 726, 693]

const MONTH_LABELS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

function hash(s: string) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h
}

function scaleFromName(name: string) {
  const h = hash(name)
  return 0.55 + ((h % 70) / 100)
}

function buildMonthsForPro(pro: DirectorProfessional): MonthRevenueRow[] {
  const scale = pro.name === 'Vitor M' ? 1 : scaleFromName(pro.name)
  const rows: MonthRevenueRow[] = []

  for (let m = 0; m < 12; m++) {
    const revenue = Math.round(VITOR_REVENUE_2025[m]! * scale)
    const ticket = Math.round(VITOR_TICKET_2025[m]! * (0.92 + (hash(pro.name + m) % 20) / 100))
    const attended = ticket > 0 ? Math.max(1, Math.round(revenue / ticket)) : 0
    rows.push({
      month: `2025-${String(m + 1).padStart(2, '0')}` as MonthKey,
      label: `${MONTH_LABELS[m]} 2025`,
      revenue,
      ticket_avg: ticket,
      attended,
    })
  }

  const { year: nowY, month: nowM } = spParts()
  const endY = Math.max(2026, nowY)
  const endM = nowY > 2026 ? 12 : nowY === 2026 ? nowM : 3

  for (let y = 2026; y <= endY; y++) {
    const lastM = y === endY ? endM : 12
    for (let m = 0; m < lastM; m++) {
      const knownRev = y === 2026 ? VITOR_REVENUE_2026[m] : undefined
      const knownTicket = y === 2026 ? VITOR_TICKET_2026[m] : undefined
      const baseRev = knownRev ?? VITOR_REVENUE_2025[m]! * (0.85 + (hash(pro.name + y + m) % 30) / 100)
      const baseTicket =
        knownTicket ?? VITOR_TICKET_2025[m]! * (0.9 + (hash(pro.name + 't' + y + m) % 25) / 100)
      const revenue = Math.round(baseRev * scale)
      const ticket = Math.round(baseTicket * (0.92 + (hash(pro.name + String(y) + m) % 20) / 100))
      const attended = ticket > 0 ? Math.max(1, Math.round(revenue / ticket)) : 0
      rows.push({
        month: `${y}-${String(m + 1).padStart(2, '0')}` as MonthKey,
        label: `${MONTH_LABELS[m]} ${y}`,
        revenue,
        ticket_avg: ticket,
        attended,
      })
    }
  }

  return rows
}

function quarterList(): { key: QuarterKey; label: string }[] {
  const { year, month } = spParts()
  const currentQ = Math.ceil(month / 3)
  const out: { key: QuarterKey; label: string }[] = []
  for (let y = 2025; y <= year; y++) {
    const maxQ = y === year ? currentQ : 4
    for (let q = 1; q <= maxQ; q++) {
      out.push({ key: `${y}-Q${q}` as QuarterKey, label: `${q}º tri ${y}` })
    }
  }
  return out
}

function buildQuartersForPro(pro: DirectorProfessional): ReturnQuarterRow[] {
  const base = 0.38 + (hash(pro.name) % 25) / 100
  const rows: ReturnQuarterRow[] = []
  let prev: number | null = null
  const quarters = quarterList()
  for (let i = 0; i < quarters.length; i++) {
    const q = quarters[i]!
    const wobble = ((hash(pro.name + q.key) % 11) - 5) / 100
    const rate = Math.min(0.85, Math.max(0.2, base + wobble + i * 0.015))
    const clients_total = 40 + (hash(pro.id + q.key) % 80)
    const clients_returned = Math.round(clients_total * rate)
    rows.push({
      quarter: q.key,
      label: q.label,
      return_rate: Math.round(rate * 1000) / 1000,
      clients_total,
      clients_returned,
      delta_vs_prev: prev == null ? null : Math.round((rate - prev) * 1000) / 10,
    })
    prev = rate
  }
  return rows
}

function daysSince(iso: string) {
  const t = new Date(iso + 'T12:00:00').getTime()
  return Math.max(0, Math.floor((Date.now() - t) / 86400000))
}

/** Lista real Avec 0011 — Dani Mariniello (1º–2º tri 2026). */
function buildDaniReactivation(): ReactivationClient[] {
  const today = Date.now()
  return (daniFixture.clients as {
    name: string
    email: string | null
    phone: string | null
    mobile: string | null
    gender: string | null
    last_visit: string | null
  }[]).map((c) => {
    const last = c.last_visit ?? new Date(today - 60 * 86400000).toISOString().slice(0, 10)
    const days = daysSince(last)
    return {
      name: c.name,
      email: c.email,
      phone: c.phone,
      mobile: c.mobile,
      gender: c.gender,
      last_visit: last,
      days_since: days,
      suggested_action:
        days > 90
          ? 'Mensagem de retorno + oferta de manutenção'
          : 'Convite para reagendar no horário preferido',
    }
  })
}

const SAMPLE_CLIENTS = [
  'Mariana Oliveira',
  'Patricia Souza',
  'Camila Rocha',
  'Fernanda Lima',
  'Juliana Costa',
  'Beatriz Nunes',
  'Amanda Ribeiro',
  'Carolina Dias',
]

function buildSyntheticReactivation(pro: DirectorProfessional): ReactivationClient[] {
  const n = 4 + (hash(pro.id) % 4)
  const out: ReactivationClient[] = []
  for (let i = 0; i < n; i++) {
    const days = 45 + ((hash(pro.id + i) % 90) | 0)
    const d = new Date()
    d.setDate(d.getDate() - days)
    out.push({
      name: SAMPLE_CLIENTS[(hash(pro.id) + i) % SAMPLE_CLIENTS.length]!,
      email: null,
      phone: null,
      mobile: `119${String(80000000 + (hash(pro.id + String(i)) % 9999999)).padStart(8, '0')}`,
      gender: 'NAO ESPECIFICADO',
      last_visit: d.toISOString().slice(0, 10),
      days_since: days,
      suggested_action:
        days > 90
          ? 'Mensagem de retorno + oferta de manutenção'
          : 'Convite para reagendar no horário preferido',
    })
  }
  return out.sort((a, b) => b.days_since - a.days_since)
}

function buildReactivation(pro: DirectorProfessional): ReactivationClient[] {
  if (pro.name === 'Dani Mariniello' || pro.id === 'pro-dani-mariniello') {
    return buildDaniReactivation()
  }
  return buildSyntheticReactivation(pro)
}

export function buildMockReturnBlocks(
  professionals: DirectorProfessional[],
  selectedQuarter: QuarterKey,
  compareQuarter: QuarterKey
): ProfessionalReturnBlock[] {
  return professionals.map((professional) => {
    const quarters = buildQuartersForPro(professional)
    // Dani: taxa alinhada ao volume real da lista 0011
    if (professional.name === 'Dani Mariniello') {
      const n = daniFixture.clients.length
      const q1 = quarters.find((q) => q.quarter === '2026-Q1')
      if (q1) {
        q1.clients_total = n
        q1.clients_returned = Math.round(n * 0.42)
        q1.return_rate = 0.42
      }
    }
    return {
      professional,
      quarters,
      selected_quarter: selectedQuarter,
      compare_quarter: compareQuarter,
      reactivation: buildReactivation(professional),
    }
  })
}

export function buildMockRevenueBlocks(
  professionals: DirectorProfessional[],
  selectedMonth: MonthKey
): ProfessionalRevenueBlock[] {
  return professionals.map((professional) => ({
    professional,
    months: buildMonthsForPro(professional),
    selected_month: selectedMonth,
  }))
}

/** Mês atual (fuso America/Sao_Paulo) — usado pelo cron e UI sem filtro. */
export function defaultSelectedMonth(now = new Date()): MonthKey {
  const { year, month } = spParts(now)
  return `${year}-${String(month).padStart(2, '0')}` as MonthKey
}

export function defaultCompareMonth(now = new Date()): MonthKey {
  return previousMonth(defaultSelectedMonth(now))
}

export function defaultSelectedQuarter(now = new Date()): QuarterKey {
  const { year, month } = spParts(now)
  const q = Math.ceil(month / 3) as 1 | 2 | 3 | 4
  return `${year}-Q${q}` as QuarterKey
}

export function defaultCompareQuarter(now = new Date()): QuarterKey {
  const selected = defaultSelectedQuarter(now)
  const [y, qStr] = selected.split('-Q')
  const year = Number(y)
  const q = Number(qStr)
  if (q === 1) return `${year - 1}-Q4` as QuarterKey
  return `${year}-Q${q - 1}` as QuarterKey
}
