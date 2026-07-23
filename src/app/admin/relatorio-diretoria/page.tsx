'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  Download,
  RefreshCw,
  TrendingUp,
  Users,
  DollarSign,
  CalendarClock,
  MessageCircle,
  Package,
  AlertTriangle,
} from 'lucide-react'
import { SectionCard, CountBadge, PrimaryButton } from '../../_components/ui'
import { apiFetch } from '@/lib/api-client'
import { formatCurrency, formatPercent, whatsAppWebUrl } from '@/lib/salon/format'
import type { DirectorReport } from '@/lib/director-report/types'
import { buildRecallWhatsAppMessage } from '@/lib/director-report/recall-message'

type StageTab = '0011' | '0021' | 'estoque'

interface StockValuationBucket {
  key: string
  totalCost: number
  percentage: number | null
}
interface StockKpisPayload {
  total_value: number
  active_alerts: number
  zero_products: number
  by_category: StockValuationBucket[]
  by_brand: StockValuationBucket[]
  by_category_period?: StockValuationBucket[]
  avec_official_total: number | null
  drift: number | null
  last_synced_at: string | null
}

const MONTH_LABELS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

function spNowParts() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date())
  return {
    year: Number(parts.find((p) => p.type === 'year')?.value),
    month: Number(parts.find((p) => p.type === 'month')?.value),
  }
}

function buildQuarterOptions() {
  const { year, month } = spNowParts()
  const currentQ = Math.ceil(month / 3)
  const out: { value: string; label: string }[] = []
  for (let y = 2025; y <= year; y++) {
    const maxQ = y === year ? currentQ : 4
    for (let q = 1; q <= maxQ; q++) {
      out.push({ value: `${y}-Q${q}`, label: `${q}º tri ${y}` })
    }
  }
  return out
}

function buildMonthOptions() {
  const { year, month } = spNowParts()
  const out: { value: string; label: string }[] = []
  for (let y = 2025; y <= year; y++) {
    const maxM = y === year ? month : 12
    for (let m = 1; m <= maxM; m++) {
      out.push({
        value: `${y}-${String(m).padStart(2, '0')}`,
        label: `${MONTH_LABELS[m - 1]} ${y}`,
      })
    }
  }
  return out
}

function defaultMonthKey() {
  const { year, month } = spNowParts()
  return `${year}-${String(month).padStart(2, '0')}`
}

function defaultQuarterKey() {
  const { year, month } = spNowParts()
  return `${year}-Q${Math.ceil(month / 3)}`
}

function previousQuarterKey(key: string) {
  const [y, qStr] = key.split('-Q')
  const year = Number(y)
  const q = Number(qStr)
  if (q === 1) return `${year - 1}-Q4`
  return `${year}-Q${q - 1}`
}

const QUARTERS = buildQuarterOptions()
const MONTHS = buildMonthOptions()

