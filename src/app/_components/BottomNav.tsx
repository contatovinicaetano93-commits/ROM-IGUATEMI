'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Bell,
  Boxes,
  CalendarDays,
  ClipboardList,
  Home,
  LayoutDashboard,
  MoreHorizontal,
  Newspaper,
  Sun,
  Users,
  Wallet,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useClientSession } from './SessionProvider'
import { parseGrantableModules } from '@/lib/intranet/modules'
import { resolveBottomNav } from '@/lib/intranet/bottom-nav'

const ICONS: Record<string, LucideIcon> = {
  '/': Home,
  '/financeiro': Wallet,
  '/estoque': Boxes,
  '/flow': ClipboardList,
  '/hoje': Sun,
  '/contatos': Users,
  '/pipeline': CalendarDays,
  '/dashboard': LayoutDashboard,
  '/relatorios': LayoutDashboard,
  '/empresa': Newspaper,
  '/meu-faturamento': Wallet,
  '/recepcao': Users,
  '/pos-venda': Users,
}

function iconFor(href: string): LucideIcon {
  return ICONS[href] ?? Home
}

export function BottomNav({ light: _light = false }: { light?: boolean }) {
  const pathname = usePathname()
  const { session } = useClientSession()
  const role = session?.role ?? null
  const extras = parseGrantableModules(session?.modules)
  const openAuth = Boolean(session && !session.auth_enabled)
  const [more, setMore] = useState(false)

  const { dock: items, more: extrasMenu } = useMemo(
    () => resolveBottomNav(role, extras, { openAuth }),
    [extras, openAuth, role],
  )

  if (items.length === 0) return null

  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 backdrop-blur pb-[env(safe-area-inset-bottom)] lg:hidden">
        <div className="mx-auto flex w-full max-w-lg">
          {items.map(({ href, shortLabel }) => {
            const Icon = iconFor(href)
            const active = href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`)
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                className="relative flex flex-1 flex-col items-center gap-1 py-3 text-xs"
              >
                {active && <span className="absolute top-0 h-0.5 w-10 rounded-full bg-gold" />}
                <Icon size={22} strokeWidth={active ? 2.4 : 1.8} className={active ? 'text-gold' : 'text-muted'} />
                <span className={active ? 'text-gold' : 'text-muted'}>{shortLabel}</span>
              </Link>
            )
          })}
          {extrasMenu.length > 0 ? (
            <button
              type="button"
              onClick={() => setMore(true)}
              className="relative flex flex-1 flex-col items-center gap-1 py-3 text-xs text-muted"
            >
              <MoreHorizontal size={22} />
              <span>Mais</span>
            </button>
          ) : null}
        </div>
      </nav>

      {more && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMore(false)} />
          <div className="absolute inset-x-0 bottom-0 rounded-t-3xl border-t border-border bg-surface px-5 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold">Mais da intranet</p>
              <button type="button" aria-label="Fechar" onClick={() => setMore(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {extrasMenu.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMore(false)}
                  className="rounded-xl border border-border px-3 py-3 text-sm"
                >
                  {item.label}
                </Link>
              ))}
              <Link href="/" onClick={() => setMore(false)} className="rounded-xl border border-border px-3 py-3 text-sm">
                <span className="inline-flex items-center gap-2">
                  <Bell size={16} /> Notícias
                </span>
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
