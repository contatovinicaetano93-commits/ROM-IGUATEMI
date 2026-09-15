'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Bell,
  Boxes,
  ClipboardList,
  Home,
  LayoutDashboard,
  MoreHorizontal,
  Sun,
  Users,
  Wallet,
  X,
} from 'lucide-react'
import { useClientSession } from './SessionProvider'

const CORE = [
  { href: '/', shortLabel: 'Início', icon: Home },
  { href: '/hoje', shortLabel: 'Hoje', icon: Sun },
  { href: '/flow', shortLabel: 'Tarefas', icon: ClipboardList },
  { href: '/contatos', shortLabel: 'Contatos', icon: Users },
]

export function BottomNav({ light: _light = false }: { light?: boolean }) {
  const pathname = usePathname()
  const { session } = useClientSession()
  const role = session?.role ?? null
  const [more, setMore] = useState(false)

  const items =
    role === 'estoque'
      ? [
          { href: '/', shortLabel: 'Início', icon: Home },
          { href: '/estoque', shortLabel: 'Estoque', icon: Boxes },
          { href: '/flow', shortLabel: 'Tarefas', icon: ClipboardList },
          { href: '/hoje', shortLabel: 'Hoje', icon: Sun },
        ]
      : role === 'financeiro'
        ? [
            { href: '/', shortLabel: 'Início', icon: Home },
            { href: '/financeiro', shortLabel: 'Financeiro', icon: Wallet },
            { href: '/flow', shortLabel: 'Tarefas', icon: ClipboardList },
            { href: '/hoje', shortLabel: 'Hoje', icon: Sun },
          ]
        : CORE

  const canOpenDashboard = role === 'admin' || Boolean(session && !session.auth_enabled)
  const extras = [
    { href: '/pipeline', label: 'Pipeline' },
    { href: '/pessoas', label: 'Pessoas' },
    { href: '/empresa', label: 'Empresa' },
    { href: '/rh', label: 'RH' },
    { href: '/treinamentos', label: 'Treinamentos' },
    { href: '/ajuda', label: 'Ajuda' },
    ...(role === 'admin' ? [{ href: '/dashboard', label: 'Rom Adm' }] : []),
    ...(role === 'admin' || role === 'financeiro'
      ? [
          { href: '/relatorios', label: 'Relatórios' },
          { href: '/financeiro', label: 'Financeiro' },
        ]
      : []),
    ...(role === 'admin' || role === 'financeiro' || role === 'estoque'
      ? [{ href: '/estoque', label: 'Estoque' }]
      : []),
  ]

  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 backdrop-blur pb-[env(safe-area-inset-bottom)] lg:hidden">
        <div className="mx-auto flex w-full max-w-lg">
          {items.map(({ href, shortLabel, icon: Icon }) => {
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
          <button
            type="button"
            onClick={() => setMore(true)}
            className="relative flex flex-1 flex-col items-center gap-1 py-3 text-xs text-muted"
          >
            <MoreHorizontal size={22} />
            <span>Mais</span>
          </button>
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
              {extras.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMore(false)}
                  className="rounded-xl border border-border px-3 py-3 text-sm"
                >
                  {item.label}
                </Link>
              ))}
              {canOpenDashboard && (
                <Link
                  href="/dashboard"
                  onClick={() => setMore(false)}
                  className="rounded-xl border border-border px-3 py-3 text-sm"
                >
                  <span className="inline-flex items-center gap-2">
                    <LayoutDashboard size={16} /> Visão analítica
                  </span>
                </Link>
              )}
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
