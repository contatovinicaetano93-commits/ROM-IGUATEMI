'use client'

import { IntranetTopNav } from './IntranetTopNav'
import { BottomNav } from '../BottomNav'

export function IntranetShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="intranet-shell">
      <IntranetTopNav />
      <div className="pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-0">{children}</div>
      <BottomNav light />
    </div>
  )
}
