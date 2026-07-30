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
