'use client'

export function VisaoSection({
  title,
  hint,
  children,
}: {
  title: string
  hint: string
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-3">
      <header className="border-b border-border/80 pb-2">
        <h2 className="text-sm font-semibold tracking-wide text-foreground">{title}</h2>
        <p className="mt-0.5 text-xs text-muted">{hint}</p>
      </header>
      {children}
    </section>
  )
}
