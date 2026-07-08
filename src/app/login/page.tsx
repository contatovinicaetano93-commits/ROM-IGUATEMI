'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { PrimaryButton } from '../_components/ui'
import { sanitizeRedirectPath } from '@/lib/auth-redirect'

function LoginForm() {
  const router = useRouter()
  const params = useSearchParams()
  const next = sanitizeRedirectPath(params.get('next'))
  const loggedOut = params.get('logged_out') === '1'
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
        credentials: 'include',
      })
      const json = await res.json()
      if (!res.ok || json.error) {
        setError(json.error ?? 'Usuário ou senha incorretos')
        return
      }
      router.push(next)
      router.refresh()
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6">
      <p className="text-[0.65rem] uppercase tracking-[0.25em] text-gold">ROM Iguatemi</p>
      <h1 className="mt-2 text-xl font-semibold">Acesso da equipe</h1>
      <p className="mt-2 text-sm text-muted">Painel, contatos e playbook · unidade Iguatemi.</p>
      {loggedOut && (
        <p className="mt-3 rounded-xl border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
          Você saiu do sistema. Entre novamente para continuar.
        </p>
      )}
      <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs uppercase tracking-wide text-muted">Usuário</span>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            autoComplete="username"
            autoFocus
            placeholder="ADMIN-IGUATEMI"
            className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-base outline-none focus:border-gold"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs uppercase tracking-wide text-muted">Senha</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            placeholder="Senha da unidade"
            className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-base outline-none focus:border-gold"
          />
        </label>
        {error && <p className="text-sm text-danger">{error}</p>}
        <PrimaryButton type="submit" disabled={loading}>
          {loading ? 'Entrando…' : 'Entrar'}
        </PrimaryButton>
      </form>
    </div>
  )
}

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh w-full items-center justify-center bg-background px-5 py-8">
      <Suspense fallback={<div className="h-72 w-full max-w-sm animate-pulse rounded-2xl bg-card" />}>
        <LoginForm />
      </Suspense>
    </main>
  )
}
