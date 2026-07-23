'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { RefreshCw, ChevronRight, Database, Link2 } from 'lucide-react'
import { SectionCard, CountBadge, StatusPill, CHANNEL_LABEL, PrimaryButton } from '../_components/ui'
import { LogoutButton } from '../_components/LogoutButton'
import { SetupChecklist } from './SetupChecklist'
import { apiFetch } from '@/lib/api-client'
import { getBrand } from '@/lib/brand'
import type { RomSeedPreset } from '@/lib/brand'

interface KpiData {
  byDay: { day: string; channel: string; contacts_count: number }[]
  byStatus: { status: string; contacts_count: number }[]
  conversion: { conversion_rate: number; total_contacts: number } | null
}

interface ContactRow {
  id: string
  name: string | null
  phone: string | null
  channel: string
  status: string
  overdue: number
  due_soon: number
  scheduled_soon: number
  pending_actions: number
  urgency_score: number
  top_action: string | null
}

interface ScheduleRow {
  id: string
  contact_id: string
  contact_name: string | null
  name: string
  scheduled_at: string
}

interface AvecStatus {
  configured: boolean
  mock?: boolean
  base_url?: string
  docs?: string
  connection?: { ok: boolean; sample_rows?: number; error?: string }
  cron?: { schedule?: string; cadence?: string; path?: string }
  last: {
    status: string
    created_at: string
    stats: Record<string, unknown>
    error: string | null
  } | null
}

interface HealthStatus {
  ok: boolean
  deployment?: { panel: string; display_name: string; host: string | null; vercel_env: string | null }
  validation?: { ok: boolean; warnings: string[] }
  database: { configured: boolean; connected: boolean; error: string | null }
  claude: { configured: boolean; model?: string }
  avec: {
    configured: boolean
    mock: boolean
    token: boolean
    webhook_secret?: boolean
    webhook_url?: string
  }
  whatsapp: { configured: boolean }
  telegram: { configured: boolean; webhook_secret: boolean }
  cron: { configured: boolean }
  webhooks?: { avec_secret?: boolean }
  auth: { enabled: boolean; password?: boolean; user?: boolean }
  panel?: { id: string; display_name: string; seed_preset: string }
}

type LoadState = 'loading' | 'ok' | 'error'

function fmtIso(iso: string) {
  return new Date(iso).toLocaleString('pt-BR')
}

