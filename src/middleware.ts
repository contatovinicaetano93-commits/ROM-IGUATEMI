import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { isAuthorized, isAuthEnabled } from '@/lib/auth'

const PUBLIC_API_PREFIXES = ['/api/auth', '/api/health', '/api/webhooks']

function isPublicApi(pathname: string) {
  return PUBLIC_API_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

function isProtectedPage(pathname: string) {
  return (
    pathname === '/' ||
    pathname === '/hoje' ||
    pathname === '/dashboard' ||
    pathname === '/contatos' ||
    pathname.startsWith('/contatos/') ||
    pathname === '/admin' ||
    pathname.startsWith('/admin/')
  )
}

function isProtectedApi(pathname: string) {
  return pathname.startsWith('/api/') && !isPublicApi(pathname)
}

export async function middleware(req: NextRequest) {
  if (!isAuthEnabled()) return NextResponse.next()

  const { pathname } = req.nextUrl
  if (pathname === '/login') return NextResponse.next()

  const needsAuth = isProtectedPage(pathname) || isProtectedApi(pathname)
  if (!needsAuth) return NextResponse.next()

  const allowHeaderTokens =
    pathname === '/api/avec/sync' || pathname === '/api/director-report'
  if (await isAuthorized(req, { allowHeaderTokens })) return NextResponse.next()

  if (isProtectedApi(pathname)) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const login = new URL('/login', req.url)
  login.searchParams.set('next', pathname === '/' ? '/hoje' : pathname)
  return NextResponse.redirect(login)
}

export const config = {
  matcher: ['/', '/hoje', '/dashboard', '/contatos', '/contatos/:path*', '/admin', '/admin/:path*', '/api/:path*'],
}
