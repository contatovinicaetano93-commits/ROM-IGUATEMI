/** Rotas do shell da intranet (home clara + páginas-shell). */
export const INTRANET_PAGE_PREFIXES = [
  '/pessoas',
  '/empresa',
  '/rh',
  '/treinamentos',
  '/onboarding',
  '/sistemas',
  '/ajuda',
  '/flow',
  '/operacao',
  '/auditoria',
] as const

export function isIntranetShellPath(pathname: string): boolean {
  if (pathname === '/') return true
  return INTRANET_PAGE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

export function isIntranetApiPath(pathname: string): boolean {
  return (
    pathname.startsWith('/api/intranet') ||
    pathname.startsWith('/api/flow') ||
    pathname.startsWith('/api/employees') ||
    pathname.startsWith('/api/cms')
  )
}

export function isIntranetPath(pathname: string): boolean {
  return isIntranetShellPath(pathname) || isIntranetApiPath(pathname)
}
