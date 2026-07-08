'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Activity } from 'lucide-react'
import { APP_NAV, ADMIN_NAV } from './nav'
import { AdminSessionBar } from './AdminSessionBar'

export function DesktopSidebar() {
  const pathname = usePathname()

  return (
    <aside className="hidden lg:flex lg:w-64 lg:shrink-0 lg:flex-col border-r border-border bg-surface">
      <div className="flex items-baseline gap-1.5 border-b border-border px-6 py-6">
        <span className="font-mono text-xl font-semibold tracking-[0.2em] text-gold">ROM</span>
        <span className="text-[0.65rem] uppercase tracking-[0.3em] text-muted">Club</span>
      </div>

      <nav className="flex flex-1 flex-col gap-1 p-4">
        {APP_NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`)
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-colors ${
                active
                  ? 'border border-gold/40 bg-gold/10 text-gold'
                  : 'text-foreground/85 hover:bg-card hover:text-foreground'
              }`}
            >
              <Icon size={20} strokeWidth={active ? 2.2 : 1.8} />
              {label}
            </Link>
          )
        })}
      </nav>

      <div className="px-4 pb-2">
        <Link
          href={ADMIN_NAV.href}
          className={`flex items-center gap-3 rounded-xl px-4 py-2.5 text-xs text-muted transition-colors hover:bg-card hover:text-foreground ${
            pathname.startsWith('/admin') ? 'text-gold' : ''
          }`}
        >
          <Activity size={16} />
          {ADMIN_NAV.label}
        </Link>
      </div>

      <div className="border-t border-border px-4 py-4">
        <AdminSessionBar className="mb-4" />
        <div className="flex items-center gap-3 px-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gold text-sm font-bold text-background">
            R
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-gold-strong">ROM Iguatemi</p>
            <p className="text-xs text-muted">Recepção · ROM Club</p>
          </div>
        </div>
        <p className="mt-4 text-[0.65rem] text-muted/70">Onboarding &amp; KPIs · v0.1.0</p>
      </div>
    </aside>
  )
}
