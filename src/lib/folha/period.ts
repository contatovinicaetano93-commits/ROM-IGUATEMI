/**
 * Quinzenas da Folha (calendário America/Sao_Paulo).
 * 1ª: dias 1–15 · paga dia 20 do mesmo mês
 * 2ª: dia 16–fim · paga dia 05 do mês seguinte
 */

export type FolhaQuinzena = {
  id: string
  label: string
  from: string
  to: string
  half: 1 | 2
  yearMonth: string
  /** Data de pagamento (YYYY-MM-DD) — 20 (Q1) ou 05 do mês seguinte (Q2). */
  payDate: string
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

function lastDayOfMonth(year: number, month1to12: number): number {
  return new Date(Date.UTC(year, month1to12, 0)).getUTCDate()
}

function addMonths(year: number, month1to12: number, delta: number): { year: number; month: number } {
  const idx = year * 12 + (month1to12 - 1) + delta
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 }
}

/** Dia civil SP (YYYY-MM-DD). */
export function todayIsoSaoPaulo(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

export function payDateForHalf(yearMonth: string, half: 1 | 2): string {
  const m = /^(\d{4})-(\d{2})$/.exec(yearMonth)
  if (!m) throw new Error(`yearMonth inválido: ${yearMonth}`)
  const year = Number(m[1])
  const month = Number(m[2])
  if (half === 1) return `${yearMonth}-20`
  const next = addMonths(year, month, 1)
  return `${next.year}-${pad2(next.month)}-05`
}

export function quinzenaForYearMonthHalf(yearMonth: string, half: 1 | 2): FolhaQuinzena {
  const m = /^(\d{4})-(\d{2})$/.exec(yearMonth)
  if (!m) throw new Error(`yearMonth inválido: ${yearMonth}`)
  const year = Number(m[1])
  const month = Number(m[2])
  const last = lastDayOfMonth(year, month)
  if (half === 1) {
    return {
      id: `${yearMonth}-q1`,
      label: `1ª quinzena ${pad2(month)}/${year}`,
      from: `${yearMonth}-01`,
      to: `${yearMonth}-15`,
      half: 1,
      yearMonth,
      payDate: payDateForHalf(yearMonth, 1),
    }
  }
  return {
    id: `${yearMonth}-q2`,
    label: `2ª quinzena ${pad2(month)}/${year}`,
    from: `${yearMonth}-16`,
    to: `${yearMonth}-${pad2(last)}`,
    half: 2,
    yearMonth,
    payDate: payDateForHalf(yearMonth, 2),
  }
}

export function quinzenaForDay(day: string): FolhaQuinzena {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day)
  if (!m) {
    throw new Error(`dia inválido: ${day}`)
  }
  const yearMonth = `${m[1]}-${m[2]}`
  const dom = Number(m[3])
  return quinzenaForYearMonthHalf(yearMonth, dom <= 15 ? 1 : 2)
}

/** Parse `YYYY-MM-q1` / `YYYY-MM-q2`. */
export function parseFolhaPeriodId(id: string): FolhaQuinzena | null {
  const m = /^(\d{4}-\d{2})-q([12])$/i.exec(id.trim())
  if (!m) return null
  return quinzenaForYearMonthHalf(m[1], Number(m[2]) === 1 ? 1 : 2)
}

export function formatPayDateBr(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return iso
  return `${m[3]}/${m[2]}/${m[1]}`
}

/**
 * Lista quinzenas recentes (mais recente primeiro), cobrindo ~`count` períodos
 * a partir do mês da âncora (inclui o mês anterior para ver folha já fechada).
 */
export function listRecentQuinzenas(opts?: {
  today?: string
  count?: number
}): FolhaQuinzena[] {
  const today = opts?.today ?? todayIsoSaoPaulo()
  const count = opts?.count ?? 6
  const qToday = quinzenaForDay(today)
  const out: FolhaQuinzena[] = []
  let yearMonth = qToday.yearMonth
  let half: 1 | 2 = qToday.half

  while (out.length < count) {
    out.push(quinzenaForYearMonthHalf(yearMonth, half))
    if (half === 1) {
      // anterior = Q2 do mês passado
      half = 2
      const [y, m] = yearMonth.split('-').map(Number) as [number, number]
      const prev = addMonths(y, m, -1)
      yearMonth = `${prev.year}-${pad2(prev.month)}`
    } else {
      // anterior = Q1 do mesmo mês
      half = 1
    }
  }
  return out
}

