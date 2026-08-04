'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Eye, EyeOff } from 'lucide-react'
import { PrimaryButton } from '../_components/ui'
import { sanitizeRedirectPath } from '@/lib/auth-redirect'
import { getBrand } from '@/lib/brand'
import posthog from 'posthog-js'

function LoginForm() {
  const brand = getBrand()
  const params = useSearchParams()
  const next = sanitizeRedirectPath(params.get('next'))
  const loggedOut = params.get('logged_out') === '1'
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
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
        body: JSON.stringify({
          username: username.trim(),
          password: password.trim(),
        }),
        credentials: 'include',
      })
      const json = await res.json()
      if (!res.ok || json.error) {
        setError(json.error ?? 'Usuário ou senha incorretos')
        return
      }
      // Financeiro/estoque têm painel próprio — não faz sentido cair no playbook do dia por padrão.
      const role = json.data?.role
      const dest =
        role === 'financeiro' && !next.startsWith('/financeiro')
          ? '/financeiro'
          : role === 'estoque' && !next.startsWith('/estoque')
            ? '/estoque'
            : next
      posthog.identify(json.data?.user ?? username.trim(), { role })
      posthog.capture('user_logged_in', { role })
      // Hard navigation garante que o cookie da sessão seja lido pelo middleware
      window.location.assign(dest)
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6">
      <p className="text-[0.65rem] uppercase tracking-[0.25em] text-gold">{brand.displayName}</p>
      <h1 className="mt-2 text-xl font-semibold">Acesso da equipe</h1>
      <p className="mt-2 text-sm text-muted">{brand.loginSubtitle}</p>
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
            placeholder="Usuário"
            spellCheck={false}
            autoCapitalize="characters"
            className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-base outline-none focus:border-gold"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs uppercase tracking-wide text-muted">Senha</span>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              placeholder="Senha"
              className="w-full rounded-xl border border-border bg-surface px-4 py-3 pr-12 text-base outline-none focus:border-gold"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-muted active:text-foreground"
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
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
