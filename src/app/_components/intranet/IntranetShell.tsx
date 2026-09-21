'use client'

import type { ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { IntranetTopNav } from './IntranetTopNav'
import { RhWhatsAppFab } from './RhWhatsAppFab'
import { BottomNav } from '../BottomNav'

export function IntranetShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const inFlow = pathname === '/flow' || pathname.startsWith('/flow/')
  return (
    <div className="intranet-shell">
      {/* No Flow mobile o chrome da intranet compete com o do Flow — some abaixo de lg. */}
      {inFlow ? (
        <div className="hidden lg:block">
          <IntranetTopNav />
        </div>
      ) : (
        <IntranetTopNav />
      )}
      <div className={inFlow ? '' : 'pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-0'}>{children}</div>
      {inFlow ? null : <BottomNav light />}
      {inFlow ? null : <RhWhatsAppFab />}
    </div>
  )
}

