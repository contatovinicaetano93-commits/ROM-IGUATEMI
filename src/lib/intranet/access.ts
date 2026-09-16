import { isIntranetPath } from '@/lib/intranet/paths'
import { hasPanelModule, type GrantableModuleKey } from '@/lib/intranet/modules'
import type { AuthRole } from '@/lib/auth'

function isFinanceAllowedAdminApi(pathname: string) {
  return pathname === '/api/admin/revenue-backfill' || pathname === '/api/admin/analytics-backfill'
}

export function isFinancePath(pathname: string) {
  return (
    pathname === '/financeiro' ||
    pathname.startsWith('/financeiro/') ||
    pathname.startsWith('/api/financeiro/') ||
    isFinanceAllowedAdminApi(pathname)
  )
}

export function isRelatoriosPath(pathname: string) {
  return (
    pathname === '/relatorios' ||
    pathname.startsWith('/relatorios/') ||
    pathname.startsWith('/api/relatorios/')
  )
}

export function isStockPath(pathname: string) {
  return pathname === '/estoque' || pathname.startsWith('/estoque/') || pathname.startsWith('/api/estoque/')
}

export function isOnboardingPath(pathname: string) {
  return pathname === '/onboarding' || pathname.startsWith('/onboarding/') || pathname.startsWith('/api/onboarding/')
}

export function isHojePath(pathname: string) {
  return pathname === '/hoje' || pathname.startsWith('/api/hoje')
}

export function isPipelinePath(pathname: string) {
  return pathname === '/pipeline' || pathname.startsWith('/api/pipeline')
}

export function isContatosPath(pathname: string) {
  return (
    pathname === '/contatos' ||
    pathname.startsWith('/contatos/') ||
    pathname.startsWith('/api/contacts') ||
    pathname.startsWith('/api/services') ||
    pathname.startsWith('/api/schedule') ||
    pathname.startsWith('/api/recommendations') ||
    pathname.startsWith('/api/reactivation')
  )
}

export function isDashboardPath(pathname: string) {
  return pathname === '/dashboard' || pathname.startsWith('/api/kpis')
}

function isLgpdAnonymizePath(pathname: string) {
  return /^\/api\/contacts\/[^/]+\/anonymize$/.test(pathname)
}

export function isAdminOpsPath(pathname: string) {
  return (
    pathname === '/admin' ||
    pathname.startsWith('/admin/') ||
    pathname === '/api/avec/sync' ||
    pathname.startsWith('/api/avec/sync/') ||
    pathname === '/api/avec/purge-snapshots' ||
    pathname === '/api/avec/refresh-token' ||
    pathname === '/api/seed' ||
    (pathname.startsWith('/api/admin/') && !isFinanceAllowedAdminApi(pathname)) ||
    pathname === '/api/lgpd/purge' ||
    isLgpdAnonymizePath(pathname) ||
    pathname === '/observability' ||
    pathname.startsWith('/api/observability')
  )
}

function isSessionApiPath(pathname: string) {
  return pathname === '/api/auth/session' || pathname === '/api/auth/logout'
}

export function canAccessProtectedPath(
  pathname: string,
  role: AuthRole | null | undefined,
  extras: readonly GrantableModuleKey[] = [],
): boolean {
  if (!role) return false
  if (isSessionApiPath(pathname)) return true
  if (role === 'admin') return true
  if (isAdminOpsPath(pathname)) return false
  if (isIntranetPath(pathname) || pathname === '/' || isOnboardingPath(pathname) || isHojePath(pathname)) {
    return true
  }
  if (isPipelinePath(pathname)) return hasPanelModule(role, extras, 'pipeline')
  if (isContatosPath(pathname)) return hasPanelModule(role, extras, 'contatos')
  if (isFinancePath(pathname)) return hasPanelModule(role, extras, 'financeiro')
  if (isRelatoriosPath(pathname)) return hasPanelModule(role, extras, 'relatorios')
  if (isStockPath(pathname)) return hasPanelModule(role, extras, 'estoque')
  if (isDashboardPath(pathname)) return hasPanelModule(role, extras, 'dashboard')
  return false
}
