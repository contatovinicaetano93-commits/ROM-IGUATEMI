'use client'

import type { ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { IntranetTopNav } from './IntranetTopNav'
import { BottomNav } from '../BottomNav'

export function IntranetShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const inFlow = pathname === '/flow' || pathname.startsWith('/flow/')
  return (
    <div className="intranet-shell">
      <IntranetTopNav />
      <div className={inFlow ? '' : 'pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-0'}>{children}</div>
      {inFlow ? null : <BottomNav light />}
    </div>
  )
}

