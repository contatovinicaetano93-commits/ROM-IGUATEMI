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

const MONTH_LABELS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

function hash(s: string) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h
}

/** Série sintética por profissional — sem dado real, só para visualizar o layout do relatório. */
function buildMonthsForPro(pro: DirectorProfessional): MonthRevenueRow[] {
  const base = 25000 + (hash(pro.name) % 20000)
  const rows: MonthRevenueRow[] = []
  const { year: nowY, month: nowM } = spParts()

  for (let y = 2025; y <= nowY; y++) {
    const lastM = y === nowY ? nowM : 12
    for (let m = 0; m < lastM; m++) {
      const wobble = 0.8 + (hash(pro.name + y + m) % 40) / 100
      const revenue = Math.round(base * wobble)
      const ticket = Math.round(500 * (0.85 + (hash(pro.name + 't' + y + m) % 30) / 100))
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

export function buildMockReturnBlocks(
  professionals: DirectorProfessional[],
  selectedQuarter: QuarterKey,
  compareQuarter: QuarterKey
): ProfessionalReturnBlock[] {
  return professionals.map((professional) => ({
    professional,
    quarters: buildQuartersForPro(professional),
    selected_quarter: selectedQuarter,
    compare_quarter: compareQuarter,
    reactivation: buildSyntheticReactivation(professional),
  }))
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
