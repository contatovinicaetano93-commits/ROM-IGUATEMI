'use client'

import { createContext, useContext, useEffect, useMemo, useState } from 'react'

export type ClientAuthRole = 'admin' | 'staff' | 'financeiro' | 'estoque'

export interface ClientSession {
  auth_enabled: boolean
  authenticated: boolean
  user: string | null
  role: ClientAuthRole | null
  can_view_revenue: boolean
  staff_login_configured?: boolean
}

interface SessionContextValue {
  session: ClientSession | null
  loading: boolean
}

const SessionContext = createContext<SessionContextValue>({
  session: null,
  loading: true,
})

/** Uma única leitura de /api/auth/session por shell — evita 3–4 fetches por navegação. */
export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<ClientSession | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetch('/api/auth/session', { credentials: 'include', cache: 'no-store' })
      .then((r) => r.json())
      .then((json) => {
        if (!cancelled) setSession((json.data as ClientSession) ?? null)
      })
      .catch(() => {
        if (!cancelled) setSession(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const value = useMemo(() => ({ session, loading }), [session, loading])
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useClientSession() {
  return useContext(SessionContext)
}
