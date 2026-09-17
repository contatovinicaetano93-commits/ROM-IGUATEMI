import type { ReactNode } from 'react'

/**
 * Chrome dos módulos novos da intranet — mesmo enquadramento de Agenda do dia / Visão analítica:
 * largura 1600, kicker dourado, título sans semibold (Playfair fica só na marca e na home).
 */
export function IntranetPage({
  title,
  kicker,
  subtitle,
  actions,
  children,
}: {
  title: string
  kicker?: string
  subtitle?: ReactNode
  actions?: ReactNode
  children?: ReactNode
}) {
  return (
    <main className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-5 px-5 py-6 lg:gap-6 lg:px-8 lg:py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          {kicker ? (
            <p className="text-[0.65rem] uppercase tracking-[0.25em] text-gold">{kicker}</p>
          ) : null}
          <h1 className="mt-1 text-xl font-semibold lg:text-2xl">{title}</h1>
          {subtitle ? <div className="mt-1 text-sm text-muted">{subtitle}</div> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </main>
  )
}
