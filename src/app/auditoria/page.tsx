'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { IntranetPage } from '../_components/intranet/IntranetPage'
import { useClientSession } from '../_components/SessionProvider'

type AuditRow = {
  id: string
  username: string
  role: string
  label: string
  resource: string
  href: string | null
  status: string
  created_at: string
}

function formatWhen(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export default function AuditoriaPage() {
  const { session, loading } = useClientSession()
  const [rows, setRows] = useState<AuditRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const canRead = session != null && (!session.auth_enabled || session.role === 'admin')

  useEffect(() => {
    if (loading || !canRead) return
    let cancelled = false
    fetch('/api/intranet/audit', { credentials: 'include', cache: 'no-store' })
      .then(async (res) => {
        const json = await res.json()
        if (!res.ok) throw new Error(json.error ?? 'Falha ao ler auditoria')
        if (!cancelled) setRows((json.data?.logs as AuditRow[]) ?? [])
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Falha ao ler auditoria')
      })
    return () => {
      cancelled = true
    }
  }, [canRead, loading])

  if (!loading && session?.auth_enabled && session.role !== 'admin') {
    return (
      <IntranetPage
        kicker="Registro"
        title="Auditoria"
        subtitle="Só o admin da unidade vê este histórico."
      />
    )
  }

  return (
    <IntranetPage
      kicker="Registro"
      title="Auditoria"
      subtitle="Quem publicou, aprovou no Rom Flow ou mudou acesso. Lista o que o sistema já gravou — se estiver vazia, ainda não houve ação."
    >
      {error && <p className="text-sm text-danger">{error}</p>}
      {rows && rows.length === 0 && !error && <p className="text-sm text-muted">Nenhum registro ainda.</p>}
      {rows && rows.length > 0 && (
        <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
          {rows.map((row) => (
            <li key={row.id} className="px-4 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-sm font-medium">{row.label}</p>
                <p className="shrink-0 text-[0.65rem] uppercase tracking-wide text-muted">{formatWhen(row.created_at)}</p>
              </div>
              <p className="text-xs text-muted">
                {row.username} · {row.role}
                {row.status === 'error' ? ' · erro' : ''}
              </p>
              {row.href ? (
                <Link href={row.href} className="mt-1 inline-block text-xs font-medium text-gold-strong">
                  Abrir
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </IntranetPage>
  )
}
