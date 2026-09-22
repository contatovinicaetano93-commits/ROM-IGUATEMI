'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Menu, Search, X } from 'lucide-react'
import { INTRANET_NAV } from './nav'
import { useClientSession } from '../SessionProvider'
import { getBrand } from '@/lib/brand'
import { canSeeNavHref, parseGrantableModules } from '@/lib/intranet/modules'
import { LogoutButton } from '../LogoutButton'
import { IntranetBell } from './IntranetBell'

const SEARCH_TARGETS = [
  { href: '/', label: 'Home' },
  { href: '/pessoas', label: 'Gestão de usuário' },
  { href: '/empresa', label: 'Notícias e eventos' },
  { href: '/rh', label: 'RH e benefícios' },
  { href: '/flow', label: 'Rom Flow · solicitações' },
  { href: '/hoje', label: 'Operação do dia' },
  { href: '/pipeline', label: 'Agenda do dia' },
  { href: '/contatos', label: 'Contatos' },
  { href: '/dashboard', label: 'Visão analítica' },
  { href: '/relatorios', label: 'Relatórios · visão analítica' },
  { href: '/financeiro', label: 'Financeiro e Omie' },
  { href: '/estoque', label: 'Estoque' },
  { href: '/treinamentos', label: 'Treinamentos' },
  { href: '/onboarding', label: 'Onboarding' },
  { href: '/ajuda', label: 'Suporte' },
  { href: '/sistemas', label: 'Meus sistemas' },
  { href: '/auditoria', label: 'Auditoria' },
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
  const extras = parseGrantableModules(session?.modules)
  const professionalName = session?.professionalName ?? null
  const navOpts = { professionalName }
  const links = INTRANET_NAV.filter((item) => {
    if (!session) return false
    if (!session.auth_enabled) return true
    if (role == null) return false
    return canSeeNavHref(item.href, role, extras, navOpts)
  })

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (q.length < 2) return []
    return SEARCH_TARGETS.filter((item) => {
      if (!(item.label.toLowerCase().includes(q) || item.href.includes(q))) return false
      if (!session || !session.auth_enabled) return true
      if (role == null) return false
      return canSeeNavHref(item.href, role, extras, navOpts)
    }).slice(0, 8)
  }, [extras, professionalName, query, role, session])

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-border bg-surface/95 backdrop-blur">
        {/* Faixa 1: marca + utilitários — sem título de seção (já existe no chrome da página) */}
        <div className="mx-auto flex max-w-[1600px] items-center gap-2 py-3 pl-4 pr-5 sm:gap-3 sm:px-5 lg:px-8">
          <button
            type="button"
            className="flex h-10 w-10 shrink-0 items-center justify-center text-foreground lg:hidden"
            aria-label="Abrir menu"
            onClick={() => setMenuOpen(true)}
          >
            <Menu size={22} />
          </button>
          <Link
            href="/"
            className="min-w-0 truncate font-serif text-lg tracking-[0.08em] text-foreground sm:text-xl lg:shrink-0 lg:text-2xl"
          >
            {brand.displayName}
          </Link>
          <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              className="hidden h-9 items-center gap-2 rounded-full border border-border bg-background px-3 text-sm text-muted xl:flex"
              onClick={() => setSearchOpen(true)}
            >
              <Search size={16} />
              Pesquisar…
            </button>
            <button
              type="button"
              className="flex h-9 w-9 items-center justify-center rounded-full text-foreground xl:hidden"
              aria-label="Buscar"
              onClick={() => setSearchOpen(true)}
            >
              <Search size={18} />
            </button>
            <IntranetBell />
            <div className="flex items-center gap-1.5 pl-0.5 sm:gap-2 sm:pl-1">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-foreground text-xs font-semibold text-background">
                {initial}
              </span>
              <span className="hidden max-w-[7rem] truncate text-sm text-foreground lg:inline">{name.split(' ')[0]}</span>
              {/* Mobile: só o ícone — libera espaço no canto. Desktop: pill com texto. */}
              <LogoutButton compact className="inline-flex lg:hidden" label="Sair" />
              <LogoutButton className="hidden lg:inline-flex" label="Sair" />
            </div>
          </div>
        </div>

        {/* Faixa 2: módulos em linha única, sem quebra — nomes curtos só na barra */}
        <nav
          className="hidden border-t border-border/80 lg:block"
          aria-label="Módulos da intranet"
        >
          <div className="mx-auto flex max-w-[1600px] items-stretch justify-center gap-5 overflow-x-auto px-5 xl:gap-7 lg:px-8">
            {links.map((item) => {
              const active =
                item.href === '/'
                  ? pathname === '/'
                  : pathname === item.href || pathname.startsWith(`${item.href}/`)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={item.label}
                  className={
                    active
                      ? 'shrink-0 whitespace-nowrap border-b-2 border-foreground px-1 py-2.5 text-[0.8rem] font-medium tracking-wide text-foreground'
                      : 'shrink-0 whitespace-nowrap border-b-2 border-transparent px-1 py-2.5 text-[0.8rem] tracking-wide text-muted hover:text-foreground'
                  }
                >
                  {item.short}
                </Link>
              )
            })}
          </div>
        </nav>
      </header>

      {menuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => setMenuOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-[80%] max-w-xs flex-col bg-surface pt-[env(safe-area-inset-top)] shadow-xl">
            <div className="flex items-center justify-between px-5 py-4">
              <span className="font-serif text-lg tracking-[0.08em]">{brand.displayName}</span>
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
              <LogoutButton className="inline-flex w-full" label="Sair" />
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
