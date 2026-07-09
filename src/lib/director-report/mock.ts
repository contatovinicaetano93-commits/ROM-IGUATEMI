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
  return 0.55 + ((h % 70) / 100) // 0.55–1.24
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

  for (let m = 0; m < VITOR_REVENUE_2026.length; m++) {
    const revenue = Math.round(VITOR_REVENUE_2026[m]! * scale)
    const ticket = Math.round(VITOR_TICKET_2026[m]! * (0.92 + (hash(pro.name + '26' + m) % 20) / 100))
    const attended = ticket > 0 ? Math.max(1, Math.round(revenue / ticket)) : 0
    rows.push({
      month: `2026-${String(m + 1).padStart(2, '0')}` as MonthKey,
      label: `${MONTH_LABELS[m]} 2026`,
      revenue,
      ticket_avg: ticket,
      attended,
    })
  }

  return rows
}

const QUARTERS: { key: QuarterKey; label: string }[] = [
  { key: '2025-Q1', label: '1º tri 2025' },
  { key: '2025-Q2', label: '2º tri 2025' },
  { key: '2025-Q3', label: '3º tri 2025' },
  { key: '2025-Q4', label: '4º tri 2025' },
  { key: '2026-Q1', label: '1º tri 2026' },
]

function buildQuartersForPro(pro: DirectorProfessional): ReturnQuarterRow[] {
  const base = 0.38 + (hash(pro.name) % 25) / 100 // 38–62%
  const rows: ReturnQuarterRow[] = []
  let prev: number | null = null
  for (let i = 0; i < QUARTERS.length; i++) {
    const q = QUARTERS[i]!
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

function buildReactivation(pro: DirectorProfessional): ReactivationClient[] {
  const n = 4 + (hash(pro.id) % 4)
  const out: ReactivationClient[] = []
  for (let i = 0; i < n; i++) {
    const days = 45 + ((hash(pro.id + i) % 90) | 0)
    const d = new Date()
    d.setDate(d.getDate() - days)
    out.push({
      name: SAMPLE_CLIENTS[(hash(pro.id) + i) % SAMPLE_CLIENTS.length]!,
      phone: `+55119${String(80000000 + (hash(pro.id + String(i)) % 9999999)).padStart(8, '0')}`,
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
  return professionals.map((professional) => {
    const quarters = buildQuartersForPro(professional)
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

export function defaultSelectedMonth(): MonthKey {
  return '2026-03'
}

export function defaultSelectedQuarter(): QuarterKey {
  return '2026-Q1'
}

export function defaultCompareQuarter(): QuarterKey {
  return '2025-Q1'
}
