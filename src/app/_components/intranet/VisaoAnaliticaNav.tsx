'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { href: '/dashboard', label: 'Visão' },
  { href: '/relatorios', label: 'Relatórios' },
] as const

export function VisaoAnaliticaNav() {
  const pathname = usePathname()

  return (
    <nav className="mt-3 flex flex-wrap gap-2" aria-label="Seções da visão analítica">
      {TABS.map((tab) => {
        const active =
          tab.href === '/dashboard'
            ? pathname === '/dashboard' || pathname === '/adm' || pathname.startsWith('/adm/')
            : pathname === tab.href || pathname.startsWith(`${tab.href}/`)
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={
              active
                ? 'rounded-full bg-[#1c1916] px-3 py-1.5 text-xs font-medium text-white'
                : 'rounded-full border border-border bg-background px-3 py-1.5 text-xs text-muted hover:text-foreground'
            }
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
