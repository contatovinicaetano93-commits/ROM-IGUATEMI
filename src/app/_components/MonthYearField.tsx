'use client'

import { COMPARE_MONTHS_FROM } from '@/lib/salon/month-window'
import { todayIso } from '@/lib/salon/format'

const MONTHS_PT = [
  { value: '01', label: 'Jan' },
  { value: '02', label: 'Fev' },
  { value: '03', label: 'Mar' },
  { value: '04', label: 'Abr' },
  { value: '05', label: 'Mai' },
  { value: '06', label: 'Jun' },
  { value: '07', label: 'Jul' },
  { value: '08', label: 'Ago' },
  { value: '09', label: 'Set' },
  { value: '10', label: 'Out' },
  { value: '11', label: 'Nov' },
  { value: '12', label: 'Dez' },
] as const

const selectClass =
  'rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-gold'

function clampMonth(value: string, minMonth: string, maxMonth: string): string {
  if (value < minMonth) return minMonth
  if (value > maxMonth) return maxMonth
  return value
}

/** Seletor mês + ano em português (valor interno YYYY-MM). */
export function MonthYearField({
  value,
  onChange,
  allowEmpty = false,
  emptyLabel = 'Automático (ano passado)',
  minMonth = COMPARE_MONTHS_FROM,
  maxMonth,
  pickMonth,
  'aria-label': ariaLabel,
}: {
  value: string
  onChange: (next: string) => void
  allowEmpty?: boolean
  emptyLabel?: string
  /** Inclusive YYYY-MM — default Jan/2025. */
  minMonth?: string
  /** Inclusive YYYY-MM — default mês corrente. */
  maxMonth?: string
  /** Mês aberto ao sair de “Automático”. */
  pickMonth?: string
  'aria-label'?: string
}) {
  const today = todayIso()
  const cap = maxMonth ?? today.slice(0, 7)
  const minYear = Number(minMonth.slice(0, 4))
  const maxYear = Number(cap.slice(0, 4))
  const years = Array.from({ length: maxYear - minYear + 1 }, (_, i) => String(minYear + i))
  const isEmpty = allowEmpty && !value
  const month = isEmpty ? '' : value.slice(5, 7)
  const year = isEmpty ? '' : value.slice(0, 4)

  function emit(nextMonth: string, nextYear: string) {
    if (!/^\d{2}$/.test(nextMonth) || !/^\d{4}$/.test(nextYear)) return
    onChange(clampMonth(`${nextYear}-${nextMonth}`, minMonth, cap))
  }

  function pick() {
    const fallback = pickMonth && /^\d{4}-\d{2}$/.test(pickMonth) ? pickMonth : cap
    onChange(clampMonth(fallback, minMonth, cap))
  }

  if (isEmpty) {
    return (
      <select
        value="__auto__"
        onChange={(e) => {
          if (e.target.value === '__pick__') pick()
        }}
        className={selectClass}
        aria-label={ariaLabel}
      >
        <option value="__auto__">{emptyLabel}</option>
        <option value="__pick__">Escolher mês…</option>
      </select>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-label={ariaLabel}>
      <select
        value={month}
        onChange={(e) => emit(e.target.value, year || String(maxYear))}
        className={selectClass}
        aria-label={`${ariaLabel ?? 'Período'} — mês`}
      >
        {MONTHS_PT.map((m) => (
          <option key={m.value} value={m.value}>
            {m.label}
          </option>
        ))}
      </select>
      <select
        value={year}
        onChange={(e) => emit(month || '01', e.target.value)}
        className={selectClass}
        aria-label={`${ariaLabel ?? 'Período'} — ano`}
      >
        {!years.includes(year) && year ? <option value={year}>{year}</option> : null}
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
      {allowEmpty && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="rounded-full border border-border px-2.5 py-1.5 text-[0.65rem] uppercase tracking-wide text-muted transition-colors hover:bg-card hover:text-foreground"
        >
          Automático
        </button>
      )}
    </div>
  )
}
