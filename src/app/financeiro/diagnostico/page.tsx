'use client'

import { useCallback, useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { SectionCard } from '../../_components/ui'
import { LogoutButton } from '../../_components/LogoutButton'
import { apiFetch } from '@/lib/api-client'

interface StockSyncRun {
  status: 'ok' | 'error' | 'partial'
  created_at: string
  error: string | null
}

interface HealthStatus {
  deployment?: { display_name: string; host: string | null }
  database: { connected: boolean; error: string | null }
  avec: { configured: boolean; mock: boolean; token: boolean }
  auth: { finance_configured: boolean; stock_configured: boolean }
  stock: { last_fast: StockSyncRun | null; last_full: StockSyncRun | null }
  telegram: {
    finance_bot_configured: boolean
    finance_bot_webhook_secret: boolean
    finance_bot_whitelist: boolean
  }
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

export default function FinanceiroDiagnosticoPage() {
  const [health, setHealth] = useState<HealthStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiFetch('/api/health', { cache: 'no-store' })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      setHealth(json.data)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return (
    <main className="mx-auto flex w-full max-w-[900px] flex-1 flex-col gap-6 px-5 py-6 lg:px-8 lg:py-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-[0.65rem] uppercase tracking-[0.25em] text-gold">Financeiro</p>
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
              label="Avec (faturamento / pagamentos)"
              ok={health.avec.token}
              hint={health.avec.mock ? 'mock ativo' : health.avec.token ? undefined : 'aguardando AVEC_API_TOKEN'}
            />
            <HealthRow label="Login financeiro" ok={health.auth.finance_configured} hint="ROM_FINANCE_USER/PASSWORD" />
            <HealthRow label="Login estoque" ok={health.auth.stock_configured} hint="ROM_STOCK_USER/PASSWORD" />
          </div>
        ) : (
          <div className="h-24 animate-pulse rounded-xl bg-border" />
        )}
      </SectionCard>

      <SectionCard title="Sync de estoque (acesso duplo)">
        {health ? (
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted">Saldo + alertas (fast)</span>
              <span className="text-xs">
                {health.stock.last_fast
                  ? `${health.stock.last_fast.status} · ${fmtIso(health.stock.last_fast.created_at)}`
                  : 'nunca'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted">Movimentos + valorização (full)</span>
              <span className="text-xs">
                {health.stock.last_full
                  ? `${health.stock.last_full.status} · ${fmtIso(health.stock.last_full.created_at)}`
                  : 'nunca'}
              </span>
            </div>
            <p className="text-xs text-muted">
              Gerenciar produtos, movimentos e alertas: <a href="/estoque" className="text-gold hover:underline">/estoque</a>
            </p>
          </div>
        ) : (
          <div className="h-16 animate-pulse rounded-xl bg-border" />
        )}
      </SectionCard>

      <SectionCard title="Bot Telegram (financeiro)">
        {health ? (
          <div className="text-sm">
            <HealthRow label="Token do bot" ok={health.telegram.finance_bot_configured} hint="TELEGRAM_FINANCE_BOT_TOKEN" />
            <HealthRow label="Webhook secret" ok={health.telegram.finance_bot_webhook_secret} hint="TELEGRAM_FINANCE_WEBHOOK_SECRET" />
            <HealthRow label="Lista de chats permitidos" ok={health.telegram.finance_bot_whitelist} hint="TELEGRAM_FINANCE_CHAT_IDS" />
            <p className="mt-3 text-xs text-muted">
              Comandos: <code className="text-[0.7rem]">/financeiro</code> e{' '}
              <code className="text-[0.7rem]">/estoque</code> · webhook em{' '}
              <code className="text-[0.7rem]">/api/webhooks/telegram-financeiro</code>
            </p>
          </div>
        ) : (
          <div className="h-16 animate-pulse rounded-xl bg-border" />
        )}
      </SectionCard>

      <SectionCard title="Endpoints úteis">
        <ul className="space-y-2 text-xs text-muted">
          {['/api/financeiro/kpis', '/api/financeiro/despesas', '/api/financeiro/categorias'].map((href) => (
            <li key={href}>
              <a href={href} target="_blank" rel="noreferrer" className="text-gold hover:underline">
                {href}
              </a>
              <span> — JSON bruto</span>
            </li>
          ))}
        </ul>
      </SectionCard>
    </main>
  )
}
