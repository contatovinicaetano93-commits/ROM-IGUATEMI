'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Bell, Menu, Search, X } from 'lucide-react'
import { INTRANET_NAV } from './nav'
import { useClientSession } from '../SessionProvider'
import { getBrand } from '@/lib/brand'
import { LogoutButton } from '../LogoutButton'

const SEARCH_TARGETS = [
  { href: '/', label: 'Início' },
  { href: '/pessoas', label: 'Pessoas' },
  { href: '/empresa', label: 'MKT Notícias' },
  { href: '/rh', label: 'RH e benefícios' },
  { href: '/flow', label: 'Rom Flow · solicitações' },
  { href: '/hoje', label: 'Operação · Hoje' },
  { href: '/pipeline', label: 'Pipeline' },
  { href: '/contatos', label: 'Contatos' },
  { href: '/dashboard', label: 'Rom Adm · visão analítica' },
  { href: '/relatorios', label: 'Relatórios' },
  { href: '/financeiro', label: 'Financeiro e Omie' },
  { href: '/estoque', label: 'Estoque' },
  { href: '/treinamentos', label: 'Treinamentos' },
  { href: '/onboarding', label: 'Onboarding' },
  { href: '/ajuda', label: 'Ajuda e suporte' },
]

export function IntranetTopNav() {
  const pathname = usePathname()
  const brand = getBrand()
  const { session } = useClientSession()
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const name = session?.displayName || session?.user || 'Equipe'
  const initial = name.trim().charAt(0).toUpperCase() || 'R'
  const role = session?.role
  const links = INTRANET_NAV.filter((item) => {
    if (!('roles' in item) || !item.roles) return true
    if (!session) return false
    if (!session.auth_enabled) return true
    return role != null && (item.roles as readonly string[]).includes(role)
  })

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (q.length < 2) return []
    return SEARCH_TARGETS.filter((item) => item.label.toLowerCase().includes(q) || item.href.includes(q)).slice(0, 8)
  }, [query])

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-border bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] items-center gap-4 px-4 py-3 lg:px-8">
          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center text-foreground lg:hidden"
            aria-label="Abrir menu"
            onClick={() => setMenuOpen(true)}
          >
            <Menu size={22} />
          </button>
          <Link href="/" className="font-serif text-2xl tracking-[0.18em] text-foreground">
            {brand.shortMonogram}
          </Link>
          <nav className="hidden flex-1 items-center justify-center gap-6 text-[0.82rem] text-muted lg:flex">
            {links.map((item) => {
              const active = item.href === '/' ? pathname === '/' : pathname === item.href || pathname.startsWith(`${item.href}/`)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={active ? 'text-foreground' : 'hover:text-foreground'}
                >
                  {item.label}
                </Link>
              )
            })}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              className="hidden h-10 items-center gap-2 rounded-full border border-border bg-background px-4 text-sm text-muted lg:flex"
              onClick={() => setSearchOpen(true)}
            >
              <Search size={16} />
              Pesquisar na intranet…
            </button>
            <button
              type="button"
              className="flex h-10 w-10 items-center justify-center rounded-full text-foreground lg:hidden"
              aria-label="Buscar"
              onClick={() => setSearchOpen(true)}
            >
              <Search size={18} />
            </button>
            <Link
              href="/"
              className="relative flex h-10 w-10 items-center justify-center rounded-full text-foreground"
              aria-label="Notificações"
            >
              <Bell size={18} />
            </Link>
            <div className="flex items-center gap-2 pl-1">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#1c1916] text-xs font-semibold text-white">
                {initial}
              </span>
              <span className="hidden text-sm text-foreground sm:inline">{name.split(' ')[0]}</span>
            </div>
          </div>
        </div>
      </header>

      {menuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => setMenuOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-[80%] max-w-xs flex-col bg-surface pt-[env(safe-area-inset-top)] shadow-xl">
            <div className="flex items-center justify-between px-5 py-4">
              <span className="font-serif text-xl tracking-[0.18em]">{brand.shortMonogram}</span>
              <button type="button" aria-label="Fechar" onClick={() => setMenuOpen(false)}>
                <X size={20} />
              </button>
            </div>
            <nav className="flex flex-col gap-1 px-3">
              {links.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMenuOpen(false)}
                  className="rounded-xl px-3 py-3 text-sm text-foreground"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            <div className="mt-auto px-5 pb-8">
              <LogoutButton className="w-full" label="Sair" />
            </div>
          </aside>
        </div>
      )}

      {searchOpen && (
        <div className="fixed inset-0 z-50 bg-black/25 p-4" onClick={() => setSearchOpen(false)}>
          <div
            className="mx-auto mt-16 max-w-lg rounded-2xl border border-border bg-surface p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Pesquisar na intranet…"
              className="w-full rounded-xl border border-border bg-background px-4 py-3 text-base outline-none focus:border-gold"
            />
            <ul className="mt-3 space-y-1">
              {results.map((item) => (
                <li key={item.href}>
                  <button
                    type="button"
                    className="w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-background"
                    onClick={() => {
                      setSearchOpen(false)
                      router.push(item.href)
                    }}
                  >
                    {item.label}
                  </button>
                </li>
              ))}
              {query.trim().length >= 2 && results.length === 0 && (
                <li className="px-3 py-2 text-sm text-muted">Nada encontrado.</li>
              )}
            </ul>
          </div>
        </div>
      )}
    </>
  )
}