export default function RelatorioDiretoriaPage() {
  const [tab, setTab] = useState<StageTab>('0011')
  const [canViewRevenue, setCanViewRevenue] = useState(false)

  useEffect(() => {
    fetch('/api/auth/session', { credentials: 'include', cache: 'no-store' })
      .then((r) => r.json())
      .then((json) => setCanViewRevenue(Boolean(json.data?.can_view_revenue)))
      .catch(() => setCanViewRevenue(false))
  }, [])

  // Estado independente por etapa — defaults = período corrente (SP)
  const [proId0011, setProId0011] = useState('')
  const [quarter, setQuarter] = useState(defaultQuarterKey)
  const [compare, setCompare] = useState(() => previousQuarterKey(defaultQuarterKey()))

  const [proId0021, setProId0021] = useState('')
  const [month, setMonth] = useState(defaultMonthKey)
  const [quarter0021, setQuarter0021] = useState(defaultQuarterKey)
  const [compareQuarter0021, setCompareQuarter0021] = useState(() =>
    previousQuarterKey(defaultQuarterKey())
  )
  const [compareMonths, setCompareMonths] = useState(false)

  const [data, setData] = useState<DirectorReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  /** true = força fixture/demo; false = Avec live quando token OK */
  const [forceDemo, setForceDemo] = useState(false)
  const [stockKpis, setStockKpis] = useState<StockKpisPayload | null>(null)
  const [stockLoading, setStockLoading] = useState(false)
  const [stockError, setStockError] = useState<string | null>(null)

  /** Carrega base completa — filtros de profissional são só na UI/envio de cada etapa. */
  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const q = new URLSearchParams({
        month,
        quarter_0021: quarter0021,
        compare_0021: compareQuarter0021,
        compare_months: compareMonths ? '1' : '0',
        quarter,
        compare,
      })
      if (forceDemo) q.set('mock', '1')
      const res = await apiFetch(`/api/director-report?${q}`, { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok || json.error) {
        setError(json.error ?? 'Não autorizado — entre com o login de gerência')
        setData(null)
        return
      }
      setData(json.data)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [month, quarter0021, compareQuarter0021, compareMonths, quarter, compare, forceDemo])

  useEffect(() => {
    load()
  }, [load])

  const loadStock = useCallback(async () => {
    setStockLoading(true)
    setStockError(null)
    try {
      const res = await apiFetch('/api/estoque/kpis', { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok || json.error) {
        setStockError(json.error ?? 'Não foi possível carregar estoque')
        setStockKpis(null)
        return
      }
      setStockKpis(json.data)
    } catch (e) {
      setStockError(String(e))
      setStockKpis(null)
    } finally {
      setStockLoading(false)
    }
  }, [])

  useEffect(() => {
    if (tab === 'estoque') loadStock()
  }, [tab, loadStock])

  const pros = useMemo(() => {
    const fromReturn = data?.return_blocks.map((b) => b.professional) ?? []
    const fromRev = data?.revenue_blocks.map((b) => b.professional) ?? []
    const map = new Map(fromReturn.map((p) => [p.id, p]))
    for (const p of fromRev) map.set(p.id, p)
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  }, [data])

  const selectedReturn = useMemo(() => {
    if (!data) return []
    return data.return_blocks
      .filter((b) => !proId0011 || b.professional.id === proId0011)
      .map((b) => {
        const sel = b.quarters.find((q) => q.quarter === quarter)
        const cmp = b.quarters.find((q) => q.quarter === compare)
        return { pro: b.professional, sel, cmp, reactivation: b.reactivation }
      })
  }, [data, quarter, compare, proId0011])

  const quarterPair = useMemo(() => {
    if (!compareMonths) return { older: quarter0021, newer: quarter0021 }
    return quarter0021 <= compareQuarter0021
      ? { older: quarter0021, newer: compareQuarter0021 }
      : { older: compareQuarter0021, newer: quarter0021 }
  }, [quarter0021, compareQuarter0021, compareMonths])

  const selectedRevenue = useMemo(() => {
    if (!data) return []
    return data.revenue_blocks
      .filter((b) => !proId0021 || b.professional.id === proId0021)
      .map((b) => {
        const older = b.quarters.find((q) => q.quarter === quarterPair.older)
        const newer = b.quarters.find((q) => q.quarter === quarterPair.newer)
        const focus = b.months.find((m) => m.month === month)
        return { pro: b.professional, older, newer, focus, months: b.months }
      })
      .sort((a, b) => {
        if (compareMonths) return (b.newer?.revenue ?? 0) - (a.newer?.revenue ?? 0)
        return (b.focus?.revenue ?? 0) - (a.focus?.revenue ?? 0)
      })
  }, [data, quarterPair, month, compareMonths, proId0021])

  async function download0011(format: string, filename: string) {
    const q = new URLSearchParams({
      format,
      quarter,
      compare,
    })
    if (forceDemo) q.set('mock', '1')
    if (proId0011) q.set('professional_id', proId0011)
    await downloadBlob(q, filename)
  }

  async function download0021(format: string, filename: string) {
    const q = new URLSearchParams({
      format,
      month,
      quarter_0021: quarter0021,
      compare_0021: compareQuarter0021,
      compare_months: compareMonths ? '1' : '0',
    })
    if (forceDemo) q.set('mock', '1')
    if (proId0021) q.set('professional_id', proId0021)
    await downloadBlob(q, filename)
  }

  async function downloadProfileXlsx() {
    if (!proId0021) return
    const q = new URLSearchParams({ format: 'xlsx-profile', professional_id: proId0021 })
    if (forceDemo) q.set('mock', '1')
    const name = pros.find((p) => p.id === proId0021)?.name ?? proId0021
    await downloadBlob(q, `0021-perfil-${name}.xlsx`)
  }

  async function downloadBlob(q: URLSearchParams, filename: string) {
    const res = await apiFetch(`/api/director-report?${q}`)
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      setError(json.error ?? 'Falha ao exportar')
      return
    }
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  async function send0011() {
    setSending(true)
    try {
      const res = await apiFetch('/api/director-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stage: '0011',
          quarter,
          compare,
          professional_id: proId0011 || undefined,
        }),
      })
      const json = await res.json()
      alert(json.error ?? json.data?.note ?? 'Enviado')
    } finally {
      setSending(false)
    }
  }

  async function send0021() {
    setSending(true)
    try {
      const res = await apiFetch('/api/director-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stage: '0021',
          month,
          quarter_0021: quarter0021,
          compare_0021: compareQuarter0021,
          compare_months: compareMonths,
          professional_id: proId0021 || undefined,
        }),
      })
      const json = await res.json()
      alert(json.error ?? json.data?.note ?? 'Enviado')
    } finally {
      setSending(false)
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-6 px-5 py-6 lg:gap-8 lg:px-8 lg:py-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            href="/admin"
            className="mb-2 inline-flex items-center gap-1 text-xs text-muted hover:text-gold"
          >
            <ArrowLeft size={14} /> Diagnóstico
          </Link>
          <p className="text-[0.65rem] uppercase tracking-[0.25em] text-gold">Relatório gerência</p>
          <h1 className="mt-1 text-xl font-semibold lg:text-2xl">Etapas 0011 · 0021</h1>
          <p className="mt-1 max-w-xl text-sm text-muted">
            Páginas independentes: cada etapa tem seu filtro e envia só o próprio relatório.
          </p>
          <p className="mt-2 text-xs text-muted">
            Fonte:{' '}
            <span className={data?.source === 'avec' ? 'text-foreground' : 'text-warning'}>
              {loading ? '…' : data?.source === 'avec' ? 'Avec live' : 'demo / fixture'}
            </span>
            {data?.schedule_note ? ` · ${data.schedule_note}` : ''}
          </p>
        </div>
        <div className="flex flex-col items-stretch gap-2 sm:items-end">
          <label className="inline-flex items-center gap-2 text-xs text-muted">
            <input
              type="checkbox"
              checked={forceDemo}
              onChange={(e) => setForceDemo(e.target.checked)}
              className="rounded border-border"
            />
            Forçar demo (mock)
          </label>
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
        <div className="rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <StageTabBtn
          active={tab === '0011'}
          onClick={() => setTab('0011')}
          label="Etapa 1 · 0011"
          hint="Trimestre vs trimestre"
        />
        {canViewRevenue && (
          <StageTabBtn
            active={tab === '0021'}
            onClick={() => setTab('0021')}
            label="Etapa 2 · 0021"
            hint="Mês (ou trimestre vs trimestre)"
          />
        )}
        <StageTabBtn
          active={tab === 'estoque'}
          onClick={() => setTab('estoque')}
          label="Etapa Estoque"
          hint="Drift · categorias · marcas"
        />
      </div>

      {tab === '0011' && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <ProSelect
              label="Profissional (só 0011)"
              value={proId0011}
              onChange={setProId0011}
              pros={pros}
            />
            <FilterSelect
              label="Trimestre"
              value={quarter}
              onChange={setQuarter}
              options={QUARTERS}
            />
            <FilterSelect
              label="Comparar com trimestre"
              value={compare}
              onChange={setCompare}
              options={QUARTERS}
            />
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <Kpi
              icon={<Users size={16} />}
              label="Na lista"
              value={loading ? '—' : String(selectedReturn.length)}
            />
            <Kpi
              icon={<TrendingUp size={16} />}
              label="Retorno médio"
              value={
                loading
                  ? '—'
                  : formatPercent(
                      selectedReturn.length
                        ? selectedReturn.reduce((s, r) => s + (r.sel?.return_rate ?? 0), 0) /
                            selectedReturn.length
                        : null,
                      1
                    )
              }
            />
            <Kpi
              icon={<CalendarClock size={16} />}
              label="Comparativo"
              value={data?.period.label_0011 ?? '—'}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3 text-xs text-muted">
            <span className="text-foreground">
              Etapa 1 · {data?.period.label_0011 ?? '…'}
              {proId0011
                ? ` · ${pros.find((p) => p.id === proId0011)?.name ?? 'profissional'}`
                : ' · todos'}
            </span>
            <span className="ml-auto flex flex-wrap gap-2">
              <ExportBtn
                onClick={() => download0011('csv-return-compare', '0011-comparativo-trimestre.csv')}
                label="CSV comparativo"
              />
              <ExportBtn
                onClick={() => download0011('csv-reactivation', '0011-lista-clientes.csv')}
                label="CSV lista clientes"
              />
            </span>
          </div>

          <SectionCard
            title="0011 · Comparativo trimestre a trimestre"
            storageKey="relatorios.section.0011-comparativo.open"
            badge={<CountBadge value={String(selectedReturn.length)} tone="gold" />}
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
                    <th className="py-2 pr-3 font-medium">Profissional</th>
                    <th className="py-2 pr-3 font-medium">{quarter}</th>
                    <th className="py-2 pr-3 font-medium">{compare}</th>
                    <th className="py-2 pr-3 font-medium">Δ</th>
                    <th className="py-2 font-medium">Clientes p/ reativar</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && (
                    <tr>
                      <td colSpan={5} className="py-6 text-muted">
                        Carregando…
                      </td>
                    </tr>
                  )}
                  {!loading &&
                    selectedReturn.map(({ pro, sel, cmp, reactivation }) => {
                      const delta =
                        sel && cmp
                          ? Math.round((sel.return_rate - cmp.return_rate) * 1000) / 10
                          : null
                      return (
                        <tr key={pro.id} className="border-b border-border/60">
                          <td className="py-3 pr-3 font-medium">{pro.name}</td>
                          <td className="py-3 pr-3 tabular-nums text-gold">
                            {formatPercent(sel?.return_rate, 1)}
                          </td>
                          <td className="py-3 pr-3 tabular-nums">
                            {formatPercent(cmp?.return_rate, 1)}
                          </td>
                          <td
                            className={`py-3 pr-3 tabular-nums ${
                              delta != null && delta < 0 ? 'text-danger' : 'text-success'
                            }`}
                          >
                            {delta == null ? '—' : `${delta > 0 ? '+' : ''}${delta} p.p.`}
                          </td>
                          <td className="py-3 tabular-nums">{reactivation.length}</td>
                        </tr>
                      )
                    })}
                </tbody>
              </table>
            </div>
          </SectionCard>

          <SectionCard
            title="0011 · Lista de clientes (formato Avec)"
            storageKey="relatorios.section.0011-lista-clientes.open"
            badge={
              <CountBadge
                value={String(
                  selectedReturn.reduce((s, b) => s + b.reactivation.length, 0),
                )}
                tone="gold"
              />
            }
          >
            <div className="mb-4 space-y-2 rounded-xl border border-border bg-surface/60 px-4 py-3 text-xs leading-relaxed text-muted">
              <p>
                <span className="font-semibold text-foreground/85">O que é esta lista:</span> clientes
                de <span className="text-foreground/80">recall / reativação</span> — já foram
                atendidos por aquele profissional e{' '}
                <span className="text-foreground/80">ainda não voltaram</span> no período do
                relatório. Não é a agenda do dia nem todos os clientes do profissional.
              </p>
              <p>
                Cada linha traz contato e data da <span className="text-foreground/80">última visita</span>{' '}
                para a recepção reaquecer o lead (WhatsApp). Na tela mostramos uma amostra (até 12 por
                profissional); a lista completa vai no CSV / e-mail.
              </p>
              {data?.source === 'avec' && (
                <p className="text-muted">
                  Fonte Avec live (0011) no trimestre selecionado.
                </p>
              )}
              {data?.source === 'mock' && (
                <p className="text-warning">
                  Dados de demonstração (mock / fallback). Com token Avec e sync OK, a lista 0011 vem
                  ao vivo; sem isso, fixture (Dani) + síntese.
                </p>
              )}
            </div>
            <div className="space-y-4">
              {(proId0011 ? selectedReturn : selectedReturn.slice(0, 3)).map(
                ({ pro, reactivation }) => (
                  <div key={pro.id} className="rounded-2xl border border-border bg-surface/50 p-4">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <p className="font-medium">{pro.name}</p>
                      <CountBadge value={String(reactivation.length)} tone="gold" />
                    </div>
                    <ul className="space-y-2 text-sm">
                      {reactivation.slice(0, 12).map((c, i) => {
                        const phone = c.mobile || c.phone
                        const wa = whatsAppWebUrl(phone, buildRecallWhatsAppMessage(c, pro.name))
                        return (
                          <li
                            key={`${pro.id}-${i}`}
                            className="flex items-start justify-between gap-3 border-b border-border/50 pb-2 last:border-0"
                          >
                            <div className="min-w-0 flex flex-col gap-0.5">
                              <span className="font-medium">{c.name}</span>
                              <span className="text-xs text-muted">
                                {[phone, c.email, c.last_visit && `última ${c.last_visit}`]
                                  .filter(Boolean)
                                  .join(' · ')}
                              </span>
                            </div>
                            {wa ? (
                              <a
                                href={wa}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="Abrir WhatsApp Web com mensagem de recall"
                                onClick={() => {
                                  void apiFetch('/api/reactivation/outreach', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                      phone: phone,
                                      name: c.name,
                                      surface: 'director_0011',
                                      lastDoneAtAtSend: c.last_visit ?? null,
                                    }),
                                  }).catch(() => {})
                                }}
                                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-success/40 bg-success/10 px-2.5 py-1.5 text-[0.7rem] font-semibold text-success hover:bg-success/20"
                              >
                                <MessageCircle size={13} />
                                WhatsApp
                              </a>
                            ) : (
                              <span
                                className="shrink-0 rounded-lg border border-border px-2.5 py-1.5 text-[0.7rem] text-muted"
                                title="Sem telefone válido"
                              >
                                Sem WhatsApp
                              </span>
                            )}
                          </li>
                        )
                      })}
                      {reactivation.length > 12 && (
                        <li className="text-xs text-muted">
                          + {reactivation.length - 12} na lista (baixe o CSV)
                        </li>
                      )}
                    </ul>
                  </div>
                )
              )}
              {!proId0011 && (
                <p className="text-xs text-muted">
                  Mostrando 3 profissionais. Filtre um na etapa 0011 ou baixe o CSV.
                </p>
              )}
            </div>
          </SectionCard>

          <PrimaryButton type="button" disabled={sending} onClick={send0011}>
            {sending ? 'Enviando…' : 'Enviar relatório 0011 por e-mail'}
          </PrimaryButton>
        </>
      )}

      {tab === '0021' && (
        <>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setCompareMonths(false)}
              className={`rounded-2xl border px-4 py-2.5 text-sm font-medium ${
                !compareMonths
                  ? 'border-gold/50 bg-gold/10 text-gold'
                  : 'border-border text-muted hover:text-foreground'
              }`}
            >
              Só um mês
            </button>
            <button
              type="button"
              onClick={() => setCompareMonths(true)}
              className={`rounded-2xl border px-4 py-2.5 text-sm font-medium ${
                compareMonths
                  ? 'border-gold/50 bg-gold/10 text-gold'
                  : 'border-border text-muted hover:text-foreground'
              }`}
            >
              Comparar dois trimestres
            </button>
          </div>

          <div
            className={`grid gap-3 ${compareMonths ? 'sm:grid-cols-3' : 'sm:grid-cols-2 max-w-2xl'}`}
          >
            <ProSelect
              label="Profissional (só 0021)"
              value={proId0021}
              onChange={setProId0021}
              pros={pros}
            />
            {compareMonths ? (
              <>
                <FilterSelect
                  label="Trimestre"
                  value={quarter0021}
                  onChange={setQuarter0021}
                  options={QUARTERS}
                />
                <FilterSelect
                  label="Comparar com trimestre"
                  value={compareQuarter0021}
                  onChange={setCompareQuarter0021}
                  options={QUARTERS}
                />
              </>
            ) : (
              <FilterSelect
                label="Mês do relatório"
                value={month}
                onChange={setMonth}
                options={MONTHS}
              />
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <Kpi
              icon={<DollarSign size={16} />}
              label={compareMonths ? 'Fat. trimestre' : 'Fat. mês'}
              value={
                loading
                  ? '—'
                  : formatCurrency(
                      selectedRevenue.reduce(
                        (s, r) => s + (compareMonths ? (r.newer?.revenue ?? 0) : (r.focus?.revenue ?? 0)),
                        0
                      )
                    )
              }
            />
            <Kpi
              icon={<DollarSign size={16} />}
              label="Ticket médio"
              value={
                loading
                  ? '—'
                  : (() => {
                      const rows = selectedRevenue
                        .map((r) => (compareMonths ? r.newer : r.focus))
                        .filter(Boolean)
                      const rev = rows.reduce((s, r) => s + (r?.revenue ?? 0), 0)
                      const att = rows.reduce((s, r) => s + (r?.attended ?? 0), 0)
                      return formatCurrency(att > 0 ? Math.round(rev / att) : null)
                    })()
              }
            />
            <Kpi
              icon={<CalendarClock size={16} />}
              label={compareMonths ? 'Comparativo' : 'Período'}
              value={data?.period.label_0021 ?? '—'}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3 text-xs text-muted">
            <span className="text-foreground">
              Etapa 2 · {data?.period.label_0021 ?? '…'}
              {proId0021
                ? ` · ${pros.find((p) => p.id === proId0021)?.name ?? 'profissional'}`
                : ' · todos'}
              {compareMonths && (
                <span className="ml-1 text-muted">
                  (Δ = {quarterPair.newer} − {quarterPair.older})
                </span>
              )}
            </span>
            <span className="ml-auto flex flex-wrap gap-2">
              {compareMonths ? (
                <ExportBtn
                  onClick={() =>
                    download0021('csv-revenue-compare', '0021-comparativo-trimestre.csv')
                  }
                  label="CSV comparativo"
                />
              ) : (
                <ExportBtn
                  onClick={() => download0021('csv-revenue', '0021-mes.csv')}
                  label="CSV do mês"
                />
              )}
              {proId0021 && (
                <ExportBtn onClick={downloadProfileXlsx} label="Exportar Excel (perfil)" />
              )}
            </span>
          </div>

          <SectionCard
            title={
              compareMonths
                ? '0021 · Comparativo trimestre a trimestre (faturamento + ticket)'
                : '0021 · Faturamento e ticket do mês'
            }
            storageKey="relatorios.section.0021-faturamento.open"
            badge={<CountBadge value={String(selectedRevenue.length)} tone="gold" />}
          >
            <div className="overflow-x-auto">
              {compareMonths ? (
                <table className="w-full min-w-[800px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
                      <th className="py-2 pr-3 font-medium">Profissional</th>
                      <th className="py-2 pr-3 font-medium">Fat {quarterPair.older}</th>
                      <th className="py-2 pr-3 font-medium">Ticket {quarterPair.older}</th>
                      <th className="py-2 pr-3 font-medium">Fat {quarterPair.newer}</th>
                      <th className="py-2 pr-3 font-medium">Ticket {quarterPair.newer}</th>
                      <th className="py-2 font-medium">Δ Fat</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading && (
                      <tr>
                        <td colSpan={6} className="py-6 text-muted">
                          Carregando…
                        </td>
                      </tr>
                    )}
                    {!loading &&
                      selectedRevenue.map(({ pro, older, newer }) => {
                        const delta = (newer?.revenue ?? 0) - (older?.revenue ?? 0)
                        return (
                          <tr key={pro.id} className="border-b border-border/60">
                            <td className="py-3 pr-3 font-medium">{pro.name}</td>
                            <td className="py-3 pr-3 tabular-nums">
                              {formatCurrency(older?.revenue)}
                            </td>
                            <td className="py-3 pr-3 tabular-nums">
                              {formatCurrency(older?.ticket_avg)}
                            </td>
                            <td className="py-3 pr-3 tabular-nums text-gold">
                              {formatCurrency(newer?.revenue)}
                            </td>
                            <td className="py-3 pr-3 tabular-nums">
                              {formatCurrency(newer?.ticket_avg)}
                            </td>
                            <td
                              className={`py-3 tabular-nums ${
                                delta < 0 ? 'text-danger' : 'text-success'
                              }`}
                            >
                              {formatCurrency(delta)}
                            </td>
                          </tr>
                        )
                      })}
                  </tbody>
                </table>
              ) : (
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
                      <th className="py-2 pr-3 font-medium">Profissional</th>
                      <th className="py-2 pr-3 font-medium">Faturamento</th>
                      <th className="py-2 pr-3 font-medium">Ticket médio</th>
                      <th className="py-2 font-medium">Atendimentos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading && (
                      <tr>
                        <td colSpan={4} className="py-6 text-muted">
                          Carregando…
                        </td>
                      </tr>
                    )}
                    {!loading &&
                      selectedRevenue.map(({ pro, focus }) => (
                        <tr key={pro.id} className="border-b border-border/60">
                          <td className="py-3 pr-3 font-medium">{pro.name}</td>
                          <td className="py-3 pr-3 tabular-nums text-gold">
                            {formatCurrency(focus?.revenue)}
                          </td>
                          <td className="py-3 pr-3 tabular-nums">
                            {formatCurrency(focus?.ticket_avg)}
                          </td>
                          <td className="py-3 tabular-nums text-muted">
                            {focus?.attended ?? '—'}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              )}
            </div>
          </SectionCard>

          <PrimaryButton type="button" disabled={sending} onClick={send0021}>
            {sending ? 'Enviando…' : 'Enviar relatório 0021 por e-mail'}
          </PrimaryButton>
        </>
      )}

      {tab === 'estoque' && (
        <>
          <p className="text-xs text-muted">
            Profundidade de inventário (Avec 0045 / 0243 / 0242 / 0142). Operação do dia a dia
            continua em{' '}
            <Link href="/estoque" className="text-gold hover:underline">
              Estoque
            </Link>
            .
          </p>

          {stockError && (
            <div className="rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
              {stockError}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi
              icon={<DollarSign size={16} />}
              label="Valor local (0149)"
              value={stockLoading || !stockKpis ? '—' : formatCurrency(stockKpis.total_value)}
            />
            <Kpi
              icon={<Package size={16} />}
              label="Total Avec (0045)"
              value={
                stockLoading || !stockKpis
                  ? '—'
                  : stockKpis.avec_official_total != null
                    ? formatCurrency(stockKpis.avec_official_total)
                    : '—'
              }
            />
            <Kpi
              icon={<AlertTriangle size={16} />}
              label="Drift (local − Avec)"
              value={
                stockLoading || !stockKpis
                  ? '—'
                  : stockKpis.drift != null
                    ? formatCurrency(stockKpis.drift)
                    : '—'
              }
            />
            <Kpi
              icon={<Users size={16} />}
              label="Alertas / zerados"
              value={
                stockLoading || !stockKpis
                  ? '—'
                  : `${stockKpis.active_alerts} / ${stockKpis.zero_products}`
              }
            />
          </div>

          {stockKpis?.drift != null && Math.abs(stockKpis.drift) > 50 && (
            <div className="rounded-2xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning">
              Drift acima de R$ 50 — conferir sync da posição (0149) vs valorização oficial (0045).
            </div>
          )}

          <SectionCard
            title="Custo por categoria (0142 / 0243)"
            storageKey="relatorios.section.estoque-categorias.open"
            badge={
              <CountBadge
                value={String(
                  (stockKpis?.by_category_period?.length ?? 0) > 0
                    ? stockKpis!.by_category_period!.length
                    : (stockKpis?.by_category.length ?? 0),
                )}
              />
            }
          >
            <p className="mb-3 text-xs text-muted">
              Preferência: % oficial 0142 (~30 dias). Fallback: snapshot 0243.
            </p>
            {stockLoading ? (
              <div className="h-16 animate-pulse rounded-2xl bg-card" />
            ) : (
              <StockValuationBars
                buckets={
                  (stockKpis?.by_category_period?.length ?? 0) > 0
                    ? stockKpis!.by_category_period!
                    : (stockKpis?.by_category ?? [])
                }
              />
            )}
          </SectionCard>

          <SectionCard
            title="Custo por marca (0242)"
            storageKey="relatorios.section.estoque-marcas.open"
            badge={<CountBadge value={String(stockKpis?.by_brand.length ?? 0)} />}
          >
            {stockLoading ? (
              <div className="h-16 animate-pulse rounded-2xl bg-card" />
            ) : (
              <StockValuationBars buckets={stockKpis?.by_brand ?? []} />
            )}
          </SectionCard>

          <p className="text-xs text-muted">
            Último sync posição:{' '}
            {stockKpis?.last_synced_at
              ? new Date(stockKpis.last_synced_at).toLocaleString('pt-BR')
              : '—'}
          </p>

          <button
            type="button"
            onClick={loadStock}
            disabled={stockLoading}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-gold/40 bg-gold/10 px-4 py-2.5 text-sm font-semibold text-gold disabled:opacity-60"
          >
            <RefreshCw size={16} className={stockLoading ? 'animate-spin' : ''} />
            Atualizar estoque
          </button>
        </>
      )}

      <p className="text-xs text-muted">
        Destino: contato.vinicaetano93@gmail.com · cada botão envia só a etapa aberta
      </p>
    </main>
  )
}

function ProSelect({
  label,
  value,
  onChange,
  pros,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  pros: { id: string; name: string }[]
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs uppercase tracking-wide text-muted">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-gold"
      >
        <option value="">Todos</option>
        {pros.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </label>
  )
}

function StageTabBtn({
  active,
  onClick,
  label,
  hint,
}: {
  active: boolean
  onClick: () => void
  label: string
  hint: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl border px-4 py-3 text-left transition-colors ${
        active
          ? 'border-gold/50 bg-gold/10 text-gold'
          : 'border-border bg-card text-muted hover:border-gold/30 hover:text-foreground'
      }`}
    >
      <p className="text-sm font-semibold">{label}</p>
      <p className="text-[0.65rem] opacity-80">{hint}</p>
    </button>
  )
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs uppercase tracking-wide text-muted">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-gold"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function Kpi({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-xs text-muted">
        <span className="text-gold">{icon}</span>
        {label}
      </div>
      <p className="mt-1 text-lg font-semibold tabular-nums leading-snug">{value}</p>
    </div>
  )
}

function StockValuationBars({ buckets }: { buckets: StockValuationBucket[] }) {
  if (buckets.length === 0) {
    return <p className="text-xs text-muted">Sem snapshot sincronizado ainda.</p>
  }
  const total = buckets.reduce((sum, b) => sum + b.totalCost, 0)
  return (
    <div className="flex flex-col gap-2.5">
      {buckets.map((b) => {
        const pct = b.percentage ?? (total > 0 ? (b.totalCost / total) * 100 : 0)
        return (
          <div key={b.key} className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">{b.key}</span>
              <span className="tabular-nums text-muted">
                {formatCurrency(b.totalCost)} · {pct.toFixed(1)}%
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface">
              <div className="h-full rounded-full bg-gold" style={{ width: `${Math.min(pct, 100)}%` }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ExportBtn({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[0.65rem] text-foreground hover:border-gold/40 hover:text-gold"
    >
      <Download size={12} />
      {label}
    </button>
  )
}