/**
 * Âncora default da Folha: quinzena cujo pagamento está mais próximo
 * (ainda não passou), senão a última já paga.
 *
 * Ex.: em 01/10 → Q2/09 (paga 05/10); em 06/10 → Q1/10 (paga 20/10).
 */
export function defaultFolhaQuinzena(today = todayIsoSaoPaulo()): FolhaQuinzena {
  const recent = listRecentQuinzenas({ today, count: 8 })
  const upcoming = recent
    .filter((q) => q.payDate >= today)
    .sort((a, b) => a.payDate.localeCompare(b.payDate))
  if (upcoming[0]) return upcoming[0]
  return recent[0] ?? quinzenaForDay(today)
}

/** Resolve query `period` (id) ou `day` (YYYY-MM-DD) → quinzena. */
export function resolveFolhaQuinzena(opts?: {
  periodId?: string | null
  day?: string | null
  today?: string
}): FolhaQuinzena {
  const today = opts?.today ?? todayIsoSaoPaulo()
  if (opts?.periodId) {
    const parsed = parseFolhaPeriodId(opts.periodId)
    if (parsed) return parsed
  }
  if (opts?.day && /^\d{4}-\d{2}-\d{2}$/.test(opts.day)) {
    return quinzenaForDay(opts.day)
  }
  return defaultFolhaQuinzena(today)
}

/**
 * Quinzenas que o cron diário deve recalcular:
 * 1) a do próximo pagamento (default da Folha)
 * 2) a do calendário de hoje (acumulando comissões Avec), se for outra
 */
export function folhaQuinzenasForDailyRefresh(
  today = todayIsoSaoPaulo(),
): FolhaQuinzena[] {
  const upcomingPay = defaultFolhaQuinzena(today)
  const calendar = quinzenaForDay(today)
  if (upcomingPay.id === calendar.id) return [upcomingPay]
  return [upcomingPay, calendar]
}

/** YYYY-MM-DD → dd/mm/yyyy (query Avec). */
export function isoToBrDay(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) throw new Error(`dia ISO inválido: ${iso}`)
  return `${m[3]}/${m[2]}/${m[1]}`
}

/**
 * Fim do fetch 8123 da quinzena: não passa de `today` (quinzena em curso)
 * nem do `to` (quinzena fechada).
 */
export function clampQuinzenaFetchEnd(quinzena: FolhaQuinzena, today: string): string {
  if (today < quinzena.from) return quinzena.from
  if (today <= quinzena.to) return today
  return quinzena.to
}

/** Janela Avec (inicio/fim BR) da quinzena, cortada em `today`. */
export function quinzenaAvecRangeBr(
  quinzena: FolhaQuinzena,
  today = todayIsoSaoPaulo(),
): { inicio: string; fim: string; fimIso: string } {
  const fimIso = clampQuinzenaFetchEnd(quinzena, today)
  return {
    inicio: isoToBrDay(quinzena.from),
    fim: isoToBrDay(fimIso),
    fimIso,
  }
}

/**
 * DARF / DAS / mensalidade só abatem no pagamento do dia 20 (1ª quinzena).
 * E-mails fiscais chegam até o dia 15 do respectivo período.
 */
export function acceptsFolhaTaxExtras(half: 1 | 2): boolean {
  return half === 1
}

/**
 * Quinzena alvo do IMAP/colar fiscal: sempre a Q1 cujo pagamento (dia 20)
 * ainda não passou — ou a próxima Q1 se já passou o dia 20.
 *
 * Ex.: 01–20/10 → 2026-10-q1 (paga 20/10); 21/10 → 2026-11-q1 (paga 20/11).
 */
export function defaultFolhaTaxQuinzena(today = todayIsoSaoPaulo()): FolhaQuinzena {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(today)
  if (!m) return quinzenaForYearMonthHalf(today.slice(0, 7), 1)
  const year = Number(m[1])
  const month = Number(m[2])
  const day = Number(m[3])
  if (day <= 20) {
    return quinzenaForYearMonthHalf(`${year}-${pad2(month)}`, 1)
  }
  const next = addMonths(year, month, 1)
  return quinzenaForYearMonthHalf(`${next.year}-${pad2(next.month)}`, 1)
}
