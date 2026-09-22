import type { AuthRole } from '@/lib/auth'
import { canSeeNavHref, type GrantableModuleKey } from '@/lib/intranet/modules'

export type BottomDockItem = {
  href: string
  shortLabel: string
}

export type BottomMoreItem = {
  href: string
  label: string
}

const DOCK_CAP = 4

/** Ordem de preferência do dock por papel (Home sempre entra primeiro). */
const ROLE_DOCK_PRIORITY: Record<AuthRole, readonly string[]> = {
  admin: ['/', '/financeiro', '/flow', '/hoje', '/dashboard', '/estoque', '/contatos', '/pipeline'],
  financeiro: ['/', '/financeiro', '/dashboard', '/relatorios', '/estoque', '/flow', '/hoje'],
  estoque: ['/', '/estoque', '/flow', '/hoje', '/financeiro'],
  staff: ['/', '/contatos', '/pipeline', '/flow', '/hoje', '/meu-faturamento', '/recepcao', '/pos-venda'],
  mkt: ['/', '/empresa', '/contatos', '/pipeline', '/flow', '/hoje'],
}

const DOCK_LABELS: Record<string, string> = {
  '/': 'Home',
  '/financeiro': 'Financeiro',
  '/estoque': 'Estoque',
  '/flow': 'Tarefas',
  '/hoje': 'Operação',
  '/contatos': 'Contatos',
  '/pipeline': 'Agenda',
  '/dashboard': 'Visão',
  '/relatorios': 'Relatórios',
  '/empresa': 'Notícias',
  '/meu-faturamento': 'Faturamento',
  '/recepcao': 'Balcão',
  '/pos-venda': 'Pós-venda',
}

/** Catálogo do sheet "Mais" — só entra o que `canSeeNavHref` liberar. */
const MORE_CATALOG: readonly BottomMoreItem[] = [
  { href: '/pipeline', label: 'Agenda do dia' },
  { href: '/contatos', label: 'Contatos' },
  { href: '/recepcao', label: 'Recepção' },
  { href: '/pos-venda', label: 'Pós-venda' },
  { href: '/meu-faturamento', label: 'Meu faturamento' },
  { href: '/hoje', label: 'Operação do dia' },
  { href: '/flow', label: 'Rom Flow · tarefas' },
  { href: '/pessoas', label: 'Gestão de usuário' },
  { href: '/empresa', label: 'Notícias e eventos' },
  { href: '/rh', label: 'RH' },
  { href: '/treinamentos', label: 'Treinamentos' },
  { href: '/onboarding', label: 'Onboarding' },
  { href: '/ajuda', label: 'Suporte' },
  { href: '/sistemas', label: 'Meus sistemas' },
  { href: '/dashboard', label: 'Visão analítica' },
  { href: '/relatorios', label: 'Relatórios' },
  { href: '/financeiro', label: 'Financeiro' },
  { href: '/estoque', label: 'Estoque' },
  { href: '/auditoria', label: 'Auditoria' },
]

function normalizePath(href: string): string {
  return (href.split('?')[0] || '/').replace(/#.*$/, '') || '/'
}

function dockLabel(href: string): string {
  return DOCK_LABELS[normalizePath(href)] ?? 'App'
}

function allowedHref(
  href: string,
  role: AuthRole | null,
  extras: readonly GrantableModuleKey[],
  openAuth: boolean,
  professionalName?: string | null,
): boolean {
  if (openAuth) return true
  return canSeeNavHref(href, role, extras, { professionalName })
}

/**
 * Monta o dock inferior (até 4) + sheet "Mais" só com o que o papel/extras liberam.
 * Admin master continua vendo o pacote amplo; staff/financeiro/estoque veem o fluxo do cargo.
 */
export function resolveBottomNav(
  role: AuthRole | null | undefined,
  extras: readonly GrantableModuleKey[] = [],
  opts: { openAuth?: boolean; professionalName?: string | null } = {},
): { dock: BottomDockItem[]; more: BottomMoreItem[] } {
  const openAuth = Boolean(opts.openAuth)
  const professionalName = opts.professionalName ?? null
  if (!role && !openAuth) return { dock: [], more: [] }

  const resolvedRole: AuthRole = role ?? 'staff'
  const priority = ROLE_DOCK_PRIORITY[resolvedRole] ?? ROLE_DOCK_PRIORITY.staff
  const seen = new Set<string>()
  const dock: BottomDockItem[] = []

  for (const href of priority) {
    const path = normalizePath(href)
    if (seen.has(path)) continue
    if (!allowedHref(path, role ?? null, extras, openAuth, professionalName)) continue
    seen.add(path)
    dock.push({ href: path, shortLabel: dockLabel(path) })
    if (dock.length >= DOCK_CAP) break
  }

  // Sem sessão válida mas openAuth: pelo menos Home.
  if (dock.length === 0 && openAuth) {
    dock.push({ href: '/', shortLabel: 'Home' })
  }

  const more = MORE_CATALOG.filter((item) => {
    const path = normalizePath(item.href)
    if (seen.has(path)) return false
    return allowedHref(path, role ?? null, extras, openAuth, professionalName)
  })

  return { dock, more }
}
