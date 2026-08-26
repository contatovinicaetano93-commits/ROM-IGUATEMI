import {
  LayoutDashboard,
  Users,
  Sun,
  FileBarChart,
  GraduationCap,
  Columns3,
  BriefcaseBusiness,
} from 'lucide-react'
import { getBrand } from '@/lib/brand'

/** Zonas do menu: ritmo do dia (Operar) → leitura (Entender) → backoffice (Administrar). */
export type NavZone = 'operar' | 'entender' | 'administrar'

export const NAV_ZONE_LABEL: Record<NavZone, string> = {
  operar: 'Operar',
  entender: 'Entender',
  administrar: 'Administrar',
}

export type AppNavItem = {
  href: string
  label: string
  shortLabel: string
  icon: (typeof Sun)
  zone: NavZone
  adminOnly?: boolean
}

/**
 * Nav principal (sidebar + menu mobile).
 * Ordem = Operar → Entender → Administrar. Bottom bar = só Operar (staff).
 * Visão é adminOnly (paridade com Brasil — staff não vê link morto).
 */
export const APP_NAV: readonly AppNavItem[] = [
  { href: '/hoje', label: 'Hoje', shortLabel: 'Hoje', icon: Sun, zone: 'operar' },
  { href: '/pipeline', label: 'Pipeline', shortLabel: 'Pipe', icon: Columns3, zone: 'operar' },
  { href: '/contatos', label: 'Contatos', shortLabel: 'Contatos', icon: Users, zone: 'operar' },
  {
    href: '/onboarding',
    label: 'Onboarding',
    shortLabel: 'Onboarding',
    icon: GraduationCap,
    zone: 'operar',
  },
  {
    href: '/dashboard',
    label: 'Visão analítica',
    shortLabel: 'Análise',
    icon: LayoutDashboard,
    zone: 'entender',
    adminOnly: true,
  },
  {
    href: '/relatorios',
    label: 'Relatórios',
    shortLabel: 'Relatórios',
    icon: FileBarChart,
    zone: 'entender',
    adminOnly: true,
  },
  {
    href: '/admin/relatorio-diretoria',
    label: 'Relatório gerência',
    shortLabel: 'Gerência',
    icon: BriefcaseBusiness,
    zone: 'administrar',
    adminOnly: true,
  },
] as const

/** Staff / mobile bottom: só Operar (Hoje · Pipe · Contatos · Onboarding). */
export const BOTTOM_NAV = APP_NAV.filter((i) => i.zone === 'operar')

export const ADMIN_NAV = { href: '/admin', label: 'Diagnóstico', shortLabel: 'API' } as const

export const DIRECTOR_REPORT_NAV = {
  href: '/admin/relatorio-diretoria',
  label: 'Relatório gerência',
  shortLabel: 'Gerência',
} as const

/** Agrupa itens visíveis por zona (pula zonas vazias). */
export function groupNavByZone(items: readonly AppNavItem[]): { zone: NavZone; items: AppNavItem[] }[] {
  const order: NavZone[] = ['operar', 'entender', 'administrar']
  return order
    .map((zone) => ({ zone, items: items.filter((i) => i.zone === zone) as AppNavItem[] }))
    .filter((g) => g.items.length > 0)
}

export function pageTitleFromPath(pathname: string) {
  const brand = getBrand()
  if (pathname.startsWith('/relatorios')) return 'Relatórios'
  if (pathname.startsWith('/admin/relatorio-diretoria')) return 'Relatório gerência'
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
