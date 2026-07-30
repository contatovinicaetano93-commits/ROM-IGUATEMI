/**
 * Movimentos Omie Contas a Pagar que NÃO são despesa operacional do salão.
 * Ex.: TED entre contas (2.16.*) e adiantamento de lucro (2.18.*) —
 * incham o P&L sem ser gasto da operação.
 */

const NON_OPERATING_CODE_PREFIXES = ['2.16', '2.18'] as const

const NON_OPERATING_NAME_SNIPPETS = [
  'ted entre contas',
  'transferência entre contas',
  'transferencia entre contas',
  'adiantamento de lucro',
] as const

export function isOmieNonOperatingCategoryCode(code: string | null | undefined): boolean {
  const c = (code ?? '').trim()
  if (!c) return false
  return NON_OPERATING_CODE_PREFIXES.some((p) => c === p || c.startsWith(`${p}.`) || c.startsWith(p))
}

export function isOmieNonOperatingExpense(opts: {
  source?: string | null
  categoryCode?: string | null
  categoryName?: string | null
  description?: string | null
}): boolean {
  if (opts.source != null && opts.source !== 'omie') return false
  if (isOmieNonOperatingCategoryCode(opts.categoryCode)) return true
  const hay = `${opts.categoryName ?? ''} ${opts.description ?? ''}`.toLowerCase()
  return NON_OPERATING_NAME_SNIPPETS.some((s) => hay.includes(s))
}
