/**
 * Movimentos Omie Contas a Pagar que NÃO são despesa operacional do salão.
 *
 * Planos de contas diferem entre BR e IG:
 * - IG: adiantamento de lucro em 2.18.*; distribuição em 2.17.99
 * - BR: adiantamento de lucro em 2.17.*; 2.18.* = amortização (opex possível)
 * Por isso o filtro combina prefixos seguros + nomes de categoria/descrição.
 */

/** Prefixo seguro nos dois CNPJs (movimentações / lucro / transferência). */
const NON_OPERATING_CODE_PREFIXES = [
  '0.01', // Transferência
  '2.16', // Movimentações entre contas / TED / mútuos
  '2.17', // Adiantamento/distribuição de lucros (BR e IG)
  '2.24', // Distribuição Lucros (BR)
] as const

const NON_OPERATING_NAME_SNIPPETS = [
  'ted entre contas',
  'transferência entre contas',
  'transferencia entre contas',
  'saída de transferência',
  'saida de transferencia',
  'entrada de transferência',
  'entrada de transferencia',
  'adiantamento de lucro',
  'distribuição de lucro',
  'distribuicao de lucro',
  'distribuição lucros',
  'distribuicao lucros',
  'mútuo',
  'mutuo',
  'empréstimos sócios',
  'emprestimos socios',
  'empréstimo sócio',
  'emprestimo socio',
  'aplicação automática',
  'aplicacao automatica',
  'ajuste de saldo',
] as const

export function isOmieNonOperatingCategoryCode(code: string | null | undefined): boolean {
  const c = (code ?? '').trim()
  if (!c) return false
  return NON_OPERATING_CODE_PREFIXES.some((p) => c === p || c.startsWith(`${p}.`))
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
