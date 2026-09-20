'use client'

import { useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { useState } from 'react'

type Props = {
  className?: string
  label?: string
  compact?: boolean
}

export function LogoutButton({ className = 'inline-flex', label = 'Sair', compact = false }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function logout() {
    setLoading(true)
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
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
      aria-label={loading ? 'Saindo…' : label}
      title={label}
      className={`items-center justify-center rounded-xl border border-border bg-surface text-sm font-medium text-foreground/90 transition-colors hover:bg-card disabled:opacity-60 ${
        compact ? 'h-9 w-9 shrink-0 gap-0 p-0' : 'gap-2 px-3 py-2'
      } ${className}`}
    >
      <LogOut size={compact ? 18 : 16} aria-hidden />
      {!compact && (loading ? 'Saindo…' : label)}
    </button>
  )
}
