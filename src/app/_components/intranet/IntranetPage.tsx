import type { ReactNode } from 'react'
import Link from 'next/link'

export function IntranetPage({
  title,
  kicker,
  children,
}: {
  title: string
  kicker?: string
  children: ReactNode
}) {
  return (
    <main className="mx-auto max-w-[1100px] px-4 py-8 lg:px-8">
      {kicker && <p className="text-[0.7rem] uppercase tracking-[0.2em] text-muted">{kicker}</p>}
      <h1 className="font-serif text-3xl text-foreground">{title}</h1>
      <div className="mt-6">{children}</div>
      <p className="mt-10 text-sm">
        <Link href="/" className="text-gold-strong hover:underline">
          Voltar ao início
        </Link>
      </p>
    </main>
  )
}
