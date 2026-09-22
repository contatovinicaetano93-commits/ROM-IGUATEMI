import type { AuthRole } from '@/lib/auth'
import {
  isProfessionalHiddenPath,
  isProfessionalStaff,
} from '@/lib/intranet/professional-nav'

export type GrantableModuleKey =
  | 'pipeline'
  | 'contatos'
  | 'financeiro'
  | 'estoque'
  | 'relatorios'
  | 'dashboard'

export type GrantableModule = {
  key: GrantableModuleKey
  href: string
  label: string
}

export const GRANTABLE_MODULES: readonly GrantableModule[] = [
  { key: 'pipeline', href: '/pipeline', label: 'Agenda do dia' },
  { key: 'contatos', href: '/contatos', label: 'Contatos' },
  { key: 'financeiro', href: '/financeiro', label: 'Financeiro' },
  { key: 'estoque', href: '/estoque', label: 'Estoque' },
  { key: 'relatorios', href: '/relatorios', label: 'Relatórios' },
  { key: 'dashboard', href: '/dashboard', label: 'Visão analítica' },
] as const

const ALL_KEYS: readonly GrantableModuleKey[] = GRANTABLE_MODULES.map((item) => item.key)

const ROLE_MODULES: Record<AuthRole, readonly GrantableModuleKey[]> = {
  admin: ALL_KEYS,
  staff: ['pipeline', 'contatos'],
  mkt: ['pipeline', 'contatos'],
  financeiro: ['financeiro', 'estoque', 'relatorios'],
  estoque: ['estoque'],
}

/** Pacote fixo do papel (sem extras). */
export function roleModulePack(role: AuthRole): readonly GrantableModuleKey[] {
  return ROLE_MODULES[role]
}

/** Sistemas efetivos = pacote do papel + extras. */
export function effectiveModules(
  role: AuthRole,
  extras: readonly GrantableModuleKey[] = [],
): GrantableModuleKey[] {
  if (role === 'admin') return [...ALL_KEYS]
  const seen = new Set<GrantableModuleKey>(ROLE_MODULES[role])
  for (const key of extrasBeyondRole(role, extras)) seen.add(key)
  return ALL_KEYS.filter((key) => seen.has(key))
}

function isGrantableModuleKey(value: string): value is GrantableModuleKey {
  return (ALL_KEYS as readonly string[]).includes(value)
}

export function parseGrantableModules(value: unknown): GrantableModuleKey[] {
  const raw = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.replace(/[{}]/g, '').split(',').filter(Boolean)
      : []
  const seen = new Set<GrantableModuleKey>()
  for (const item of raw) {
    const key = String(item).trim()
    if (isGrantableModuleKey(key)) seen.add(key)
  }
  return ALL_KEYS.filter((key) => seen.has(key))
}

export function extrasBeyondRole(
  role: AuthRole,
  selected: readonly GrantableModuleKey[],
): GrantableModuleKey[] {
  if (role === 'admin') return []
  const pack = new Set(ROLE_MODULES[role])
  return parseGrantableModules(selected).filter((key) => !pack.has(key))
}

export function hasPanelModule(
  role: AuthRole,
  extras: readonly GrantableModuleKey[],
  key: GrantableModuleKey,
): boolean {
  if (role === 'admin') return true
  if (ROLE_MODULES[role].includes(key)) return true
  return extras.includes(key)
}

export function moduleKeyFromHref(href: string): GrantableModuleKey | null {
  const path = href.split('?')[0] || '/'
  const match = GRANTABLE_MODULES.find((item) => path === item.href || path.startsWith(`${item.href}/`))
  return match?.key ?? null
}

export function canSeeNavHref(
  href: string,
  role: AuthRole | null | undefined,
  extras: readonly GrantableModuleKey[] = [],
  opts?: { professionalName?: string | null },
): boolean {
  if (!role) return false
  const path = href.split('?')[0] || '/'
  if (path === '/auditoria' || path.startsWith('/auditoria/')) return role === 'admin'
  // Cadastro/edição de acessos é só admin master — não poluir o menu dos demais cargos.
  if (path === '/pessoas' || path.startsWith('/pessoas/')) return role === 'admin'
  // Profissional: sem Balcão / Pós-venda / Operação (Agenda + Contatos bastam).
  if (isProfessionalStaff(role, opts?.professionalName) && isProfessionalHiddenPath(path)) {
    return false
  }
  const key = moduleKeyFromHref(href)
  if (!key) return true
  return hasPanelModule(role, extras, key)
}
