/**
 * Skeleton de rota — mesmo chrome de `IntranetPage` para transição fluida entre seções.
 * Usado em `loading.tsx` do App Router (paint imediato sem página em branco).
 */
export function IntranetPageSkeleton({
  kicker = true,
  cards = 3,
}: {
  kicker?: boolean
  cards?: number
}) {
  const n = Math.min(Math.max(cards, 1), 3)
  const gridClass =
    n >= 3 ? 'grid gap-3 sm:grid-cols-3' : n === 2 ? 'grid gap-3 sm:grid-cols-2' : 'grid gap-3'

  return (
    <main className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-5 px-5 py-6 lg:gap-6 lg:px-8 lg:py-8">
      <div className="min-w-0">
        {kicker ? <div className="h-3 w-20 animate-pulse rounded bg-gold/25" /> : null}
        <div className="mt-2 h-7 w-48 animate-pulse rounded-lg bg-card" />
        <div className="mt-2 h-4 w-72 max-w-full animate-pulse rounded bg-border/80" />
      </div>
      <div className={gridClass}>
        {Array.from({ length: n }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl border border-border bg-card" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-2xl border border-border bg-card" />
    </main>
  )
}
