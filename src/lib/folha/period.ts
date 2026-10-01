/**
 * Quinzenas da Folha (calendário America/Sao_Paulo).
 * 1ª: dias 1–15 · 2ª: dia 16–fim do mês.
 */

export type FolhaQuinzena = {
  id: string
  label: string
  from: string
  to: string
  half: 1 | 2
  yearMonth: string
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

function lastDayOfMonth(year: number, month1to12: number): number {
  return new Date(Date.UTC(year, month1to12, 0)).getUTCDate()
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

export function quinzenaForDay(day: string): FolhaQuinzena {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day)
  if (!m) {
    throw new Error(`dia inválido: ${day}`)
  }
  const year = Number(m[1])
  const month = Number(m[2])
  const dom = Number(m[3])
  const yearMonth = `${m[1]}-${m[2]}`
  const last = lastDayOfMonth(year, month)

  if (dom <= 15) {
    return {
      id: `${yearMonth}-q1`,
      label: `1ª quinzena ${pad2(month)}/${year}`,
      from: `${yearMonth}-01`,
      to: `${yearMonth}-15`,
      half: 1,
      yearMonth,
    }
  }

  return {
    id: `${yearMonth}-q2`,
    label: `2ª quinzena ${pad2(month)}/${year}`,
    from: `${yearMonth}-16`,
    to: `${yearMonth}-${pad2(last)}`,
    half: 2,
    yearMonth,
  }
}
