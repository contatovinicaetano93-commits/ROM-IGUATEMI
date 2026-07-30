import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { isAuthorized, isAuthEnabled, getSession } from '@/lib/auth'
import { isCronAuthorized } from '@/lib/cron-auth'
import { isProduction } from '@/lib/env'

const PUBLIC_API_PREFIXES = ['/api/auth', '/api/health', '/api/webhooks']

function isPublicApi(pathname: string) {
  return PUBLIC_API_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

function isFinanceAllowedAdminApi(pathname: string) {
  // Handlers usam requireFinance (admin + financeiro).
  return (
    pathname === '/api/admin/revenue-backfill' ||
    pathname === '/api/admin/analytics-backfill'
  )
}

function isFinancePath(pathname: string) {
  return (
    pathname === '/financeiro' ||
    pathname.startsWith('/financeiro/') ||
    pathname.startsWith('/api/financeiro/') ||
    isFinanceAllowedAdminApi(pathname)
  )
}

function isLgpdAnonymizePath(pathname: string) {
  return /^\/api\/contacts\/[^/]+\/anonymize$/.test(pathname)
}

function isRelatoriosPath(pathname: string) {
  return (
    pathname === '/relatorios' ||
    pathname.startsWith('/relatorios/') ||
    pathname.startsWith('/api/relatorios/')
  )
}

function isStockPath(pathname: string) {
  return pathname === '/estoque' || pathname.startsWith('/estoque/') || pathname.startsWith('/api/estoque/')
}

function isOnboardingPath(pathname: string) {
  return pathname === '/onboarding' || pathname.startsWith('/onboarding/') || pathname.startsWith('/api/onboarding/')
}

/** Staff: operação do dia (sem receita comercial / admin). */
function isStaffPath(pathname: string) {
  return (
    pathname === '/' ||
    pathname === '/hoje' ||
    pathname.startsWith('/api/hoje') ||
    pathname === '/pipeline' ||
    pathname.startsWith('/api/pipeline') ||
    pathname === '/contatos' ||
    pathname.startsWith('/contatos/') ||
    pathname.startsWith('/api/contacts') ||
    pathname.startsWith('/api/services') ||
    pathname.startsWith('/api/schedule') ||
    pathname.startsWith('/api/recommendations') ||
    pathname.startsWith('/api/reactivation') ||
    isOnboardingPath(pathname) ||
    pathname === '/api/auth/session' ||
    pathname === '/api/auth/logout'
  )
}

function isAdminOnlyPath(pathname: string) {
  return (
    pathname === '/admin' ||
    pathname.startsWith('/admin/') ||
    pathname === '/dashboard' ||
    pathname.startsWith('/api/kpis') ||
    pathname === '/api/avec/sync' ||
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

function isProtectedPage(pathname: string) {
  return (
    pathname === '/' ||
    pathname === '/hoje' ||
    pathname === '/pipeline' ||
    pathname === '/dashboard' ||
    pathname === '/contatos' ||
    pathname.startsWith('/contatos/') ||
    pathname === '/admin' ||
    pathname.startsWith('/admin/') ||
    pathname === '/relatorios' ||
    pathname.startsWith('/relatorios/') ||
    pathname === '/financeiro' ||
    pathname.startsWith('/financeiro/') ||
    pathname === '/estoque' ||
    pathname.startsWith('/estoque/') ||
    pathname === '/onboarding' ||
    pathname.startsWith('/onboarding/') ||
    pathname === '/observability' ||
    pathname.startsWith('/observability/')
  )
}

function isProtectedApi(pathname: string) {
  return pathname.startsWith('/api/') && !isPublicApi(pathname)
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  if (pathname === '/login') return NextResponse.next()

  const needsAuth = isProtectedPage(pathname) || isProtectedApi(pathname)
  if (!needsAuth) return NextResponse.next()

  if (!isAuthEnabled()) {
    if (isProduction()) {
      const msg = 'Auth não configurado — defina ROM_ADMIN_PASSWORD'
      if (isProtectedApi(pathname)) {
        return NextResponse.json({ error: msg }, { status: 503 })
      }
      return new NextResponse(msg, { status: 503 })
    }
    return NextResponse.next()
  }

  const allowHeaderTokens =
    pathname === '/api/avec/sync' ||
    pathname === '/api/avec/sync/revenue-backfill' ||
    pathname === '/api/avec/purge-snapshots' ||
    pathname === '/api/avec/refresh-token' ||
    pathname === '/api/estoque/sync' ||
    pathname === '/api/financeiro/omie/sync' ||
    pathname === '/api/director-report' ||
    pathname === '/api/lgpd/purge' ||
    pathname === '/api/reminders/financeiro' ||
    pathname === '/api/reminders/aftercare' ||
    pathname === '/api/admin/migrations' ||
    pathname === '/api/admin/revenue-backfill' ||
    pathname === '/api/admin/analytics-backfill'
  if (!(await isAuthorized(req, { allowHeaderTokens }))) {
    if (isProtectedApi(pathname)) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }
    const login = new URL('/login', req.url)
    login.searchParams.set('next', pathname === '/' ? '/hoje' : pathname)
    return NextResponse.redirect(login)
  }

  if (isCronAuthorized(req)) return NextResponse.next()

  const session = await getSession(req)
  const role = session?.role
  const financePath = isFinancePath(pathname)
  const stockPath = isStockPath(pathname)
  const onboardingPath = isOnboardingPath(pathname)
  const relatoriosPath = isRelatoriosPath(pathname)

  // Staff: só operação (hoje/pipeline/contatos/onboarding) — sem Visão/Financeiro/Admin.
  if (role === 'staff' && (isProtectedPage(pathname) || isProtectedApi(pathname)) && !isStaffPath(pathname)) {
    if (isProtectedApi(pathname)) {
      return NextResponse.json({ error: 'Acesso restrito — use a conta admin para analytics/admin' }, { status: 403 })
    }
    return NextResponse.redirect(new URL('/hoje', req.url))
  }

  // Admin-only: diagnóstico, sync manual, visão analítica, observability.
  if (isAdminOnlyPath(pathname) && role !== 'admin') {
    // Financeiro pode ver Relatório gerência? Não — admin only. Visão analítica = admin.
    if (isProtectedApi(pathname)) {
      return NextResponse.json({ error: 'Acesso restrito ao admin' }, { status: 403 })
    }
    return NextResponse.redirect(new URL(role === 'financeiro' ? '/financeiro' : '/hoje', req.url))
  }

  if (
    role === 'financeiro' &&
    (isProtectedPage(pathname) || isProtectedApi(pathname)) &&
    !financePath &&
    !stockPath &&
    !onboardingPath &&
    !relatoriosPath
  ) {
    if (isProtectedApi(pathname)) {
      return NextResponse.json({ error: 'Acesso restrito ao financeiro' }, { status: 403 })
    }
    return NextResponse.redirect(new URL('/financeiro', req.url))
  }

  if (
    role === 'estoque' &&
    (isProtectedPage(pathname) || isProtectedApi(pathname)) &&
    !stockPath &&
    !onboardingPath
  ) {
    if (isProtectedApi(pathname)) {
      return NextResponse.json({ error: 'Acesso restrito ao estoque' }, { status: 403 })
    }
    return NextResponse.redirect(new URL('/estoque', req.url))
  }
  if ((financePath || relatoriosPath) && role !== 'admin' && role !== 'financeiro') {
    if (isProtectedApi(pathname)) {
      return NextResponse.json({ error: 'Acesso restrito ao financeiro' }, { status: 403 })
    }
    return NextResponse.redirect(new URL('/hoje', req.url))
  }
  if (stockPath && role !== 'admin' && role !== 'financeiro' && role !== 'estoque') {
    if (isProtectedApi(pathname)) {
      return NextResponse.json({ error: 'Acesso restrito ao estoque' }, { status: 403 })
    }
    return NextResponse.redirect(new URL('/hoje', req.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/',
    '/hoje',
    '/pipeline',
    '/dashboard',
    '/contatos',
    '/contatos/:path*',
    '/admin',
    '/admin/:path*',
    '/relatorios',
    '/relatorios/:path*',
    '/financeiro',
    '/financeiro/:path*',
    '/estoque',
    '/estoque/:path*',
    '/onboarding',
    '/onboarding/:path*',
    '/observability',
    '/observability/:path*',
    '/api/:path*',
  ],
}
