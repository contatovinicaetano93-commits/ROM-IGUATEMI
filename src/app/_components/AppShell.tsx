'use client'

import { usePathname } from 'next/navigation'
import { SessionProvider } from './SessionProvider'
import { IntranetShell } from './intranet/IntranetShell'

const STANDALONE_PATHS = ['/login']

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  if (STANDALONE_PATHS.includes(pathname)) {
    return <>{children}</>
  }

  return (
    <SessionProvider>
      <IntranetShell>{children}</IntranetShell>
    </SessionProvider>
  )
}
