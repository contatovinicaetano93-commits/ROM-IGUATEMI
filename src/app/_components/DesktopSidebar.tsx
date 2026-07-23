'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Activity, Wallet, GraduationCap, Boxes, Stethoscope, FileBarChart } from 'lucide-react'
import { APP_NAV, ADMIN_NAV } from './nav'
import { AdminSessionBar } from './AdminSessionBar'
import { getBrand } from '@/lib/brand'

export function DesktopSidebar() {
  const pathname = usePathname()
  const brand = getBrand()
  const [showAdminNav, setShowAdminNav] = useState(false)
  const [role, setRole] = useState<string | null>(null)
  const navItems = useMemo(
    () =>
      APP_NAV.filter((item) => !('adminOnly' in item) || !item.adminOnly || showAdminNav),
    [showAdminNav]
  )

  useEffect(() => {
    fetch('/api/auth/session', { credentials: 'include', cache: 'no-store' })
      .then((r) => r.json())
      .then((json) => {
        const session = json.data
        setShowAdminNav(!session?.auth_enabled || Boolean(session?.can_view_revenue))
        setRole(session?.role ?? null)
      })
      .catch(() => setShowAdminNav(false))
  }, [])

  // Financeiro tem acesso duplo (Financeiro + Estoque); Estoque é isolado só
  // no Estoque. Nenhum dos dois vê hoje/contatos/dashboard/admin — nav
  // própria, sem links mortos (que o middleware ia redirecionar de qualquer jeito).
  if (role === 'financeiro' || role === 'estoque') {
    const links =
      role === 'financeiro'
        ? [
            { href: '/financeiro', label: 'Financeiro', icon: Wallet },
            { href: '/relatorios', label: 'Relatórios', icon: FileBarChart },
            { href: '/estoque', label: 'Estoque', icon: Boxes },
          ]
        : [{ href: '/estoque', label: 'Estoque', icon: Boxes }]

    return (
      <aside className="hidden lg:flex lg:w-64 lg:shrink-0 lg:flex-col border-r border-border bg-surface">
        <div className="flex items-baseline gap-1.5 border-b border-border px-6 py-6">
          <span className="font-mono text-xl font-semibold tracking-[0.2em] text-gold">{brand.shortMonogram}</span>
          <span className="text-[0.65rem] uppercase tracking-[0.3em] text-muted">
            {role === 'financeiro' ? 'Financeiro' : 'Estoque'}
          </span>
        </div>
        <nav className="flex flex-1 flex-col gap-1 p-4">
          {links.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-colors ${
                pathname === href ? 'border border-gold/40 bg-gold/10 text-gold' : 'text-foreground/85 hover:bg-card hover:text-foreground'
              }`}
            >
              <Icon size={20} strokeWidth={pathname === href ? 2.2 : 1.8} />
              {label}
            </Link>
          ))}
          <Link
            href="/onboarding"
            className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-colors ${
              pathname.startsWith('/onboarding') ? 'border border-gold/40 bg-gold/10 text-gold' : 'text-foreground/85 hover:bg-card hover:text-foreground'
            }`}
          >
            <GraduationCap size={20} strokeWidth={pathname.startsWith('/onboarding') ? 2.2 : 1.8} />
            Onboarding
          </Link>
        </nav>
        <div className="flex flex-col gap-1 px-4 pb-2">
          <Link
            href={role === 'financeiro' ? '/financeiro/diagnostico' : '/estoque/diagnostico'}
            className="flex items-center gap-3 rounded-xl px-4 py-2.5 text-xs text-muted transition-colors hover:bg-card hover:text-foreground"
          >
            <Stethoscope size={16} />
            Diagnóstico
          </Link>
        </div>
        <div className="border-t border-border px-4 py-4">
          <AdminSessionBar />
        </div>
      </aside>
    )
  }

  return (
    <aside className="hidden lg:flex lg:w-64 lg:shrink-0 lg:flex-col border-r border-border bg-surface">
      <div className="flex items-baseline gap-1.5 border-b border-border px-6 py-6">
        <span className="font-mono text-xl font-semibold tracking-[0.2em] text-gold">{brand.shortMonogram}</span>
        <span className="text-[0.65rem] uppercase tracking-[0.3em] text-muted">{brand.locationSubtitle}</span>
      </div>

      <nav className="flex flex-1 flex-col gap-1 p-4">
        {navItems.map(({ href, label, icon: Icon }) => {
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

      <div className="flex flex-col gap-1 px-4 pb-2">
        {showAdminNav && (
          <>
            <Link
              href="/financeiro"
              className="flex items-center gap-3 rounded-xl px-4 py-2.5 text-xs text-muted transition-colors hover:bg-card hover:text-foreground"
            >
              <Wallet size={16} />
              Financeiro
            </Link>
            <Link
              href="/estoque"
              className="flex items-center gap-3 rounded-xl px-4 py-2.5 text-xs text-muted transition-colors hover:bg-card hover:text-foreground"
            >
              <Boxes size={16} />
              Estoque
            </Link>
          </>
        )}
        <Link
          href={ADMIN_NAV.href}
          className={`flex items-center gap-3 rounded-xl px-4 py-2.5 text-xs text-muted transition-colors hover:bg-card hover:text-foreground ${
            pathname === '/admin' || pathname === '/admin/' ? 'text-gold' : ''
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
            <p className="truncate text-sm font-medium text-gold-strong">Recepção</p>
            <p className="text-xs text-muted">{brand.receptionLabel}</p>
          </div>
        </div>
        <p className="mt-4 text-[0.65rem] text-muted/70">Onboarding &amp; KPIs · v0.1.0</p>
      </div>
    </aside>
  )
}
