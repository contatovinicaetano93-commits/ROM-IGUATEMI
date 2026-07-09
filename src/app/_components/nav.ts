import { LayoutDashboard, Users, Sun } from 'lucide-react'
import { getBrand } from '@/lib/brand'

export const APP_NAV = [
  { href: '/hoje', label: 'Hoje', shortLabel: 'Hoje', icon: Sun },
  { href: '/contatos', label: 'Contatos', shortLabel: 'Contatos', icon: Users },
  { href: '/dashboard', label: 'Visão analítica', shortLabel: 'Análise', icon: LayoutDashboard },
] as const

export const ADMIN_NAV = { href: '/admin', label: 'Diagnóstico', shortLabel: 'API' } as const

export const DIRECTOR_REPORT_NAV = {
  href: '/admin/relatorio-diretoria',
  label: 'Relatório diretoria',
  shortLabel: 'Diretoria',
} as const

export function pageTitleFromPath(pathname: string) {
  const brand = getBrand()
  if (pathname.startsWith('/admin/relatorio-diretoria')) return 'Relatório diretoria'
  if (pathname.startsWith('/admin')) return 'Diagnóstico'
  if (pathname.startsWith('/hoje')) return brand.hojeTitle
  if (pathname.startsWith('/dashboard')) return 'Visão analítica'
  if (pathname.startsWith('/contatos/')) return 'Perfil do cliente'
  if (pathname.startsWith('/contatos')) return 'Contatos'
  return brand.displayName
}
