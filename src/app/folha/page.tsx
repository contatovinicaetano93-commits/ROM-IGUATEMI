'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { IntranetPage } from '../_components/intranet/IntranetPage'
import { SectionCard } from '../_components/ui'
import { folhaFaturadoDisplay } from '@/lib/folha/draft-from-8123-surface'
import type { FolhaDraft, FolhaDraftLine } from '@/lib/folha/draft-from-8123'
import type { FolhaPeriodStatus, FolhaShellStatus } from '@/lib/folha/types'

function pct(rate: number): string {
  return `${(rate * 100).toFixed(0)}%`
}

function formatMoney(value: number | null | undefined): string {
  if (value == null) return '—'
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

/** Valor compacto na grade (sem R$) — cabe mais colunas sem scroll. */
function formatMoneyCompact(value: number | null | undefined): string {
  if (value == null) return '—'
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/** Magnitude de abatimento Avec (8123 guarda negativo). */
function formatDeduction(value: number | null | undefined): string {
  if (value == null) return '—'
  return formatMoney(Math.abs(value))
}

function formatDeductionCompact(value: number | null | undefined): string {
  if (value == null) return '—'
  return formatMoneyCompact(Math.abs(value))
}

function formatDayBr(iso: string | null | undefined): string {
  if (!iso) return '—'
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return iso
  return `${m[3]}/${m[2]}/${m[1]}`
}

function statusLabel(status: FolhaPeriodStatus | null | undefined): string {
  switch (status) {
    case 'draft':
      return 'Rascunho'
    case 'ready_for_review':
      return 'Em conferência'
    case 'approved':
      return 'Aprovado'
    case 'paid':
      return 'Pago'
    case 'awaiting_rules':
      return 'Aguardando regras'
    case null:
    case undefined:
      return '—'
    default: {
      const _exhaustive: never = status
      return _exhaustive
    }
  }
}

/** Pills de status com contraste semântico (rascunho → pago). */
function statusTone(status: FolhaPeriodStatus | null | undefined): string {
  switch (status) {
    case 'draft':
      return 'bg-card-elevated text-foreground ring-1 ring-border'
    case 'ready_for_review':
      return 'bg-warning/15 text-warning ring-1 ring-warning/30'
    case 'approved':
      return 'bg-gold/15 text-gold-strong ring-1 ring-gold/35'
    case 'paid':
      return 'bg-success/15 text-success ring-1 ring-success/30'
    case 'awaiting_rules':
      return 'bg-border/70 text-muted ring-1 ring-border'
    case null:
    case undefined:
      return 'bg-border/50 text-muted ring-1 ring-border'
    default: {
      const _exhaustive: never = status
      return _exhaustive
    }
  }
}

const FOLHA_BTN =
  'inline-flex items-center justify-center rounded-xl border px-3 py-2 text-xs font-semibold transition-colors disabled:pointer-events-none disabled:opacity-45'
const FOLHA_BTN_SECONDARY = `${FOLHA_BTN} border-border bg-surface text-foreground hover:border-gold/45 hover:bg-card-elevated`
const FOLHA_BTN_PRIMARY = `${FOLHA_BTN} border-gold/40 bg-gold/15 text-gold-strong hover:bg-gold/25`
const FOLHA_BTN_SUCCESS = `${FOLHA_BTN} border-success/35 bg-success/12 text-success hover:bg-success/20`
const FOLHA_INPUT =
  'mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted/70 focus:border-gold focus:ring-2 focus:ring-gold/20 disabled:opacity-50'

function FolhaMetric({
  label,
  value,
  emphasize = false,
}: {
  label: string
  value: string
  emphasize?: boolean
}) {
  return (
    <div
      className={`rounded-xl border px-2.5 py-2 ${
        emphasize
          ? 'border-gold/35 bg-gold/10'
          : 'border-border/90 bg-surface/90'
      }`}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p
        className={`mt-0.5 tabular-nums ${
          emphasize ? 'text-sm font-semibold text-foreground' : 'text-xs font-medium text-foreground'
        }`}
      >
        {value}
      </p>
    </div>
  )
}

function flagLabel(flag: FolhaDraftLine['flags'][number]): string {
  switch (flag) {
    case 'manicure_com_taxa_adm':
      return 'Manicure com taxa adm no 8123'
    case 'sem_a_pagar':
      return 'Sem a_pagar'
    case 'sem_cargo':
      return 'Sem cargo'
    case 'assistente_com_desconto':
      return 'Desconto assistente'
    case 'excecao_nomeada':
      return 'Exceção nomeada'
    case 'meta_quinzena_pendente':
      return 'Meta quinzena (valor pendente RH)'
    case 'meta_romeu_pendente':
      return 'Meta Romeu (acumulado mensal pendente RH)'
    case 'assistente_romeu':
      return 'Assistente do Romeu (faixas 30/40/50)'
    case 'taxa_adm_motor':
      return 'Taxa adm pelo motor (8123 zerado)'
    case 'taxa_adm_em_descontos':
      return 'Taxa adm já no descontos 8123 (só conferência)'
    default: {
      const _exhaustive: never = flag
      return _exhaustive
    }
  }
}

function parseOptionalNumber(raw: string): number | null {
  const t = raw.trim()
  if (!t) return null
  const n = Number(t.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

export default function FolhaPage() {
  const [status, setStatus] = useState<FolhaShellStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [selectedPeriod, setSelectedPeriod] = useState<string>('')
  const [onlyWithPay, setOnlyWithPay] = useState(true)
  const [selectedName, setSelectedName] = useState('')
  const [uInput, setUInput] = useState('')
  const [baruInput, setBaruInput] = useState('')
  const [acumuladoInput, setAcumuladoInput] = useState('')
  const [faturadoAnoAntInput, setFaturadoAnoAntInput] = useState('')
  const [faturadoMesInput, setFaturadoMesInput] = useState('')
  const [taxaAdmQ1Input, setTaxaAdmQ1Input] = useState('')
  const [darfInput, setDarfInput] = useState('')
  const [dasInput, setDasInput] = useState('')
  const [mensalidadeInput, setMensalidadeInput] = useState('')
  const [taxSubject, setTaxSubject] = useState('')
  const [taxBody, setTaxBody] = useState('')
  const [actionMsg, setActionMsg] = useState<string | null>(null)

  const applyDraft = useCallback((draft: FolhaDraft | null | undefined) => {
    setStatus((prev) =>
      prev
        ? {
            ...prev,
            draft: draft ?? null,
            shell_only: draft == null,
            period_id: draft?.quinzena.id ?? prev.period_id,
            selected_period_id: draft?.quinzena.id ?? prev.selected_period_id,
            pay_date: draft?.quinzena.payDate ?? prev.pay_date,
          }
        : prev,
    )
  }, [])

  const load = useCallback(async (periodId?: string) => {
    setLoading(true)
    setError(null)
    try {
      const q = periodId ? `?period=${encodeURIComponent(periodId)}` : ''
      const res = await fetch(`/api/folha${q}`, {
        credentials: 'include',
        signal: AbortSignal.timeout(20_000),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(json.error ?? 'Falha ao carregar a Folha')
        setStatus(null)
        return
      }
      const data = (json.data ?? null) as FolhaShellStatus | null
      setStatus(data)
      if (data?.selected_period_id) setSelectedPeriod(data.selected_period_id)
    } catch {
      setError('Falha ao carregar a Folha')
      setStatus(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const rules = status?.rules
  const draft = status?.draft
  const periodId = status?.period_id
  const periodStatus = status?.period_status
  const lines = draft?.lines ?? []
  /** DARF/DAS/mensalidade só no pagamento do dia 20 (1ª quinzena). */
  const taxExtrasAllowed = draft?.quinzena.half === 1

  const visibleLines = useMemo(() => {
    if (!onlyWithPay) return lines
    return lines.filter((l) => l.proposed_pay != null || l.avec.net_payable != null)
  }, [lines, onlyWithPay])

  const selectedLine = useMemo(
    () => lines.find((l) => l.name === selectedName) ?? null,
    [lines, selectedName],
  )

  async function postJson(url: string, body: unknown, method = 'POST') {
    setBusy(true)
    setActionMsg(null)
    setError(null)
    try {
      const res = await fetch(url, {
        method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(json.error ?? 'Falha na operação')
        return null
      }
      return json.data
    } catch {
      setError('Falha na operação')
      return null
    } finally {
      setBusy(false)
    }
  }

  async function onChangePeriod(periodIdNext: string) {
    setSelectedPeriod(periodIdNext)
    setSelectedName('')
    await load(periodIdNext)
  }

  async function onRefresh() {
    const data = await postJson('/api/folha/refresh', {
      period: selectedPeriod || status?.selected_period_id || undefined,
    })
    if (!data) return
    applyDraft(data.draft)
    const range = data.avec_range as { inicio?: string; fim?: string } | null | undefined
    const src = data.source === 'avec_window' ? 'janela Avec' : 'snapshot DB'
    const rangeLabel =
      range?.inicio && range?.fim ? `${range.inicio}–${range.fim}` : data.draft?.reference_day
    setStatus((prev) =>
      prev
        ? {
            ...prev,
            period_status: data.period_status,
            period_id: data.period_id,
            selected_period_id: data.selected_period_id ?? prev.selected_period_id,
            pay_date: data.pay_date ?? prev.pay_date,
            message: `Rascunho atualizado (${src}: ${rangeLabel ?? '—'}).`,
          }
        : prev,
    )
    setActionMsg(`8123 recarregado via ${src} (extras preservados).`)
  }

  async function onZigConsumo() {
    if (!periodId) {
      setError('Selecione uma quinzena com rascunho')
      return
    }
    const data = await postJson('/api/folha/zig-consumo', { period_id: periodId })
    if (!data) return
    applyDraft(data.draft)
    setStatus((prev) =>
      prev ? { ...prev, period_status: data.period_status, period_id: data.period_id } : prev,
    )
    const report = data.report as
      | {
          applied?: unknown[]
          skipped_embedded?: unknown[]
          skipped_manual?: unknown[]
          unmatched_folha?: unknown[]
        }
      | undefined
    const n = report?.applied?.length ?? 0
    const emb = report?.skipped_embedded?.length ?? 0
    const man = report?.skipped_manual?.length ?? 0
    setActionMsg(
      `Zig Baru: ${n} aplicados` +
        (emb ? ` · ${emb} já no 8123` : '') +
        (man ? ` · ${man} mantidos (RH)` : '') +
        '.',
    )
  }

  async function onSaveExtras() {
    if (!periodId || !selectedName.trim()) {
      setError('Selecione um profissional')
      return
    }
    const extras: Record<string, number | null> = {
      servicos_assistente_como_pro: parseOptionalNumber(uInput),
      consumo_baru: parseOptionalNumber(baruInput),
      acumulado_mes: parseOptionalNumber(acumuladoInput),
      faturado_ano_anterior_mes: parseOptionalNumber(faturadoAnoAntInput),
      faturado_mes: parseOptionalNumber(faturadoMesInput),
      taxa_adm_q1: parseOptionalNumber(taxaAdmQ1Input),
    }
    if (taxExtrasAllowed) {
      extras.darf = parseOptionalNumber(darfInput)
      extras.das = parseOptionalNumber(dasInput)
      extras.mensalidade_contabilidade = parseOptionalNumber(mensalidadeInput)
    }
    const data = await postJson(
      '/api/folha/lines',
      {
        period_id: periodId,
        professional_name: selectedName.trim(),
        extras,
      },
      'PATCH',
    )
    if (!data) return
    applyDraft(data.draft)
    setStatus((prev) =>
      prev ? { ...prev, period_status: data.period_status, period_id: data.period_id } : prev,
    )
    setActionMsg(`Extras salvos em ${selectedName.trim()}.`)
  }

  async function onStatus(next: FolhaPeriodStatus) {
    if (!periodId) return
    const data = await postJson('/api/folha/status', { period_id: periodId, status: next })
    if (!data) return
    applyDraft(data.draft)
    setStatus((prev) =>
      prev ? { ...prev, period_status: data.period_status, period_id: data.period_id } : prev,
    )
    const notify = data.notify as
      | { ok?: boolean; skipped?: string; to?: string[]; error?: string }
      | null
      | undefined
    if (next === 'approved' && notify) {
      if (notify.ok) {
        setActionMsg(`Aprovado · e-mail enviado a ${(notify.to ?? []).join(', ')}`)
      } else if (notify.skipped === 'not_configured') {
        setActionMsg('Aprovado · e-mail não configurado (FOLHA_NOTIFY_EMAIL)')
      } else {
        setActionMsg(`Aprovado · falha no e-mail: ${notify.error ?? 'erro'}`)
      }
    } else {
      setActionMsg(`Status → ${statusLabel(next)}`)
    }
  }

  async function onImapPoll() {
    setBusy(true)
    setActionMsg(null)
    setError(null)
    try {
      const periodQs = selectedPeriod || status?.selected_period_id || ''
      const q = periodQs ? `?period=${encodeURIComponent(periodQs)}` : ''
      const res = await fetch(`/api/folha/imap-poll${q}`, {
        credentials: 'include',
        signal: AbortSignal.timeout(45_000),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(json.error ?? 'Falha no IMAP')
        return
      }
      const d = json.data as {
        skipped?: string
        fetched?: number
        ingested?: number
        applied?: number
        errors?: string[]
      }
      if (d.skipped === 'not_configured') {
        setActionMsg('IMAP não configurado (FOLHA_IMAP_HOST/USER/PASS)')
      } else {
        setActionMsg(
          `IMAP: ${d.fetched ?? 0} lidos · ${d.ingested ?? 0} gravados · ${d.applied ?? 0} aplicados${
            d.errors?.length ? ` · erros: ${d.errors.join('; ')}` : ''
          }`,
        )
        await load(selectedPeriod || undefined)
      }
    } catch {
      setError('Falha no IMAP')
    } finally {
      setBusy(false)
    }
  }

  async function onTaxIngest() {
    if (!periodId || !taxBody.trim()) {
      setError('Cole o corpo do e-mail fiscal')
      return
    }
    const data = await postJson('/api/folha/tax-ingest', {
      period_id: periodId,
      subject: taxSubject || null,
      body: taxBody,
      apply_to_line: true,
    })
    if (!data) return
    applyDraft(data.draft)
    setStatus((prev) =>
      prev ? { ...prev, period_status: data.period_status, period_id: data.period_id } : prev,
    )
    setActionMsg(
      data.applied
        ? `Aplicado ${data.parsed?.kind} ${formatMoney(data.parsed?.amount)}`
        : `Lido ${data.parsed?.kind} ${formatMoney(data.parsed?.amount)} (sem match de nome — ajuste manual)`,
    )
    setTaxBody('')
  }

  async function onExportExcel() {
    if (!periodId) {
      setError('Selecione uma quinzena')
      return
    }
    setBusy(true)
    setActionMsg(null)
    setError(null)
    try {
      const q = new URLSearchParams({ period: periodId })
      if (onlyWithPay) q.set('only_with_pay', '1')
      const res = await fetch(`/api/folha/export?${q}`, {
        credentials: 'include',
        signal: AbortSignal.timeout(30_000),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        setError(
          typeof json === 'object' && json && 'error' in json
            ? String((json as { error?: string }).error ?? 'Falha ao exportar Excel')
            : 'Falha ao exportar Excel',
        )
        return
      }
      const blob = await res.blob()
      const cd = res.headers.get('Content-Disposition')
      const match = cd?.match(/filename="([^"]+)"/)
      const filename = match?.[1] ?? `folha-${periodId}.xlsx`
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
      setActionMsg(`Excel exportado: ${filename}`)
    } catch {
      setError('Falha ao exportar Excel')
    } finally {
      setBusy(false)
    }
  }

  function selectLine(line: FolhaDraftLine) {
    setSelectedName(line.name)
    setUInput(
      line.folha_extras.servicos_assistente_como_pro != null
        ? String(line.folha_extras.servicos_assistente_como_pro)
        : '',
    )
    setBaruInput(
      line.folha_extras.consumo_baru != null
        ? String(line.folha_extras.consumo_baru)
        : '',
    )
    setAcumuladoInput(
      line.folha_extras.acumulado_mes != null
        ? String(line.folha_extras.acumulado_mes)
        : '',
    )
    setFaturadoAnoAntInput(
      line.folha_extras.faturado_ano_anterior_mes != null
        ? String(line.folha_extras.faturado_ano_anterior_mes)
        : '',
    )
    setFaturadoMesInput(
      line.folha_extras.faturado_mes != null
        ? String(line.folha_extras.faturado_mes)
        : '',
    )
    setTaxaAdmQ1Input(
      line.folha_extras.taxa_adm_q1 != null
        ? String(line.folha_extras.taxa_adm_q1)
        : '',
    )
    setDarfInput(line.folha_extras.darf != null ? String(line.folha_extras.darf) : '')
    setDasInput(line.folha_extras.das != null ? String(line.folha_extras.das) : '')
    setMensalidadeInput(
      line.folha_extras.mensalidade_contabilidade != null
        ? String(line.folha_extras.mensalidade_contabilidade)
        : '',
    )
  }

  const upcoming = status?.upcoming_payments?.filter((p) => p.upcoming).slice(0, 2) ?? []

  return (
    <IntranetPage
      kicker="RH · Financeiro"
      title="Folha de pagamento"
      subtitle="Quinzenas com pagamento nos dias 05 e 20. Conferir olerite e liberar."
    >
      <SectionCard title="Agenda de pagamento">
        {loading ? <p className="text-sm text-muted">Carregando…</p> : null}
        {error ? (
          <p className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        ) : null}
        {!loading && status ? (
          <div className="space-y-4 text-sm">
            <div className="flex flex-wrap gap-2.5">
              {upcoming.length === 0 ? (
                <p className="text-muted">Sem pagamentos futuros na janela listada.</p>
              ) : (
                upcoming.map((p) => {
                  const active = selectedPeriod === p.period_id
                  return (
                    <button
                      key={p.period_id}
                      type="button"
                      disabled={busy}
                      onClick={() => void onChangePeriod(p.period_id)}
                      className={`min-w-[11rem] rounded-2xl border px-3.5 py-3 text-left transition-colors disabled:opacity-50 ${
                        active
                          ? 'border-gold/50 bg-gold/10 shadow-sm ring-1 ring-gold/25'
                          : 'border-border bg-surface hover:border-gold/40 hover:bg-card-elevated'
                      }`}
                    >
                      <div className="text-sm font-semibold text-foreground">
                        Paga {formatDayBr(p.pay_date)}
                      </div>
                      <div className="mt-0.5 text-xs font-medium text-foreground/80">{p.label}</div>
                      <div className="mt-1 text-[11px] text-muted">
                        {formatDayBr(p.from)} – {formatDayBr(p.to)}
                      </div>
                    </button>
                  )
                })
              )}
            </div>
            <label className="block max-w-md text-xs">
              <span className="font-medium text-muted">Quinzena</span>
              <select
                className={FOLHA_INPUT}
                value={selectedPeriod}
                disabled={busy || (status.periods?.length ?? 0) === 0}
                onChange={(e) => void onChangePeriod(e.target.value)}
              >
                {(status.periods ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label} · paga {formatDayBr(p.pay_date)} · {statusLabel(p.status)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}
      </SectionCard>

      <SectionCard title="Olerite da quinzena">
        {loading ? <p className="text-sm text-muted">Carregando…</p> : null}
        {!loading && status ? (
          <div className="space-y-4 text-sm">
            <p className="rounded-xl border border-border/80 bg-surface px-3 py-2 text-foreground">
              {status.message}
            </p>
            {actionMsg ? (
              <p className="rounded-xl border border-success/25 bg-success/10 px-3 py-2 text-xs font-medium text-success">
                {actionMsg}
              </p>
            ) : null}

            {draft ? (
              <>
                <label className="block max-w-lg text-xs">
                  <span className="font-medium text-muted">Quinzena / data de pagamento</span>
                  <select
                    className={FOLHA_INPUT}
                    value={selectedPeriod}
                    disabled={busy || (status.periods?.length ?? 0) === 0}
                    onChange={(e) => void onChangePeriod(e.target.value)}
                  >
                    {(status.periods ?? []).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label} · paga {formatDayBr(p.pay_date)} · {statusLabel(p.status)}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-border bg-card-elevated/80 px-3.5 py-3">
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusTone(periodStatus)}`}
                  >
                    {statusLabel(periodStatus)}
                  </span>
                  <span className="text-sm font-semibold text-foreground">
                    Paga {formatDayBr(status.pay_date)}
                  </span>
                  <span className="text-xs font-medium text-foreground/80">{draft.quinzena.label}</span>
                  <span className="text-xs text-muted">
                    {formatDayBr(draft.quinzena.from)} – {formatDayBr(draft.quinzena.to)}
                  </span>
                  <span className="text-xs text-muted">
                    8123 {formatDayBr(draft.quinzena.from)}–{formatDayBr(draft.reference_day)}
                  </span>
                  <span className="text-xs text-muted">
                    {visibleLines.length}/{draft.line_count} na lista
                  </span>
                  <span className="ml-auto rounded-xl border border-gold/30 bg-gold/10 px-2.5 py-1 text-sm font-semibold tabular-nums text-gold-strong">
                    Total {formatMoney(draft.total_proposed_pay)}
                  </span>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void onRefresh()}
                    className={FOLHA_BTN_PRIMARY}
                  >
                    Atualizar do 8123
                  </button>
                  <button
                    type="button"
                    disabled={busy || !draft.line_count}
                    onClick={() => void onExportExcel()}
                    className={FOLHA_BTN_SECONDARY}
                  >
                    Exportar Excel
                  </button>
                  <button
                    type="button"
                    disabled={busy || !draft.line_count}
                    onClick={() => void onZigConsumo()}
                    className={FOLHA_BTN_SECONDARY}
                  >
                    Puxar consumo Baru (Zig)
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void onImapPoll()}
                    className={FOLHA_BTN_SECONDARY}
                  >
                    Buscar DARF/DAS/mensalidade (IMAP)
                  </button>
                  {periodStatus === 'draft' || periodStatus === 'ready_for_review' ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void onStatus('ready_for_review')}
                      className={FOLHA_BTN_SECONDARY}
                    >
                      Enviar para conferência
                    </button>
                  ) : null}
                  {periodStatus === 'draft' || periodStatus === 'ready_for_review' ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void onStatus('approved')}
                      className={FOLHA_BTN_PRIMARY}
                    >
                      Aprovar
                    </button>
                  ) : null}
                  {periodStatus === 'approved' ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void onStatus('paid')}
                      className={FOLHA_BTN_SUCCESS}
                    >
                      Marcar pago
                    </button>
                  ) : null}
                  {periodStatus === 'approved' || periodStatus === 'ready_for_review' ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void onStatus('draft')}
                      className={FOLHA_BTN_SECONDARY}
                    >
                      Reabrir rascunho
                    </button>
                  ) : null}
                  <label className="ml-auto flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-xs font-medium text-foreground">
                    <input
                      type="checkbox"
                      className="size-3.5 accent-[var(--gold)]"
                      checked={onlyWithPay}
                      onChange={(e) => setOnlyWithPay(e.target.checked)}
                    />
                    Só quem tem a_pagar
                  </label>
                </div>

                <div className="grid gap-3 rounded-2xl border border-border bg-card-elevated/50 p-3.5 md:grid-cols-4">
                  <label className="text-xs md:col-span-2">
                    <span className="font-medium text-muted">Profissional</span>
                    <select
                      className={FOLHA_INPUT}
                      value={selectedName}
                      onChange={(e) => {
                        const name = e.target.value
                        const line = lines.find((l) => l.name === name)
                        if (line) selectLine(line)
                        else setSelectedName(name)
                      }}
                    >
                      <option value="">Selecionar…</option>
                      {visibleLines.map((l) => (
                        <option key={l.name} value={l.name}>
                          {l.name} · {formatMoney(l.proposed_pay)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:col-span-2">
                    <FolhaMetric
                      label="Faturado"
                      value={formatMoney(
                        selectedLine ? folhaFaturadoDisplay(selectedLine) : null,
                      )}
                    />
                    <FolhaMetric
                      label="Taxa cartão (8123)"
                      value={formatDeduction(selectedLine?.avec.card_fee)}
                    />
                    <FolhaMetric
                      label="Rateio após cartão"
                      value={formatMoney(selectedLine?.rateio_apos_cartao)}
                    />
                    <FolhaMetric
                      label="Produto"
                      value={formatDeduction(selectedLine?.avec.product_spend)}
                    />
                    <FolhaMetric
                      label={`Taxa adm${
                        selectedLine?.taxa_administrativa_rate != null
                          ? ` ${pct(selectedLine.taxa_administrativa_rate)}`
                          : ''
                      }`}
                      value={formatMoney(selectedLine?.taxa_administrativa)}
                    />
                    <FolhaMetric
                      label="Assistente"
                      value={formatDeduction(selectedLine?.avec.assistant_discount)}
                    />
                    <FolhaMetric
                      label="Meio a meio"
                      value={formatMoney(selectedLine?.meio_a_meio)}
                    />
                    <FolhaMetric
                      label="Outros (olerite)"
                      value={formatMoney(selectedLine?.outros_descontos)}
                    />
                    <FolhaMetric
                      label="Consumo Baru"
                      value={formatMoney(selectedLine?.folha_extras.consumo_baru)}
                    />
                    <FolhaMetric
                      label="U · serv. assist. como pro"
                      value={formatMoney(
                        selectedLine?.folha_extras.servicos_assistente_como_pro,
                      )}
                    />
                    <FolhaMetric
                      label="W · taxa serviços"
                      value={formatMoney(selectedLine?.folha_extras.taxa_servicos)}
                    />
                    <FolhaMetric
                      label="a_pagar 8123"
                      value={formatMoney(selectedLine?.avec.net_payable)}
                    />
                    <FolhaMetric
                      label="Líquido a pagar"
                      value={formatMoney(selectedLine?.proposed_pay)}
                      emphasize
                    />
                  </div>
                  <label className="text-xs">
                    <span className="font-medium text-muted">U · serviços assist. como pro</span>
                    <input
                      className={FOLHA_INPUT}
                      value={uInput}
                      onChange={(e) => setUInput(e.target.value)}
                      inputMode="decimal"
                      placeholder="ex. 1000"
                    />
                  </label>
                  <label className="text-xs">
                    <span className="font-medium text-muted">Consumo Baru</span>
                    <input
                      className={FOLHA_INPUT}
                      value={baruInput}
                      onChange={(e) => setBaruInput(e.target.value)}
                      inputMode="decimal"
                      placeholder="ex. 201.68"
                    />
                  </label>
                  {selectedLine?.flags.includes('assistente_romeu') ? (
                    <label className="text-xs">
                      <span className="font-medium text-muted">
                        Acumulado mês (soma U Romeu Q1+Q2)
                        {selectedLine.folha_extras.romeu_comissao_parcela != null
                          ? ` · top-up meta ${formatMoney(selectedLine.folha_extras.romeu_comissao_parcela)}`
                          : ''}
                      </span>
                      <input
                        className={FOLHA_INPUT}
                        value={acumuladoInput}
                        onChange={(e) => setAcumuladoInput(e.target.value)}
                        inputMode="decimal"
                        placeholder="ex. 10230.03"
                      />
                    </label>
                  ) : null}
                  {selectedLine?.exception_id === 'lucas_campos' ? (
                    <>
                      <label className="text-xs">
                        <span className="font-medium text-muted">
                          Faturado mesmo mês ano anterior (meta +14%)
                          {selectedLine.folha_extras.meta_quinzena_alvo != null
                            ? ` · alvo ${formatMoney(selectedLine.folha_extras.meta_quinzena_alvo)}`
                            : ''}
                        </span>
                        <input
                          className={FOLHA_INPUT}
                          value={faturadoAnoAntInput}
                          onChange={(e) => setFaturadoAnoAntInput(e.target.value)}
                          inputMode="decimal"
                          placeholder="ex. 10000"
                        />
                      </label>
                      <label className="text-xs">
                        <span className="font-medium text-muted">Faturado mês atual (Q1+Q2)</span>
                        <input
                          className={FOLHA_INPUT}
                          value={faturadoMesInput}
                          onChange={(e) => setFaturadoMesInput(e.target.value)}
                          inputMode="decimal"
                          placeholder="ex. 11400"
                        />
                      </label>
                      <label className="text-xs">
                        <span className="font-medium text-muted">
                          Taxa adm Q1 (devolve na Q2 se bater meta)
                          {selectedLine.folha_extras.devolucao_taxa_adm_q1 != null
                            ? ` · devolução ${formatMoney(selectedLine.folha_extras.devolucao_taxa_adm_q1)}`
                            : ''}
                        </span>
                        <input
                          className={FOLHA_INPUT}
                          value={taxaAdmQ1Input}
                          onChange={(e) => setTaxaAdmQ1Input(e.target.value)}
                          inputMode="decimal"
                          placeholder="ex. 500"
                        />
                      </label>
                    </>
                  ) : null}
                  {taxExtrasAllowed ? (
                    <>
                      <label className="text-xs">
                        <span className="font-medium text-muted">DARF</span>
                        <input
                          className={FOLHA_INPUT}
                          value={darfInput}
                          onChange={(e) => setDarfInput(e.target.value)}
                          inputMode="decimal"
                        />
                      </label>
                      <label className="text-xs">
                        <span className="font-medium text-muted">DAS</span>
                        <input
                          className={FOLHA_INPUT}
                          value={dasInput}
                          onChange={(e) => setDasInput(e.target.value)}
                          inputMode="decimal"
                        />
                      </label>
                      <label className="text-xs">
                        <span className="font-medium text-muted">Mensalidade contábil</span>
                        <input
                          className={FOLHA_INPUT}
                          value={mensalidadeInput}
                          onChange={(e) => setMensalidadeInput(e.target.value)}
                          inputMode="decimal"
                        />
                      </label>
                    </>
                  ) : (
                    <p className="text-xs text-muted md:col-span-2">
                      DARF/DAS/mensalidade só no pagamento do dia 20 (1ª quinzena). Nesta Folha
                      (dia 05) não entram como abatimento.
                    </p>
                  )}
                  <div className="md:col-span-4">
                    <button
                      type="button"
                      disabled={busy || !selectedName}
                      onClick={() => void onSaveExtras()}
                      className={FOLHA_BTN_PRIMARY}
                    >
                      Salvar extras na linha
                    </button>
                  </div>
                </div>

                <div className="space-y-2.5 rounded-2xl border border-border bg-surface p-3.5">
                  <p className="text-xs font-semibold text-foreground">
                    Colar e-mail fiscal (DARF/DAS/mensalidade)
                  </p>
                  {!taxExtrasAllowed ? (
                    <p className="text-xs text-muted">
                      Abre a 1ª quinzena (paga dia 20) para colar/aplicar impostos — e-mails até o
                      dia 15.
                    </p>
                  ) : null}
                  <input
                    className={`${FOLHA_INPUT} text-xs`}
                    placeholder="Assunto (opcional)"
                    value={taxSubject}
                    onChange={(e) => setTaxSubject(e.target.value)}
                    disabled={!taxExtrasAllowed}
                  />
                  <textarea
                    className={`min-h-[88px] ${FOLHA_INPUT} text-xs`}
                    placeholder="Corpo do e-mail…"
                    value={taxBody}
                    onChange={(e) => setTaxBody(e.target.value)}
                    disabled={!taxExtrasAllowed}
                  />
                  <button
                    type="button"
                    disabled={busy || !taxBody.trim() || !taxExtrasAllowed}
                    onClick={() => void onTaxIngest()}
                    className={FOLHA_BTN_SECONDARY}
                  >
                    Ler e aplicar se houver nome
                  </button>
                </div>

                <div className="w-full overflow-hidden rounded-2xl border border-border bg-surface">
                  <p className="border-b border-border/80 bg-card-elevated px-3 py-2 text-[11px] text-muted">
                    Valores em R$ (sem símbolo na grade). Clique na linha para editar · hover no
                    cabeçalho = nome completo. Legenda:{' '}
                    <span className="text-foreground">U</span> = serviços em que o assistente
                    atuou como profissional ·{' '}
                    <span className="text-foreground">W</span> = taxa cobrada sobre esses
                    serviços (U).
                  </p>
                  <div className="w-full overflow-x-auto">
                    <table className="w-full min-w-0 table-fixed border-collapse text-left text-[11px] leading-tight">
                      <colgroup>
                        <col className="w-[14%]" />
                        <col className="w-[8%]" />
                        <col className="w-[7%]" />
                        <col className="w-[7%]" />
                        <col className="w-[5.5%]" />
                        <col className="w-[6.5%]" />
                        <col className="w-[5.5%]" />
                        <col className="w-[5.5%]" />
                        <col className="w-[6%]" />
                        <col className="w-[5.5%]" />
                        <col className="w-[5%]" />
                        <col className="w-[5.5%]" />
                        <col className="w-[5%]" />
                        <col className="w-[5%]" />
                        {taxExtrasAllowed ? (
                          <>
                            <col className="w-[4.5%]" />
                            <col className="w-[4.5%]" />
                          </>
                        ) : null}
                        <col className="w-[5%]" />
                      </colgroup>
                      <thead>
                        <tr className="sticky top-0 z-10 border-b border-border bg-card-elevated text-[10px] font-semibold uppercase tracking-wide text-foreground/70">
                          <th className="px-2 py-2 font-semibold">Profissional</th>
                          <th className="py-2 pr-1 font-semibold" title="Cargo">
                            Cargo
                          </th>
                          <th className="py-2 pr-1 text-right font-semibold" title="Líquido a pagar">
                            Líquido
                          </th>
                          <th className="py-2 pr-1 text-right font-semibold" title="Faturado">
                            Fat.
                          </th>
                          <th className="py-2 pr-1 text-right font-semibold" title="Taxa cartão">
                            Cartão
                          </th>
                          <th className="py-2 pr-1 text-right font-semibold" title="Rateio − cartão">
                            Rateio
                          </th>
                          <th className="py-2 pr-1 text-right font-semibold" title="Produto">
                            Prod.
                          </th>
                          <th
                            className="py-2 pr-1 text-right font-semibold"
                            title="Taxa administrativa"
                          >
                            Adm
                          </th>
                          <th
                            className="py-2 pr-1 text-right font-semibold"
                            title="Desconto assistente"
                          >
                            Assist.
                          </th>
                          <th className="py-2 pr-1 text-right font-semibold" title="Meio a meio">
                            Meio
                          </th>
                          <th className="py-2 pr-1 text-right font-semibold" title="Outros descontos">
                            Outros
                          </th>
                          <th className="py-2 pr-1 text-right font-semibold" title="Consumo Baru">
                            Baru
                          </th>
                          <th
                            className="py-2 pr-1 text-right font-semibold"
                            title="Serviços assistente como pro (U)"
                          >
                            U
                          </th>
                          <th className="py-2 pr-1 text-right font-semibold" title="Taxa serviços (W)">
                            W
                          </th>
                          {taxExtrasAllowed ? (
                            <>
                              <th className="py-2 pr-1 text-right font-semibold" title="DARF">
                                DARF
                              </th>
                              <th className="py-2 pr-1 text-right font-semibold" title="DAS">
                                DAS
                              </th>
                              <th
                                className="py-2 pr-1 text-right font-semibold"
                                title="Mensalidade contábil"
                              >
                                Mensal.
                              </th>
                            </>
                          ) : null}
                          <th className="py-2 font-semibold" title="Alertas">
                            !
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleLines.map((line) => {
                          const alertText =
                            line.flags.length === 0
                              ? ''
                              : line.flags.map(flagLabel).join(' · ')
                          const selected = selectedName === line.name
                          return (
                            <tr
                              key={line.name}
                              className={`cursor-pointer border-b border-border/50 transition-colors ${
                                selected
                                  ? 'bg-gold/12'
                                  : 'hover:bg-card-elevated/90 odd:bg-background/40'
                              }`}
                              onClick={() => selectLine(line)}
                            >
                              <td
                                className="truncate px-2 py-1.5 font-medium text-foreground"
                                title={line.name}
                              >
                                {line.name}
                              </td>
                              <td
                                className="truncate py-1.5 pr-1 text-muted"
                                title={line.cargo_raw ?? undefined}
                              >
                                {line.cargo_raw ?? '—'}
                              </td>
                              <td className="py-1.5 pr-1 text-right font-semibold tabular-nums text-foreground">
                                {formatMoneyCompact(line.proposed_pay)}
                              </td>
                              <td className="py-1.5 pr-1 text-right tabular-nums text-foreground/90">
                                {formatMoneyCompact(folhaFaturadoDisplay(line))}
                              </td>
                              <td className="py-1.5 pr-1 text-right tabular-nums text-foreground/90">
                                {formatDeductionCompact(line.avec.card_fee)}
                              </td>
                              <td className="py-1.5 pr-1 text-right tabular-nums text-foreground/90">
                                {formatMoneyCompact(line.rateio_apos_cartao)}
                              </td>
                              <td className="py-1.5 pr-1 text-right tabular-nums text-foreground/90">
                                {formatDeductionCompact(line.avec.product_spend)}
                              </td>
                              <td className="py-1.5 pr-1 text-right tabular-nums text-foreground/90">
                                {formatMoneyCompact(line.taxa_administrativa)}
                              </td>
                              <td className="py-1.5 pr-1 text-right tabular-nums text-foreground/90">
                                {formatDeductionCompact(line.avec.assistant_discount)}
                              </td>
                              <td className="py-1.5 pr-1 text-right tabular-nums text-foreground/90">
                                {formatMoneyCompact(line.meio_a_meio)}
                              </td>
                              <td className="py-1.5 pr-1 text-right tabular-nums text-foreground/90">
                                {formatMoneyCompact(line.outros_descontos)}
                              </td>
                              <td className="py-1.5 pr-1 text-right tabular-nums text-foreground/90">
                                {formatMoneyCompact(line.folha_extras.consumo_baru)}
                              </td>
                              <td className="py-1.5 pr-1 text-right tabular-nums text-foreground/90">
                                {formatMoneyCompact(
                                  line.folha_extras.servicos_assistente_como_pro,
                                )}
                              </td>
                              <td className="py-1.5 pr-1 text-right tabular-nums text-foreground/90">
                                {formatMoneyCompact(line.folha_extras.taxa_servicos)}
                              </td>
                              {taxExtrasAllowed ? (
                                <>
                                  <td className="py-1.5 pr-1 text-right tabular-nums text-foreground/90">
                                    {formatMoneyCompact(line.folha_extras.darf)}
                                  </td>
                                  <td className="py-1.5 pr-1 text-right tabular-nums text-foreground/90">
                                    {formatMoneyCompact(line.folha_extras.das)}
                                  </td>
                                  <td className="py-1.5 pr-1 text-right tabular-nums text-foreground/90">
                                    {formatMoneyCompact(
                                      line.folha_extras.mensalidade_contabilidade,
                                    )}
                                  </td>
                                </>
                              ) : null}
                              <td
                                className={`py-1.5 text-center ${
                                  line.flags.length === 0 ? 'text-muted' : 'font-semibold text-warning'
                                }`}
                                title={alertText || undefined}
                              >
                                {line.flags.length === 0 ? '—' : String(line.flags.length)}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  {visibleLines.length === 0 ? (
                    <p className="px-3 py-3 text-xs text-muted">
                      Nenhuma linha com a_pagar nesta quinzena. Desmarque o filtro ou atualize o
                      8123 após o sync do dia fim do período.
                    </p>
                  ) : null}
                </div>
              </>
            ) : (
              <div className="space-y-3 rounded-2xl border border-dashed border-border bg-surface px-4 py-5">
                <p className="text-sm text-muted">Nenhum rascunho para esta quinzena ainda.</p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void onRefresh()}
                  className={FOLHA_BTN_PRIMARY}
                >
                  Montar do 8123
                </button>
              </div>
            )}
          </div>
        ) : null}
      </SectionCard>

      <SectionCard title="Regras do motor" storageKey="folha-regras" defaultOpen={false}>
        {!loading && !error && rules ? (
          <div className="space-y-2 text-sm">
            <p className="rounded-xl bg-card-elevated px-3 py-2 text-xs font-medium text-muted">
              {rules.source}
            </p>
            <ul className="list-disc space-y-1.5 pl-5 text-foreground/90">
              <li>Pagamentos: dia 05 (2ª quinzena anterior) e dia 20 (1ª quinzena)</li>
              <li>
                Taxa serviços U: {pct(rules.assistant_service_tax_rate)} (≠ cartão)
              </li>
              <li>
                Assistente como pro: remessa {pct(rules.assistant_as_pro_remit_rate)}; ganho{' '}
                {pct(rules.assistant_as_pro_earn_rate)} + meio a meio
              </li>
              <li>
                Taxa adm profissional: BR 5% / IG 7% sobre faturado bruto — no IG,
                Brunna/Joah/Marcela ficam em 5%
              </li>
              <li>
                Exceções: Diello IG / Dayana BR / Gildenice IG — meio a meio 5% (salão
                5%; excedente do assistente &gt;10% no pro); Romeu 50%; Walter assistente
                30%; Dani Rocha comissão 55% + meio 50%; Liria taxa adm 7%; Brunna/Joah/
                Marcela taxa U 5% (2%+3%) + time (Gabriela Martins, Graciele, Camila,
                Tatiana, Patrícia Aguiar); assistentes Romeu: 30% já nas quinzenas; no
                dia 05 top-up +10% (10–20k) / +20% (acima de 20k) sobre o acumulado U do
                mês. Lucas Campos: meta = +14% vs mesmo mês ano anterior; Q1 cobra adm;
                se bater, Q2 isenta adm e devolve a adm da Q1. Esteticistas: sem bônus.
              </li>
              <li>Manicure sem taxa adm (exceto depilação)</li>
              <li>
                Olerite: se o 8123 zera taxa_adm e embute adm↔meio (+Baru) em descontos,
                a Folha desmembra colunas Fopag (Tx adm / Meio / Outros / Baru / U / W)
                sem reabater o que já está no a_pagar. Assistente-como-pro (todos, incl.
                Romeu): taxa adm 3% sobre o serviço. Fat. na grade usa Total Faturado do
                olerite/Fopag quando houver (`faturado_referencia`); o líquido segue o
                8123 (`valor_cobrado` + U). Rateio − cartão ≈ comissão/rateio do recibo
                (produto ≠ cartão).
              </li>
            </ul>
          </div>
        ) : null}
      </SectionCard>
    </IntranetPage>
  )
}
