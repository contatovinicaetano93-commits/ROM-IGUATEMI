'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Bell, X } from 'lucide-react'
import { useClientSession } from '../SessionProvider'

type Notice = {
  id: string
  title: string
  body: string
  href: string | null
  created_at: string
}

function formatWhen(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(
    date,
  )
}

export function IntranetBell() {
  const router = useRouter()
  const { session } = useClientSession()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<Notice[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const canAudit = session != null && (!session.auth_enabled || session.role === 'admin')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/intranet/notifications', { credentials: 'include', cache: 'no-store' })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        setError(typeof json?.error === 'string' ? json.error : 'Não foi possível ler as notificações')
        return
      }
      setError(null)
      setItems((json?.data?.notifications as Notice[]) ?? [])
    } catch {
      setError('Não foi possível ler as notificações')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function markAll() {
    await fetch('/api/intranet/notifications', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ all: true }),
    })
    setItems([])
  }

  async function openItem(item: Notice) {
    await fetch('/api/intranet/notifications', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: item.id }),
    })
    setItems((prev) => prev.filter((row) => row.id !== item.id))
    setOpen(false)
    if (item.href) router.push(item.href)
  }

  return (
    <>
      <button
        type="button"
        className="relative flex h-10 w-10 items-center justify-center rounded-full text-foreground"
        aria-label={items.length > 0 ? `Notificações, ${items.length} não lidas` : 'Notificações'}
        onClick={() => {
          setOpen(true)
          void load()
        }}
      >
        <Bell size={18} />
        {items.length > 0 && (
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-gold-strong" />
        )}
      </button>
      {open && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/25" onClick={() => setOpen(false)} />
          <aside className="absolute right-3 top-16 w-[min(100%-1.5rem,22rem)] rounded-2xl border border-border bg-surface p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold">Notificações</p>
              <button type="button" aria-label="Fechar" onClick={() => setOpen(false)}>
                <X size={16} />
              </button>
            </div>
            {error ? (
              <p className="text-sm text-danger">{error}</p>
            ) : loading && items.length === 0 ? (
              <p className="text-sm text-muted">Carregando…</p>
            ) : items.length === 0 ? (
              <p className="text-sm text-muted">Nada novo por aqui.</p>
            ) : (
              <ul className="max-h-80 space-y-2 overflow-y-auto">
                {items.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => void openItem(item)}
                      className="w-full rounded-xl border border-border bg-background px-3 py-2 text-left"
                    >
                      <p className="text-sm font-medium">{item.title}</p>
                      {item.body ? <p className="text-xs text-muted">{item.body}</p> : null}
                      <p className="mt-1 text-[0.65rem] uppercase tracking-wide text-muted">{formatWhen(item.created_at)}</p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-3 flex items-center justify-between gap-2">
              {items.length > 0 ? (
                <button type="button" className="text-xs text-gold-strong" onClick={() => void markAll()}>
                  Marcar todas
                </button>
              ) : (
                <span />
              )}
              {canAudit ? (
                <Link href="/auditoria" className="text-xs text-muted" onClick={() => setOpen(false)}>
                  Auditoria
                </Link>
              ) : null}
            </div>
          </aside>
        </div>
      )}
    </>
  )
}
