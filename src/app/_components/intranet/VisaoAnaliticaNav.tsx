'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useClientSession } from '../SessionProvider'
import { hasPanelModule, parseGrantableModules, type GrantableModuleKey } from '@/lib/intranet/modules'

const TABS: { href: string; label: string; key: GrantableModuleKey }[] = [
  { href: '/dashboard', label: 'Visão', key: 'dashboard' },
  { href: '/relatorios', label: 'Relatórios', key: 'relatorios' },
]

export function VisaoAnaliticaNav() {
  const pathname = usePathname()
  const { session } = useClientSession()
  const role = session?.role ?? null
  const extras = parseGrantableModules(session?.modules)
  const openAuth = Boolean(session && !session.auth_enabled)
  const tabs = TABS.filter((tab) => openAuth || (role != null && hasPanelModule(role, extras, tab.key)))

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
