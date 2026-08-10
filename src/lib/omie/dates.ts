/** Datas Omie (dd/mm/yyyy) ↔ ISO (yyyy-mm-dd). */

export function omieBrToIso(br: string | null | undefined): string | null {
  if (!br) return null
  const m = br.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!m) return null
  const [, dd, mm, yyyy] = m
  return `${yyyy}-${mm}-${dd}`
}

export function omieIsoToBr(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-')
  if (!y || !m || !d) throw new Error(`Data ISO inválida: ${iso}`)
  return `${d}/${m}/${y}`
}

/** Intervalo completo do mês (não MTD) — sync Omie por vencimento. */
export function omieFullMonthRange(monthKey: string): { from: string; to: string } {
  if (!/^\d{4}-\d{2}$/.test(monthKey)) {
    throw new Error(`Mês inválido: ${monthKey}`)
  }
  const [y, m] = monthKey.split('-').map(Number)
  const lastDay = new Date(Date.UTC(y!, m!, 0)).getUTCDate()
  return {
    from: `${monthKey}-01`,
    to: `${monthKey}-${String(lastDay).padStart(2, '0')}`,
  }
}

/**
 * Meses YYYY-MM de jan/ano até o mês âncora (inclusive).
 * Usado no sync Omie YTD — MoM de despesas em qualquer mês do ano.
 */
export function omieYearMonthKeysThrough(anchorIsoOrMonth: string): string[] {
  const monthKey = /^\d{4}-\d{2}$/.test(anchorIsoOrMonth)
    ? anchorIsoOrMonth
    : anchorIsoOrMonth.slice(0, 7)
  if (!/^\d{4}-\d{2}$/.test(monthKey)) {
    throw new Error(`Mês inválido: ${anchorIsoOrMonth}`)
  }
  const year = Number(monthKey.slice(0, 4))
  const endMonth = Number(monthKey.slice(5, 7))
  if (!Number.isFinite(year) || endMonth < 1 || endMonth > 12) {
    throw new Error(`Mês inválido: ${anchorIsoOrMonth}`)
  }
  const keys: string[] = []
  for (let m = 1; m <= endMonth; m += 1) {
    keys.push(`${year}-${String(m).padStart(2, '0')}`)
  }
  return keys
}
