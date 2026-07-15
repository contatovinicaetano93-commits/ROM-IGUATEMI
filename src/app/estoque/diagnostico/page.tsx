'use client'

import { useCallback, useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { SectionCard, PrimaryButton } from '../../_components/ui'
import { LogoutButton } from '../../_components/LogoutButton'
import { apiFetch } from '@/lib/api-client'

interface StockSyncRun {
  status: 'ok' | 'error' | 'partial'
  created_at: string
  error: string | null
  stats?: Record<string, unknown>
}

interface HealthStatus {
  deployment?: { display_name: string; host: string | null }
  database: { connected: boolean; error: string | null }
  avec: { configured: boolean; mock: boolean; token: boolean }
  auth: { finance_configured: boolean; stock_configured: boolean }
  stock: { last_fast: StockSyncRun | null; last_full: StockSyncRun | null }
}

interface SyncPlan {
  fast: { id: string; name: string }[]
  full: { id: string; name: string }[]
}

function fmtIso(iso: string | null) {
  return iso ? new Date(iso).toLocaleString('pt-BR') : '—'
}

function HealthRow({ label, ok, hint }: { label: string; ok: boolean; hint?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-muted">{label}</span>
      <span className={`text-xs font-semibold ${ok ? 'text-success' : 'text-warning'}`}>
        {ok ? 'OK' : 'Pendente'}
        {hint ? ` · ${hint}` : ''}
      </span>
    </div>
  )
}

export default function EstoqueDiagnosticoPage() {
  const [health, setHealth] = useState<HealthStatus | null>(null)
  const [plan, setPlan] = useState<SyncPlan | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [syncing, setSyncing] = useState<'fast' | 'full' | null>(null)
  const [syncMsg, setSyncMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [healthRes, statusRes] = await Promise.all([
        apiFetch('/api/health', { cache: 'no-store' }),
        apiFetch('/api/estoque/sync/status', { cache: 'no-store' }),
      ])
      const [healthJson, statusJson] = await Promise.all([healthRes.json(), statusRes.json()])
      if (healthJson.error) throw new Error(healthJson.error)
      setHealth(healthJson.data)
      if (statusJson.data?.plan) setPlan(statusJson.data.plan)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function runSync(mode: 'fast' | 'full') {
    setSyncing(mode)
    setSyncMsg(null)
    try {
      const res = await apiFetch(`/api/estoque/sync?mode=${mode}`, { method: 'POST', cache: 'no-store' })
      const json = await res.json()
      if (json.error) setSyncMsg(`Erro: ${json.error}`)
      else setSyncMsg(`Sync ${mode} — ${json.data?.status ?? 'ok'}`)
      await load()
    } catch (e) {
      setSyncMsg(e instanceof Error ? e.message : String(e))
    } finally {
      setSyncing(null)
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-[900px] flex-1 flex-col gap-6 px-5 py-6 lg:px-8 lg:py-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-[0.65rem] uppercase tracking-[0.25em] text-gold">Estoque</p>
          <h1 className="mt-1 text-xl font-semibold lg:text-2xl">Diagnóstico</h1>
        </div>
        <div className="flex items-center gap-2">
          <LogoutButton label="Sair" />
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-gold/40 bg-gold/10 px-4 py-2.5 text-sm font-semibold text-gold disabled:opacity-60"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            Atualizar
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</div>
      )}

      <SectionCard title="Configuração desta unidade">
        {health ? (
          <div className="text-sm">
            {health.deployment && (
              <p className="mb-2 text-xs text-muted">
                {health.deployment.display_name}
                {health.deployment.host ? ` · ${health.deployment.host}` : ''}
              </p>
            )}
            <HealthRow label="Banco de dados" ok={health.database.connected} hint={health.database.error ?? undefined} />
            <HealthRow
              label="Avec (relatórios de estoque)"
              ok={health.avec.token}
              hint={health.avec.mock ? 'mock ativo' : health.avec.token ? undefined : 'aguardando AVEC_API_TOKEN'}
            />
            <HealthRow label="Login estoque" ok={health.auth.stock_configured} hint="ROM_STOCK_USER/PASSWORD" />
            <HealthRow label="Login financeiro (acesso duplo)" ok={health.auth.finance_configured} />
          </div>
        ) : (
          <div className="h-24 animate-pulse rounded-xl bg-border" />
        )}
      </SectionCard>

      <SectionCard title="Sincronização">
        {health ? (
          <div className="space-y-4 text-sm">
            <div>
              <div className="flex items-center justify-between">
                <span className="font-medium">Saldo + alertas (fast)</span>
                <span
                  className={`text-xs font-semibold ${
                    health.stock.last_fast?.status === 'error' ? 'text-danger' : 'text-muted'
                  }`}
                >
                  {health.stock.last_fast
                    ? `${health.stock.last_fast.status} · ${fmtIso(health.stock.last_fast.created_at)}`
                    : 'nunca sincronizado'}
                </span>
              </div>
              {plan?.fast && (
                <p className="mt-1 text-xs text-muted">
                  Relatórios: {plan.fast.map((r) => `${r.id} (${r.name})`).join(', ')}
                </p>
              )}
              <button
                type="button"
                onClick={() => runSync('fast')}
                disabled={syncing !== null || !health.avec.token}
                className="mt-2 w-full rounded-xl border border-border bg-surface py-2.5 text-sm font-medium text-foreground/90 disabled:opacity-50 lg:hover:bg-card"
              >
                {syncing === 'fast' ? 'Sincronizando…' : 'Rodar sync fast agora'}
              </button>
            </div>

            <div className="border-t border-border pt-4">
              <div className="flex items-center justify-between">
                <span className="font-medium">Movimentos + valorização (full)</span>
                <span
                  className={`text-xs font-semibold ${
                    health.stock.last_full?.status === 'error' ? 'text-danger' : 'text-muted'
                  }`}
                >
                  {health.stock.last_full
                    ? `${health.stock.last_full.status} · ${fmtIso(health.stock.last_full.created_at)}`
                    : 'nunca sincronizado'}
                </span>
              </div>
              {plan?.full && (
                <p className="mt-1 text-xs text-muted">
                  Relatórios: {plan.full.map((r) => `${r.id} (${r.name})`).join(', ')}
                </p>
              )}
              <PrimaryButton
                type="button"
                onClick={() => runSync('full')}
                disabled={syncing !== null || !health.avec.token}
              >
                {syncing === 'full' ? 'Sincronizando…' : 'Rodar sync full agora'}
              </PrimaryButton>
            </div>

            {!health.avec.token && (
              <p className="rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
                Aguardando AVEC_API_TOKEN — o sync não roda sem o token da unidade.
              </p>
            )}
            {syncMsg && <p className="text-xs text-muted">{syncMsg}</p>}
          </div>
        ) : (
          <div className="h-24 animate-pulse rounded-xl bg-border" />
        )}
      </SectionCard>

      <SectionCard title="Endpoints úteis">
        <ul className="space-y-2 text-xs text-muted">
          {['/api/estoque/kpis', '/api/estoque/produtos', '/api/estoque/movimentos', '/api/estoque/alertas', '/api/estoque/sync/status'].map(
            (href) => (
              <li key={href}>
                <a href={href} target="_blank" rel="noreferrer" className="text-gold hover:underline">
                  {href}
                </a>
                <span> — JSON bruto</span>
              </li>
            )
          )}
        </ul>
      </SectionCard>
    </main>
  )
}
