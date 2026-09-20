import type { ReactNode } from 'react'
import '../rom-flow.css'
import { FlowClientStoreProvider } from '../_components/flow/flow-client-store'

export default function FlowLayout({ children }: { children: ReactNode }) {
  return (
    <div className="rom-flow">
      <FlowClientStoreProvider>{children}</FlowClientStoreProvider>
    </div>
  )
}
