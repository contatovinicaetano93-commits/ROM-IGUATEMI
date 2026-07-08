import { LayoutDashboard, Users, Activity } from 'lucide-react'

export const APP_NAV = [
  { href: '/dashboard', label: 'Visão geral', shortLabel: 'Painel', icon: LayoutDashboard },
  { href: '/contatos', label: 'Contatos', shortLabel: 'Contatos', icon: Users },
  { href: '/admin', label: 'Diagnóstico', shortLabel: 'API', icon: Activity },
] as const

export function pageTitleFromPath(pathname: string) {
  if (pathname.startsWith('/admin')) return 'Diagnóstico das APIs'
  if (pathname.startsWith('/contatos/')) return 'Perfil do cliente'
  if (pathname.startsWith('/contatos')) return 'Contatos'
  return 'Visão geral'
}
