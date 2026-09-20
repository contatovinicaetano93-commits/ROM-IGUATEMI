import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { isAuthorized, isAuthEnabled, getSession } from '@/lib/auth'
import { isCronAuthorized } from '@/lib/cron-auth'
import { isProduction } from '@/lib/env'
import { canAccessProtectedPath } from '@/lib/intranet/access'

const PUBLIC_API_PREFIXES = ['/api/auth', '/api/health', '/api/webhooks']

function isPublicApi(pathname: string) {
  return PUBLIC_API_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
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
    pathname.startsWith('/observability/') ||
    pathname === '/pessoas' ||
    pathname.startsWith('/pessoas/') ||
    pathname === '/empresa' ||
    pathname.startsWith('/empresa/') ||
    pathname === '/rh' ||
    pathname.startsWith('/rh/') ||
    pathname === '/treinamentos' ||
    pathname.startsWith('/treinamentos/') ||
    pathname === '/sistemas' ||
    pathname.startsWith('/sistemas/') ||
    pathname === '/ajuda' ||
    pathname.startsWith('/ajuda/') ||
    pathname === '/flow' ||
    pathname.startsWith('/flow/') ||
    pathname === '/operacao' ||
    pathname.startsWith('/operacao/') ||
    pathname === '/adm' ||
    pathname.startsWith('/adm/') ||
    pathname === '/auditoria' ||
    pathname.startsWith('/auditoria/') ||
    pathname === '/meu-faturamento' ||
    pathname.startsWith('/meu-faturamento/')
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
    pathname.startsWith('/api/avec/sync/') ||
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
    login.searchParams.set('next', pathname)
    return NextResponse.redirect(login)
  }

  if (isCronAuthorized(req)) return NextResponse.next()

  const session = await getSession(req)
  if (!canAccessProtectedPath(pathname, session?.role, session?.modules ?? [])) {
    if (isProtectedApi(pathname)) {
      return NextResponse.json({ error: 'Acesso restrito a este sistema' }, { status: 403 })
    }
    return NextResponse.redirect(new URL('/', req.url))
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
    '/pessoas',
    '/pessoas/:path*',
    '/empresa',
    '/empresa/:path*',
    '/rh',
    '/rh/:path*',
    '/treinamentos',
    '/treinamentos/:path*',
    '/sistemas',
    '/sistemas/:path*',
    '/ajuda',
    '/ajuda/:path*',
    '/flow',
    '/flow/:path*',
    '/operacao',
    '/operacao/:path*',
    '/adm',
    '/adm/:path*',
    '/auditoria',
    '/auditoria/:path*',
    '/meu-faturamento',
    '/meu-faturamento/:path*',
    '/api/:path*',
  ],
}
