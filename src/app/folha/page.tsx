'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { IntranetPage } from '../_components/intranet/IntranetPage'
import { SectionCard } from '../_components/ui'
import type { FolhaDraft, FolhaDraftLine } from '@/lib/folha/draft-from-8123'
import type { FolhaPeriodStatus, FolhaShellStatus } from '@/lib/folha/types'

function pct(rate: number): string {
  return `${(rate * 100).toFixed(0)}%`
}

function formatMoney(value: number | null | undefined): string {
  if (value == null) return '—'
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

/** Magnitude de abatimento Avec (8123 guarda negativo). */
function formatDeduction(value: number | null | undefined): string {
  if (value == null) return '—'
  return formatMoney(Math.abs(value))
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
    case 'assistente_romeu':
      return 'Assistente do Romeu (faixas 30/40/50)'
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
  const [darfInput, setDarfInput] = useState('')
  const [dasInput, setDasInput] = useState('')
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

  async function onSaveExtras() {
    if (!periodId || !selectedName.trim()) {
      setError('Selecione um profissional')
      return
    }
    const extras: Record<string, number | null> = {
      servicos_assistente_como_pro: parseOptionalNumber(uInput),
    }
    if (taxExtrasAllowed) {
      extras.darf = parseOptionalNumber(darfInput)
      extras.das = parseOptionalNumber(dasInput)
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

  function selectLine(line: FolhaDraftLine) {
    setSelectedName(line.name)
    setUInput(
      line.folha_extras.servicos_assistente_como_pro != null
        ? String(line.folha_extras.servicos_assistente_como_pro)
        : '',
    )
    setDarfInput(line.folha_extras.darf != null ? String(line.folha_extras.darf) : '')
    setDasInput(line.folha_extras.das != null ? String(line.folha_extras.das) : '')
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
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        {!loading && status ? (
          <div className="space-y-3 text-sm">
            <div className="flex flex-wrap gap-2">
              {upcoming.length === 0 ? (
                <p className="text-muted">Sem pagamentos futuros na janela listada.</p>
              ) : (
                upcoming.map((p) => (
                  <button
                    key={p.period_id}
                    type="button"
                    disabled={busy}
                    onClick={() => void onChangePeriod(p.period_id)}
                    className={`rounded-md border px-3 py-2 text-left text-xs ${
                      selectedPeriod === p.period_id
                        ? 'border-foreground bg-foreground/5'
                        : 'border-border'
                    }`}
                  >
                    <div className="font-medium text-foreground">Paga {formatDayBr(p.pay_date)}</div>
                    <div className="text-muted">{p.label}</div>
                    <div className="text-muted">
                      {formatDayBr(p.from)} – {formatDayBr(p.to)}
                    </div>
                  </button>
                ))
              )}
            </div>
            <label className="block text-xs">
              <span className="text-muted">Quinzena</span>
              <select
                className="mt-1 w-full max-w-md rounded-md border border-border bg-background px-2 py-1.5"
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
            <p className="text-foreground">{status.message}</p>
            {actionMsg ? <p className="text-xs text-muted">{actionMsg}</p> : null}

            {draft ? (
              <>
                <label className="block text-xs max-w-lg">
                  <span className="text-muted">Quinzena / data de pagamento</span>
                  <select
                    className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5"
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

                <div className="flex flex-wrap items-center gap-3">
                  <span className="rounded-md border border-border px-2 py-1 text-xs">
                    {statusLabel(periodStatus)}
                  </span>
                  <span className="font-medium">Paga {formatDayBr(status.pay_date)}</span>
                  <span className="text-muted">{draft.quinzena.label}</span>
                  <span className="text-muted">
                    {formatDayBr(draft.quinzena.from)} – {formatDayBr(draft.quinzena.to)}
                  </span>
                  <span className="text-muted">
                    8123 {formatDayBr(draft.quinzena.from)}–{formatDayBr(draft.reference_day)}
                  </span>
                  <span className="text-muted">
                    {visibleLines.length}/{draft.line_count} na lista
                  </span>
                  <span className="font-medium">Total {formatMoney(draft.total_proposed_pay)}</span>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void onRefresh()}
                    className="rounded-md border border-border px-3 py-1.5 text-xs disabled:opacity-50"
                  >
                    Atualizar do 8123
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void onImapPoll()}
                    className="rounded-md border border-border px-3 py-1.5 text-xs disabled:opacity-50"
                  >
                    Buscar DARF/DAS (IMAP)
                  </button>
                  {periodStatus === 'draft' || periodStatus === 'ready_for_review' ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void onStatus('ready_for_review')}
                      className="rounded-md border border-border px-3 py-1.5 text-xs disabled:opacity-50"
                    >
                      Enviar para conferência
                    </button>
                  ) : null}
                  {periodStatus === 'draft' || periodStatus === 'ready_for_review' ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void onStatus('approved')}
                      className="rounded-md border border-border px-3 py-1.5 text-xs disabled:opacity-50"
                    >
                      Aprovar
                    </button>
                  ) : null}
                  {periodStatus === 'approved' ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void onStatus('paid')}
                      className="rounded-md border border-border px-3 py-1.5 text-xs disabled:opacity-50"
                    >
                      Marcar pago
                    </button>
                  ) : null}
                  {periodStatus === 'approved' || periodStatus === 'ready_for_review' ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void onStatus('draft')}
                      className="rounded-md border border-border px-3 py-1.5 text-xs disabled:opacity-50"
                    >
                      Reabrir rascunho
                    </button>
                  ) : null}
                  <label className="ml-auto flex items-center gap-2 text-xs text-muted">
                    <input
                      type="checkbox"
                      checked={onlyWithPay}
                      onChange={(e) => setOnlyWithPay(e.target.checked)}
                    />
                    Só quem tem a_pagar
                  </label>
                </div>

                <div className="grid gap-3 rounded-lg border border-border p-3 md:grid-cols-4">
                  <label className="text-xs md:col-span-2">
                    <span className="text-muted">Profissional</span>
                    <select
                      className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5"
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
                  <div className="text-xs md:col-span-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    <div>
                      <span className="text-muted">Faturado</span>
                      <p className="mt-1 tabular-nums">
                        {formatMoney(selectedLine?.avec.charged)}
                      </p>
                    </div>
                    <div>
                      <span className="text-muted">Taxa cartão</span>
                      <p className="mt-1 tabular-nums">
                        {formatDeduction(selectedLine?.avec.card_fee)}
                      </p>
                    </div>
                    <div>
                      <span className="text-muted">Produto</span>
                      <p className="mt-1 tabular-nums">
                        {formatDeduction(selectedLine?.avec.product_spend)}
                      </p>
                    </div>
                    <div>
                      <span className="text-muted">Taxa adm</span>
                      <p className="mt-1 tabular-nums">
                        {formatDeduction(selectedLine?.avec.admin_fee)}
                      </p>
                    </div>
                    <div>
                      <span className="text-muted">Assistente</span>
                      <p className="mt-1 tabular-nums">
                        {formatDeduction(selectedLine?.avec.assistant_discount)}
                      </p>
                    </div>
                    <div>
                      <span className="text-muted">Meio a meio</span>
                      <p className="mt-1 tabular-nums">
                        {formatMoney(selectedLine?.meio_a_meio)}
                      </p>
                    </div>
                    <div>
                      <span className="text-muted">a_pagar 8123</span>
                      <p className="mt-1 font-medium tabular-nums">
                        {formatMoney(selectedLine?.avec.net_payable)}
                      </p>
                    </div>
                    <div>
                      <span className="text-muted">Líquido a pagar</span>
                      <p className="mt-1 font-medium tabular-nums">
                        {formatMoney(selectedLine?.proposed_pay)}
                      </p>
                    </div>
                  </div>
                  <label className="text-xs">
                    <span className="text-muted">U · serviços assist. como pro</span>
                    <input
                      className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5"
                      value={uInput}
                      onChange={(e) => setUInput(e.target.value)}
                      inputMode="decimal"
                      placeholder="ex. 1000"
                    />
                  </label>
                  {taxExtrasAllowed ? (
                    <>
                      <label className="text-xs">
                        <span className="text-muted">DARF</span>
                        <input
                          className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5"
                          value={darfInput}
                          onChange={(e) => setDarfInput(e.target.value)}
                          inputMode="decimal"
                        />
                      </label>
                      <label className="text-xs">
                        <span className="text-muted">DAS</span>
                        <input
                          className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5"
                          value={dasInput}
                          onChange={(e) => setDasInput(e.target.value)}
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
                      className="rounded-md border border-border px-3 py-1.5 text-xs disabled:opacity-50"
                    >
                      Salvar extras na linha
                    </button>
                  </div>
                </div>

                <div className="space-y-2 rounded-lg border border-border p-3">
                  <p className="text-xs font-medium text-foreground">Colar e-mail fiscal (DARF/DAS)</p>
                  {!taxExtrasAllowed ? (
                    <p className="text-xs text-muted">
                      Abre a 1ª quinzena (paga dia 20) para colar/aplicar impostos — e-mails até o
                      dia 15.
                    </p>
                  ) : null}
                  <input
                    className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
                    placeholder="Assunto (opcional)"
                    value={taxSubject}
                    onChange={(e) => setTaxSubject(e.target.value)}
                    disabled={!taxExtrasAllowed}
                  />
                  <textarea
                    className="min-h-[80px] w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
                    placeholder="Corpo do e-mail…"
                    value={taxBody}
                    onChange={(e) => setTaxBody(e.target.value)}
                    disabled={!taxExtrasAllowed}
                  />
                  <button
                    type="button"
                    disabled={busy || !taxBody.trim() || !taxExtrasAllowed}
                    onClick={() => void onTaxIngest()}
                    className="rounded-md border border-border px-3 py-1.5 text-xs disabled:opacity-50"
                  >
                    Ler e aplicar se houver nome
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[960px] border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
                        <th className="py-2 pr-3 font-medium">Profissional</th>
                        <th className="py-2 pr-3 font-medium">Cargo</th>
                        <th className="py-2 pr-3 font-medium tabular-nums">Faturado</th>
                        <th className="py-2 pr-3 font-medium tabular-nums">Tx cartão</th>
                        <th className="py-2 pr-3 font-medium tabular-nums">Produto</th>
                        <th className="py-2 pr-3 font-medium tabular-nums">Tx adm</th>
                        <th className="py-2 pr-3 font-medium tabular-nums">Assistente</th>
                        <th className="py-2 pr-3 font-medium tabular-nums">Meio a meio</th>
                        {taxExtrasAllowed ? (
                          <>
                            <th className="py-2 pr-3 font-medium tabular-nums">DARF</th>
                            <th className="py-2 pr-3 font-medium tabular-nums">DAS</th>
                          </>
                        ) : null}
                        <th className="py-2 pr-3 font-medium tabular-nums">Líquido</th>
                        <th className="py-2 font-medium">Alertas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleLines.map((line) => (
                        <tr
                          key={line.name}
                          className="cursor-pointer border-b border-border/60 hover:bg-background/80"
                          onClick={() => selectLine(line)}
                        >
                          <td className="py-2 pr-3 text-foreground">{line.name}</td>
                          <td className="py-2 pr-3 text-muted">{line.cargo_raw ?? '—'}</td>
                          <td className="py-2 pr-3 tabular-nums">
                            {formatMoney(line.avec.charged)}
                          </td>
                          <td className="py-2 pr-3 tabular-nums">
                            {formatDeduction(line.avec.card_fee)}
                          </td>
                          <td className="py-2 pr-3 tabular-nums">
                            {formatDeduction(line.avec.product_spend)}
                          </td>
                          <td className="py-2 pr-3 tabular-nums">
                            {formatDeduction(line.avec.admin_fee)}
                          </td>
                          <td className="py-2 pr-3 tabular-nums">
                            {formatDeduction(line.avec.assistant_discount)}
                          </td>
                          <td className="py-2 pr-3 tabular-nums">
                            {formatMoney(line.meio_a_meio)}
                          </td>
                          {taxExtrasAllowed ? (
                            <>
                              <td className="py-2 pr-3 tabular-nums">
                                {formatMoney(line.folha_extras.darf)}
                              </td>
                              <td className="py-2 pr-3 tabular-nums">
                                {formatMoney(line.folha_extras.das)}
                              </td>
                            </>
                          ) : null}
                          <td className="py-2 pr-3 tabular-nums font-medium">
                            {formatMoney(line.proposed_pay)}
                          </td>
                          <td className="py-2 text-xs text-muted">
                            {line.flags.length === 0
                              ? '—'
                              : line.flags.map(flagLabel).join(' · ')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {visibleLines.length === 0 ? (
                    <p className="mt-3 text-xs text-muted">
                      Nenhuma linha com a_pagar nesta quinzena. Desmarque o filtro ou atualize o
                      8123 após o sync do dia fim do período.
                    </p>
                  ) : null}
                </div>
              </>
            ) : (
              <div className="space-y-2">
                <p className="text-muted">Nenhum rascunho para esta quinzena ainda.</p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void onRefresh()}
                  className="rounded-md border border-border px-3 py-1.5 text-xs disabled:opacity-50"
                >
                  Montar do 8123
                </button>
              </div>
            )}
          </div>
        ) : null}
      </SectionCard>

      <SectionCard title="Regras do motor">
        {!loading && !error && rules ? (
          <div className="space-y-2 text-sm">
            <p className="text-muted">{rules.source}</p>
            <ul className="list-disc space-y-1 pl-5 text-foreground">
              <li>Pagamentos: dia 05 (2ª quinzena anterior) e dia 20 (1ª quinzena)</li>
              <li>
                Taxa serviços U: {pct(rules.assistant_service_tax_rate)} (≠ cartão)
              </li>
              <li>
                Assistente como pro: remessa {pct(rules.assistant_as_pro_remit_rate)}; ganho{' '}
                {pct(rules.assistant_as_pro_earn_rate)} + meio a meio
              </li>
              <li>
                Exceções: Pedro/Dayana meio a meio 5%; Romeu 50%; Walter assistente 30% /
                Dani Rocha 35%; Brunna/Joah/Marcela taxa 5% (2%+3%); assistentes Romeu
                30/40/50% no acumulado do mês
              </li>
              <li>Manicure sem taxa adm (exceto depilação)</li>
            </ul>
          </div>
        ) : null}
      </SectionCard>
    </IntranetPage>
  )
}
