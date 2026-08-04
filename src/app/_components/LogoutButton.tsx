'use client'

import { useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { useState } from 'react'
import posthog from 'posthog-js'

type Props = {
  className?: string
  label?: string
  compact?: boolean
}

export function LogoutButton({ className = '', label = 'Sair', compact = false }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function logout() {
    setLoading(true)
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
      posthog.capture('user_logged_out')
      posthog.reset()
      router.push('/login?logged_out=1')
      router.refresh()
    } catch {
      setLoading(false)
    }
  }

  return (
    <button
      type="button"
      onClick={logout}
      disabled={loading}
      className={`inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground/90 transition-colors hover:bg-card disabled:opacity-60 ${className}`}
    >
      <LogOut size={16} />
      {!compact && (loading ? 'Saindo…' : label)}
    </button>
  )
}
