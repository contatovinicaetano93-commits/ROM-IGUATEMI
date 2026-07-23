'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu, X, ChevronRight, Wallet, Boxes, GraduationCap, Stethoscope, FileBarChart } from 'lucide-react'
import { APP_NAV, ADMIN_NAV, pageTitleFromPath } from './nav'
import { AdminSessionBar } from './AdminSessionBar'
import { getBrand } from '@/lib/brand'

export function TopBar() {
  const [open, setOpen] = useState(false)
  const [showAdminNav, setShowAdminNav] = useState(false)
  const [role, setRole] = useState<string | null>(null)
  const pathname = usePathname()
  const title = pageTitleFromPath(pathname)
  const brand = getBrand()
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

  // Financeiro/estoque são isolados pelo middleware — menu próprio, sem links
  // mortos que só levariam a um redirect de volta.
  const isolatedLinks =
    role === 'financeiro'
      ? [
          { href: '/financeiro', label: 'Financeiro', icon: Wallet },
          { href: '/relatorios', label: 'Relatórios', icon: FileBarChart },
          { href: '/estoque', label: 'Estoque', icon: Boxes },
          { href: '/financeiro/diagnostico', label: 'Diagnóstico', icon: Stethoscope },
          { href: '/onboarding', label: 'Onboarding', icon: GraduationCap },
        ]
      : role === 'estoque'
        ? [
            { href: '/estoque', label: 'Estoque', icon: Boxes },
            { href: '/estoque/diagnostico', label: 'Diagnóstico', icon: Stethoscope },
            { href: '/onboarding', label: 'Onboarding', icon: GraduationCap },
          ]
        : null

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
        <div className="flex items-center justify-between gap-4 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] lg:px-8 lg:pt-4">
          {/* Mobile: menu + logo centralizado */}
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Abrir menu"
            className="flex h-9 w-9 items-center justify-center rounded-full text-foreground/90 active:bg-card lg:hidden"
          >
            <Menu size={22} />
          </button>

          <div className="min-w-0 flex-1 lg:flex lg:items-center lg:justify-between">
            <Link href="/hoje" className="flex items-baseline justify-center gap-1 lg:justify-start">
              <span className="font-mono text-lg font-semibold tracking-[0.2em] text-gold lg:hidden">{brand.shortMonogram}</span>
              <span className="text-[0.6rem] uppercase tracking-[0.3em] text-muted lg:hidden">{brand.locationSubtitle}</span>
              <span className="hidden text-lg font-semibold text-foreground lg:inline">{title}</span>
            </Link>
            <p className="mt-0.5 hidden text-xs text-muted lg:block">{brand.tagline}</p>
          </div>

          <div className="flex items-center gap-2 rounded-full border border-gold/30 bg-gold/10 py-1 pl-1 pr-3">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gold text-xs font-bold text-background">
              R
            </span>
            <div className="hidden leading-tight sm:block">
              <p className="text-[0.6rem] text-muted">{brand.displayName}</p>
              <p className="-mt-0.5 text-[0.7rem] font-semibold text-gold-strong">Recepção</p>
            </div>
          </div>
        </div>
      </header>

      {/* Drawer só no mobile — desktop usa sidebar fixa */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="animate-fade-in absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <aside className="animate-slide-in-left absolute inset-y-0 left-0 flex w-[82%] max-w-xs flex-col border-r border-border bg-surface pt-[env(safe-area-inset-top)]">
            <div className="flex items-center justify-between px-5 py-5">
              <div className="flex items-baseline gap-1">
                <span className="font-mono text-lg font-semibold tracking-[0.2em] text-gold">{brand.shortMonogram}</span>
                <span className="text-[0.6rem] uppercase tracking-[0.3em] text-muted">{brand.locationSubtitle}</span>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Fechar menu"
                className="flex h-8 w-8 items-center justify-center rounded-full text-muted active:bg-card"
              >
                <X size={20} />
              </button>
            </div>

            <nav className="flex flex-col gap-1 px-3">
              {(isolatedLinks ?? navItems).map(({ href, label, icon: Icon }) => {
                const active = pathname === href || pathname.startsWith(`${href}/`)
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setOpen(false)}
                    className={`flex items-center justify-between rounded-xl border px-3 py-3 text-sm transition-colors ${
                      active
                        ? 'border-gold/50 bg-gold/10 text-gold'
                        : 'border-transparent text-foreground/90 active:bg-card'
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      <Icon size={19} strokeWidth={active ? 2.2 : 1.8} />
                      {label}
                    </span>
                    <ChevronRight size={16} className={active ? 'text-gold/70' : 'text-muted'} />
                  </Link>
                )
              })}
            </nav>

            <div className="mt-auto space-y-4 px-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-6">
              {!isolatedLinks && (
                <Link
                  href={ADMIN_NAV.href}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2 rounded-xl px-2 py-2 text-xs text-muted active:text-foreground"
                >
                  {ADMIN_NAV.label}
                </Link>
              )}
              <AdminSessionBar />
              <p className="text-[0.65rem] text-muted">{brand.productName} · KPIs</p>
              <p className="text-[0.6rem] text-muted/70">v0.1.0</p>
            </div>
          </aside>
        </div>
      )}
    </>
  )
}
