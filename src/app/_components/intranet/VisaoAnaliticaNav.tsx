'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useClientSession } from '../SessionProvider'
import { canSeeNavHref, parseGrantableModules } from '@/lib/intranet/modules'

const TABS = [
  { href: '/dashboard', label: 'Visão' },
  { href: '/relatorios', label: 'Relatórios' },
] as const

export function VisaoAnaliticaNav() {
  const pathname = usePathname()
  const { session } = useClientSession()
  const role = session?.role
  const extras = parseGrantableModules(session?.modules)
  const tabs = TABS.filter((tab) => {
    if (!session) return false
    if (!session.auth_enabled) return true
    if (role == null) return false
    return canSeeNavHref(tab.href, role, extras)
  })

  if (tabs.length === 0) return null

  return (
    <nav className="mt-3 flex flex-wrap gap-2" aria-label="Seções da visão analítica">
      {tabs.map((tab) => {
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
                ? 'rounded-full bg-[#141210] px-3 py-1.5 text-xs font-medium text-white'
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