export default function AdminPage() {
  const brand = getBrand()
  const [state, setState] = useState<LoadState>('loading')
  const [error, setError] = useState<string | null>(null)
  const [kpis, setKpis] = useState<KpiData | null>(null)
  const [contacts, setContacts] = useState<ContactRow[]>([])
  const [schedule, setSchedule] = useState<ScheduleRow[]>([])
  const [avec, setAvec] = useState<AvecStatus | null>(null)
  const [health, setHealth] = useState<HealthStatus | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [seeding, setSeeding] = useState(false)
  const [seedMsg, setSeedMsg] = useState<string | null>(null)
  const [seedPreset, setSeedPreset] = useState<RomSeedPreset>(brand.panel)
  const [syncMsg, setSyncMsg] = useState<string | null>(null)
  const [connMsg, setConnMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    setState('loading')
    setError(null)
    try {
      const [k, c, s, a, h] = await Promise.all([
        apiFetch('/api/kpis', { cache: 'no-store' }).then((r) => r.json()),
        apiFetch('/api/contacts?sort=urgency', { cache: 'no-store' }).then((r) => r.json()),
        apiFetch('/api/schedule', { cache: 'no-store' }).then((r) => r.json()),
        apiFetch('/api/avec/sync', { cache: 'no-store' }).then((r) => r.json()),
        apiFetch('/api/health', { cache: 'no-store' }).then((r) => r.json()),
      ])

      const errs: string[] = []
      if (k.error) errs.push(`KPIs: ${k.error}`)
      else setKpis(k.data)

      if (c.error) errs.push(`Contatos: ${c.error}`)
      else setContacts(c.data ?? [])

      if (s.error) errs.push(`Agendamentos: ${s.error}`)
      else setSchedule(s.data ?? [])

      if (a.error) errs.push(`Avec: ${a.error}`)
      else setAvec(a.data)

      if (h.error) errs.push(`Health: ${h.error}`)
      else setHealth(h.data)

      if (errs.length) {
        setError(errs.join(' · '))
        setState('error')
      } else {
        setState('ok')
      }
    } catch (e) {
      setError(String(e))
      setState('error')
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function testAvec() {
    setConnMsg('Testando…')
    try {
      const res = await apiFetch('/api/avec/sync?test=1', { cache: 'no-store' })
      const json = await res.json()
      const c = json.data?.connection
      if (c?.ok) setConnMsg(`OK — ${c.sample_rows ?? 0} linha(s) no relatório 0004`)
      else setConnMsg(`Falhou: ${c?.error ?? json.error ?? 'erro desconhecido'}`)
      if (json.data) setAvec(json.data)
    } catch (e) {
      setConnMsg(String(e))
    }
  }

  async function runAvecSync() {
    setSyncing(true)
    setSyncMsg(null)
    try {
      const res = await apiFetch('/api/avec/sync', { method: 'POST', cache: 'no-store' })
      const json = await res.json()
      if (json.error) setSyncMsg(`Erro: ${json.error}`)
      else setSyncMsg(`Sync ${json.data?.status ?? 'ok'} — recarregando…`)
      await load()
    } catch (e) {
      setSyncMsg(String(e))
    } finally {
      setSyncing(false)
    }
  }

  async function runSeed() {
    setSeeding(true)
    setSeedMsg(null)
    try {
      const res = await apiFetch('/api/seed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preset: seedPreset }),
      })
      const json = await res.json()
      if (json.error) setSeedMsg(`Erro: ${json.error}`)
      else setSeedMsg(json.data?.message ?? 'Seed concluído')
      await load()
    } catch (e) {
      setSeedMsg(String(e))
    } finally {
      setSeeding(false)
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-6 px-5 py-6 lg:gap-8 lg:px-8 lg:py-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[0.65rem] uppercase tracking-[0.25em] text-gold">{brand.displayName}</p>
          <h1 className="mt-1 text-xl font-semibold lg:text-2xl">APIs &amp; dados ao vivo</h1>
          <p className="mt-1 text-xs text-muted">
            Mesmos endpoints que o app consome — formatados pra conferência rápida.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <LogoutButton label="Sair" />
          <button
            type="button"
            onClick={load}
            disabled={state === 'loading'}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-gold/40 bg-gold/10 px-4 py-2.5 text-sm font-semibold text-gold disabled:opacity-60 lg:hover:bg-gold/15"
          >
            <RefreshCw size={16} className={state === 'loading' ? 'animate-spin' : ''} />
            Atualizar
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</div>
      )}

      {health?.validation && health.validation.warnings.length > 0 && (
        <div className="rounded-2xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning">
          <p className="font-semibold">Atenção na configuração desta instância</p>
          <ul className="mt-2 list-inside list-disc space-y-1 text-xs">
            {health.validation.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {health?.deployment && (
        <div className="rounded-2xl border border-border bg-card px-4 py-3 text-sm">
          <p className="text-xs text-muted">Instância Vercel</p>
          <p className="font-medium">{health.deployment.display_name}</p>
          <p className="mt-0.5 text-xs text-muted">
            painel={health.deployment.panel}
            {health.deployment.host ? ` · ${health.deployment.host}` : ''}
            {health.deployment.vercel_env ? ` · ${health.deployment.vercel_env}` : ''}
          </p>
        </div>
      )}

      <Link
        href="/admin/relatorio-diretoria"
        className="flex items-center justify-between gap-3 rounded-2xl border border-gold/30 bg-gold/5 px-5 py-4 transition-colors hover:bg-gold/10"
      >
        <div>
          <p className="text-[0.65rem] uppercase tracking-[0.2em] text-gold">Diretoria</p>
          <p className="mt-1 font-semibold">Relatório semanal (2 etapas)</p>
          <p className="mt-0.5 text-xs text-muted">
            Etapa 1 · 0011 trimestre vs trimestre · Etapa 2 · 0021 mês vs mês · terças 08:00
          </p>
        </div>
        <ChevronRight size={20} className="shrink-0 text-gold" />
      </Link>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="Configuração" badge={<EndpointBadge path="/api/health" />}>
          {health ? (
            <div className="space-y-2 text-sm">
              <HealthRow label="Banco de dados" ok={health.database.connected} detail={health.database.error ?? undefined} />
              <HealthRow
                label="Claude (Anthropic)"
                ok={health.claude.configured}
                hint={health.claude.configured ? health.claude.model ?? 'ativo' : 'ANTHROPIC_API_KEY'}
              />
              <HealthRow label="Avec token" ok={health.avec.token} hint={health.avec.mock ? 'mock ativo' : undefined} />
              <HealthRow
                label="Webhook Avec (tempo real)"
                ok={Boolean(health.avec.webhook_secret ?? health.webhooks?.avec_secret)}
                hint={health.avec.webhook_url ?? '/api/webhooks/avec'}
              />
              <HealthRow label="WhatsApp (Cloud API)" ok={health.whatsapp.configured} />
              <HealthRow label="Telegram bot" ok={health.telegram.configured} />
              <HealthRow label="CRON_SECRET (backup)" ok={health.cron.configured} />
              <HealthRow
                label="Proteção /admin"
                ok={health.auth.enabled}
                hint={
                  health.auth.enabled
                    ? health.auth.user
                      ? 'ativa'
                      : 'ativa (user padrão: admin)'
                    : 'livre — configure ROM_ADMIN_PASSWORD'
                }
              />
              <div className="border-t border-border pt-4">
                <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted">Como resolver pendentes</p>
                <SetupChecklist health={health} />
              </div>
              <div className="border-t border-border pt-4">
                <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted">Dados de demonstração</p>
                <label className="mb-3 flex flex-col gap-1.5">
                  <span className="text-xs text-muted">Preset do seed</span>
                  <select
                    value={seedPreset}
                    onChange={(e) => setSeedPreset(e.target.value as RomSeedPreset)}
                    className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-gold"
                  >
                    <option value="brasil">{getBrand('brasil').displayName}</option>
                    <option value="iguatemi">{getBrand('iguatemi').displayName}</option>
                  </select>
                </label>
              </div>
              <button
                type="button"
                onClick={runSeed}
                disabled={seeding}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-gold/40 bg-gold/10 py-3 text-sm font-semibold text-gold disabled:opacity-60"
              >
                {seeding ? 'Criando demo…' : `Popular seed ${getBrand(seedPreset).displayName}`}
              </button>
              {seedMsg && <p className="text-xs text-muted">{seedMsg}</p>}
            </div>
          ) : (
            <Skeleton />
          )}
        </SectionCard>

        <SectionCard
          title="KPIs"
          badge={<EndpointBadge path="/api/kpis" />}
        >
          {state === 'loading' && !kpis ? (
            <Skeleton />
          ) : kpis ? (
            <div className="space-y-3 text-sm">
              <Row label="Contatos totais" value={String(kpis.conversion?.total_contacts ?? 0)} highlight />
              <Row
                label="Taxa de conversão"
                value={`${((kpis.conversion?.conversion_rate ?? 0) * 100).toFixed(1)}%`}
              />
              <div className="border-t border-border pt-3">
                <p className="mb-2 text-xs font-medium text-muted">Por status</p>
                {kpis.byStatus.map((r) => (
                  <div key={r.status} className="flex items-center justify-between py-1.5">
                    <StatusPill status={r.status} />
                    <span className="font-semibold tabular-nums">{r.contacts_count}</span>
                  </div>
                ))}
              </div>
              <div className="border-t border-border pt-3">
                <p className="mb-2 text-xs font-medium text-muted">Por dia / canal</p>
                {kpis.byDay.length === 0 && <p className="text-xs text-muted">Sem dados.</p>}
                {kpis.byDay.map((r, i) => (
                  <p key={i} className="py-1 text-xs text-foreground/90">
                    {fmtIso(r.day).slice(0, 10)} · {CHANNEL_LABEL[r.channel] ?? r.channel} ·{' '}
                    <span className="font-semibold text-gold">{r.contacts_count}</span>
                  </p>
                ))}
              </div>
            </div>
          ) : (
            <Empty />
          )}
        </SectionCard>

        <SectionCard
          title="Sync Avec"
          badge={<EndpointBadge path="/api/avec/sync" />}
        >
          {avec ? (
            <div className="space-y-3 text-sm">
              <Row label="Base URL" value={avec.base_url ?? 'https://api.avec.beauty'} />
              <Row
                label="Token"
                value={
                  avec.mock
                    ? 'Modo mock (AVEC_MOCK)'
                    : avec.configured
                      ? 'Configurado'
                      : 'Não — adicione AVEC_API_TOKEN na Vercel'
                }
                highlight={avec.configured}
              />
              {avec.docs && (
                <p className="text-xs text-muted">
                  <a href={avec.docs} target="_blank" rel="noreferrer" className="text-gold hover:underline">
                    Documentação Postman Avec
                  </a>
                </p>
              )}
              {avec.last ? (
                <>
                  <Row label="Último status" value={avec.last.status} />
                  <Row label="Quando" value={fmtIso(avec.last.created_at)} />
                  {avec.last.error && <p className="text-xs text-danger">{avec.last.error}</p>}
                  {Array.isArray(avec.last.stats?.warnings) && avec.last.stats.warnings.length > 0 && (
                    <div className="space-y-1 rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
                      {(avec.last.stats.warnings as string[]).map((w) => (
                        <p key={w}>{w}</p>
                      ))}
                    </div>
                  )}
                  <pre className="overflow-x-auto rounded-xl bg-surface p-3 text-[0.65rem] text-muted">
                    {JSON.stringify(avec.last.stats, null, 2)}
                  </pre>
                </>
              ) : (
                <p className="text-xs text-muted">Nenhuma sincronização registrada ainda.</p>
              )}
              <button
                type="button"
                onClick={testAvec}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-surface py-3 text-sm font-semibold text-foreground/90 lg:hover:bg-card"
              >
                Testar conexão (relatório 0004)
              </button>
              {connMsg && <p className="text-xs text-muted">{connMsg}</p>}
              <p className="rounded-xl border border-gold/30 bg-gold/5 px-3 py-2 text-xs text-foreground/80">
                <span className="font-semibold text-gold">Tempo real:</span> webhook{' '}
                <code className="text-[0.7rem]">/api/webhooks/avec</code> (header{' '}
                <code className="text-[0.7rem]">x-avec-secret</code>). Cron fast 5 min + full 10 min
                como backup; webhook dispara sync em tempo real.
              </p>
              <PrimaryButton type="button" onClick={runAvecSync} disabled={syncing || !avec.configured}>
                {syncing ? 'Sincronizando…' : 'Rodar sync agora (POST)'}
              </PrimaryButton>
              {syncMsg && <p className="text-xs text-muted">{syncMsg}</p>}
            </div>
          ) : (
            <Skeleton />
          )}
        </SectionCard>

        <SectionCard
          title="Contatos (urgência)"
          storageKey="admin.section.contatos-urgencia.open"
          badge={<CountBadge value={String(contacts.length)} />}
          className="lg:col-span-2"
        >
          <p className="mb-3 text-[0.65rem] text-muted">
            <Link2 size={11} className="mr-1 inline" />
            GET /api/contacts?sort=urgency
          </p>
          {contacts.length === 0 && state !== 'loading' ? (
            <Empty />
          ) : (
            <div className="divide-y divide-border">
              {contacts.map((c) => (
                <Link
                  key={c.id}
                  href={`/contatos/${c.id}`}
                  className="flex items-center gap-3 py-3 first:pt-0 last:pb-0 lg:hover:bg-surface/50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{c.name ?? c.phone ?? 'Sem nome'}</p>
                    <p className="mt-0.5 truncate text-xs text-muted">
                      {CHANNEL_LABEL[c.channel] ?? c.channel}
                      {c.top_action ? ` · ${c.top_action}` : ''}
                      {c.pending_actions > 0 ? ` · ${c.pending_actions} ação(ões)` : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {c.overdue > 0 && <CountBadge value={`${c.overdue} atras.`} tone="danger" />}
                    {c.due_soon > 0 && <CountBadge value={`${c.due_soon} venc.`} tone="gold" />}
                    <StatusPill status={c.status} />
                    <ChevronRight size={16} className="text-muted" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Agendamentos"
          badge={<CountBadge value={String(schedule.length)} />}
          className="lg:col-span-2"
        >
          <p className="mb-3 text-[0.65rem] text-muted">
            <Link2 size={11} className="mr-1 inline" />
            GET /api/schedule
          </p>
          {schedule.length === 0 && state !== 'loading' ? (
            <p className="py-6 text-center text-sm text-muted">Nenhum agendamento nos próximos 7 dias.</p>
          ) : (
            <div className="divide-y divide-border">
              {schedule.map((s) => (
                <Link
                  key={s.id}
                  href={`/contatos/${s.contact_id}`}
                  className="flex items-center justify-between gap-3 py-3 lg:hover:bg-surface/50"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{s.contact_name ?? 'Cliente'}</p>
                    <p className="text-xs text-sky-300">{s.name}</p>
                  </div>
                  <span className="shrink-0 text-xs text-muted">{fmtIso(s.scheduled_at)}</span>
                </Link>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      <SectionCard title="Endpoints úteis">
        <ul className="space-y-2 text-xs text-muted">
          <ApiLink href="/api/kpis" />
          <ApiLink href="/api/contacts?sort=urgency" />
          <ApiLink href="/api/contacts?pending=true&sort=urgency" />
          <ApiLink href="/api/schedule" />
          <ApiLink href="/api/recommendations" />
          <ApiLink href="/api/avec/sync" />
        </ul>
      </SectionCard>
    </main>
  )
}

function EndpointBadge({ path }: { path: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-border px-2 py-0.5 text-[0.6rem] text-muted">
      <Database size={10} /> {path}
    </span>
  )
}

function ApiLink({ href }: { href: string }) {
  return (
    <li>
      <a href={href} target="_blank" rel="noreferrer" className="text-gold hover:underline">
        {href}
      </a>
      <span className="text-muted"> — JSON bruto</span>
    </li>
  )
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted">{label}</span>
      <span className={`font-medium ${highlight ? 'text-gold' : ''}`}>{value}</span>
    </div>
  )
}

function Skeleton() {
  return <div className="h-24 animate-pulse rounded-xl bg-border" />
}

function Empty() {
  return <p className="py-4 text-center text-sm text-muted">Sem dados.</p>
}

function HealthRow({ label, ok, detail, hint }: { label: string; ok: boolean; detail?: string; hint?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="text-muted">{label}</span>
      <span className={`text-xs font-semibold ${ok ? 'text-success' : 'text-warning'}`}>
        {ok ? 'OK' : 'Pendente'}
        {hint ? ` · ${hint}` : ''}
      </span>
      {detail && <span className="col-span-2 text-[0.65rem] text-danger">{detail}</span>}
    </div>
  )
}
