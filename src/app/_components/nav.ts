import { LayoutDashboard, Users, Sun, FileBarChart, GraduationCap, Columns3 } from 'lucide-react'
import { getBrand } from '@/lib/brand'

/** Nav principal (sidebar + menu mobile). Bottom bar usa só os 4 primeiros. */
export const APP_NAV = [
  { href: '/hoje', label: 'Hoje', shortLabel: 'Hoje', icon: Sun },
  { href: '/pipeline', label: 'Pipeline', shortLabel: 'Pipe', icon: Columns3 },
  { href: '/contatos', label: 'Contatos', shortLabel: 'Contatos', icon: Users },
  { href: '/dashboard', label: 'Visão analítica', shortLabel: 'Análise', icon: LayoutDashboard },
  { href: '/onboarding', label: 'Onboarding', shortLabel: 'Onboarding', icon: GraduationCap },
  { href: '/relatorios', label: 'Relatórios', shortLabel: 'Relatórios', icon: FileBarChart, adminOnly: true },
] as const

export const BOTTOM_NAV = APP_NAV.slice(0, 4)

export const ADMIN_NAV = { href: '/admin', label: 'Diagnóstico', shortLabel: 'API' } as const

export const DIRECTOR_REPORT_NAV = {
  href: '/admin/relatorio-diretoria',
  label: 'Relatório diretoria (Avec)',
  shortLabel: 'Diretoria',
} as const

export function pageTitleFromPath(pathname: string) {
  const brand = getBrand()
  if (pathname.startsWith('/relatorios')) return 'Relatórios'
  if (pathname.startsWith('/admin/relatorio-diretoria')) return 'Relatório diretoria'
  if (pathname.startsWith('/admin')) return 'Diagnóstico'
  if (pathname.startsWith('/hoje')) return brand.hojeTitle
  if (pathname.startsWith('/pipeline')) return 'Pipeline'
  if (pathname.startsWith('/contatos/')) return 'Perfil do cliente'
  if (pathname.startsWith('/contatos')) return 'Contatos'
  if (pathname.startsWith('/onboarding')) return 'Onboarding'
  if (pathname.startsWith('/dashboard')) return 'Visão analítica'
  if (pathname.startsWith('/financeiro')) return 'Financeiro'
  if (pathname.startsWith('/estoque')) return 'Estoque'
  return brand.displayName
}
