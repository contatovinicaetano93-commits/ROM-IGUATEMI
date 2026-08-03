'use client'

/** Itens por página em listas longas (catálogo, movimentos, etc.). */
export const LIST_PAGE_SIZE = 200

export type PageToken = number | 'ellipsis'

/**
 * Janela de páginas para UI: 1 … 3 - 4 - 5 … 8
 * (números clicáveis; reticências quando há buraco).
 */
export function buildPageTokens(current: number, totalPages: number): PageToken[] {
  if (totalPages <= 0) return []
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1)
  }

  const cur = Math.min(Math.max(1, current), totalPages)
  const pages = new Set<number>([1, totalPages, cur])
  for (let d = 1; d <= 2; d++) {
    if (cur - d >= 1) pages.add(cur - d)
    if (cur + d <= totalPages) pages.add(cur + d)
  }
  if (cur <= 3) {
    for (let p = 2; p <= 5; p++) pages.add(p)
  }
  if (cur >= totalPages - 2) {
    for (let p = totalPages - 4; p < totalPages; p++) {
      if (p > 1) pages.add(p)
    }
  }

  const sorted = [...pages].sort((a, b) => a - b)
  const tokens: PageToken[] = []
  for (let i = 0; i < sorted.length; i++) {
    const n = sorted[i]!
    if (i > 0 && n - sorted[i - 1]! > 1) tokens.push('ellipsis')
    tokens.push(n)
  }
  return tokens
}

export function listPageSlice<T>(items: T[], page: number, pageSize = LIST_PAGE_SIZE): T[] {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize))
  const safe = Math.min(Math.max(1, page), totalPages)
  const start = (safe - 1) * pageSize
  return items.slice(start, start + pageSize)
}

export function ListPagination({
  page,
  totalItems,
  pageSize = LIST_PAGE_SIZE,
  onPageChange,
  className = '',
}: {
  page: number
  totalItems: number
  pageSize?: number
  onPageChange: (page: number) => void
  className?: string
}) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
  if (totalItems <= pageSize) return null

  const safePage = Math.min(Math.max(1, page), totalPages)
  const tokens = buildPageTokens(safePage, totalPages)
  const from = (safePage - 1) * pageSize + 1
  const to = Math.min(safePage * pageSize, totalItems)

  return (
    <nav
      className={`mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between ${className}`}
      aria-label="Paginação da lista"
    >
      <p className="text-xs text-muted tabular-nums">
        {from}–{to} de {totalItems}
        <span className="text-muted/80"> · {pageSize}/página</span>
      </p>
      <div className="flex flex-wrap items-center gap-1 text-sm">
        {tokens.map((token, idx) => {
          if (token === 'ellipsis') {
            return (
              <span key={`e-${idx}`} className="px-1 text-muted" aria-hidden>
                …
              </span>
            )
          }
          const active = token === safePage
          return (
            <span key={token} className="inline-flex items-center">
              {idx > 0 && tokens[idx - 1] !== 'ellipsis' && (
                <span className="px-0.5 text-muted/50" aria-hidden>
                  -
                </span>
              )}
              <button
                type="button"
                onClick={() => onPageChange(token)}
                aria-current={active ? 'page' : undefined}
                className={`min-w-[1.75rem] rounded-md px-2 py-1 text-xs font-medium tabular-nums transition-colors ${
                  active
                    ? 'bg-gold/15 text-gold'
                    : 'text-muted hover:bg-card hover:text-foreground'
                }`}
              >
                {token}
              </button>
            </span>
          )
        })}
      </div>
    </nav>
  )
}
