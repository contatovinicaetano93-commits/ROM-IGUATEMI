'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Wallet, Boxes, GraduationCap, Stethoscope, FileBarChart } from 'lucide-react'
import { BOTTOM_NAV } from './nav'

const FINANCE_BOTTOM_NAV = [
  { href: '/financeiro', shortLabel: 'Financeiro', icon: Wallet },
  { href: '/relatorios', shortLabel: 'Relatórios', icon: FileBarChart },
  { href: '/estoque', shortLabel: 'Estoque', icon: Boxes },
  { href: '/onboarding', shortLabel: 'Onboarding', icon: GraduationCap },
]
const STOCK_BOTTOM_NAV = [
  { href: '/estoque', shortLabel: 'Estoque', icon: Boxes },
  { href: '/estoque/diagnostico', shortLabel: 'Diagnóstico', icon: Stethoscope },
  { href: '/onboarding', shortLabel: 'Onboarding', icon: GraduationCap },
]

export function BottomNav() {
  const pathname = usePathname()
  const [role, setRole] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/auth/session', { credentials: 'include', cache: 'no-store' })
      .then((r) => r.json())
      .then((json) => setRole(json.data?.role ?? null))
      .catch(() => setRole(null))
  }, [])

  // Financeiro/estoque são isolados pelo middleware — bottom nav própria,
  // sem abas que só levariam a um redirect de volta.
  const items = role === 'financeiro' ? FINANCE_BOTTOM_NAV : role === 'estoque' ? STOCK_BOTTOM_NAV : BOTTOM_NAV

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 backdrop-blur pb-[env(safe-area-inset-bottom)] lg:hidden">
      <div className="mx-auto flex w-full max-w-lg">
        {items.map(({ href, shortLabel, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`)
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className="relative flex flex-1 flex-col items-center gap-1 py-3 text-xs"
            >
              {active && <span className="absolute top-0 h-0.5 w-10 rounded-full bg-gold" />}
              <Icon
                size={22}
                strokeWidth={active ? 2.4 : 1.8}
                className={active ? 'text-gold' : 'text-muted'}
              />
              <span className={`tracking-wide ${active ? 'text-gold' : 'text-muted'}`}>{shortLabel}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
