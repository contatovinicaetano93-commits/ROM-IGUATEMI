import { LayoutDashboard, Users, Sun, FileBarChart } from 'lucide-react'
import { getBrand } from '@/lib/brand'

/** Nav principal (sidebar + menu mobile). Bottom bar usa só os 3 primeiros. */
export const APP_NAV = [
  { href: '/hoje', label: 'Hoje', shortLabel: 'Hoje', icon: Sun },
  { href: '/contatos', label: 'Contatos', shortLabel: 'Contatos', icon: Users },
  { href: '/dashboard', label: 'Visão analítica', shortLabel: 'Análise', icon: LayoutDashboard },
  {
    href: '/admin/relatorio-diretoria',
    label: 'Relatórios',
    shortLabel: 'Relatórios',
    icon: FileBarChart,
  },
] as const

export const BOTTOM_NAV = APP_NAV.slice(0, 3)

export const ADMIN_NAV = { href: '/admin', label: 'Diagnóstico', shortLabel: 'API' } as const

export const DIRECTOR_REPORT_NAV = {
  href: '/admin/relatorio-diretoria',
  label: 'Relatórios',
  shortLabel: 'Relatórios',
} as const

export function pageTitleFromPath(pathname: string) {
  const brand = getBrand()
  if (pathname.startsWith('/admin/relatorio-diretoria')) return 'Relatórios'
  if (pathname.startsWith('/admin')) return 'Diagnóstico'
  if (pathname.startsWith('/hoje')) return brand.hojeTitle
  if (pathname.startsWith('/dashboard')) return 'Visão analítica'
  if (pathname.startsWith('/contatos/')) return 'Perfil do cliente'
  if (pathname.startsWith('/contatos')) return 'Contatos'
  return brand.displayName
}
