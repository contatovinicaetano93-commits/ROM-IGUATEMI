'use client'

import { Shield, UserRound } from 'lucide-react'
import { LogoutButton } from './LogoutButton'
import { useClientSession } from './SessionProvider'

export function AdminSessionBar({ className = '' }: { className?: string }) {
  const { session, loading } = useClientSession()

  if (loading || !session?.auth_enabled || !session.authenticated) return null

  const isAdmin = session.role === 'admin'
  const Icon = isAdmin ? Shield : UserRound
  const label =
    session.role === 'admin'
      ? 'Sessão admin'
      : session.role === 'financeiro'
        ? 'Sessão financeiro'
        : session.role === 'estoque'
          ? 'Sessão estoque'
          : 'Sessão equipe'

  return (
    <div className={`rounded-xl border border-gold/25 bg-gold/5 p-3 ${className}`}>
      <div className="mb-2 flex items-center gap-2">
        <Icon size={14} className="text-gold" />
        <div className="min-w-0">
          <p className="text-[0.65rem] uppercase tracking-wide text-muted">{label}</p>
          <p className="truncate text-sm font-medium text-gold">{session.user ?? '—'}</p>
          {!isAdmin && session.role === 'staff' && (
            <p className="mt-0.5 text-[0.65rem] text-muted">Sem acesso a faturamento</p>
          )}
        </div>
      </div>
      <LogoutButton className="w-full" label="Sair do sistema" />
    </div>
  )
}
