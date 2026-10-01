'use client'

import { useCallback, useEffect, useState } from 'react'
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
          }
        : prev,
    )
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/folha', {
        credentials: 'include',
        signal: AbortSignal.timeout(20_000),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(json.error ?? 'Falha ao carregar a Folha')
        setStatus(null)
        return
      }
      setStatus(json.data ?? null)
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
  const lines = draft?.lines ?? []
  const periodId = status?.period_id
  const periodStatus = status?.period_status

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

  async function onRefresh() {
    const data = await postJson('/api/folha/refresh', {})
    if (!data) return
    applyDraft(data.draft)
    setStatus((prev) =>
      prev
        ? {
            ...prev,
            period_status: data.period_status,
            period_id: data.period_id,
            message: `Rascunho atualizado do 8123 (${data.draft?.reference_day ?? '—'}).`,
          }
        : prev,
    )
    setActionMsg('8123 recarregado (extras preservados).')
  }

  async function onSaveExtras() {
    if (!periodId || !selectedName.trim()) {
      setError('Selecione um profissional')
      return
    }
    const data = await postJson(
      '/api/folha/lines',
      {
        period_id: periodId,
        professional_name: selectedName.trim(),
        extras: {
          servicos_assistente_como_pro: parseOptionalNumber(uInput),
          darf: parseOptionalNumber(darfInput),
          das: parseOptionalNumber(dasInput),
        },
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
      const res = await fetch('/api/folha/imap-poll', {
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
        await load()
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

  return (
    <IntranetPage
      kicker="RH · Financeiro"
      title="Folha de pagamento"
      subtitle="O sistema calcula a folha PJ; vocês conferem e liberam o pagamento."
    >
      <SectionCard title="Regras travadas">
        {loading ? <p className="text-sm text-muted">Carregando…</p> : null}
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        {!loading && !error && rules ? (
          <div className="space-y-2 text-sm">
            <p className="text-muted">{rules.source}</p>
            <ul className="list-disc space-y-1 pl-5 text-foreground">
              <li>
                Taxa serviços U: {pct(rules.assistant_service_tax_rate)} (≠ cartão)
              </li>
              <li>
                Assistente como pro: remessa {pct(rules.assistant_as_pro_remit_rate)}; ganho{' '}
                {pct(rules.assistant_as_pro_earn_rate)} + meio a meio
              </li>
              <li>Manicure sem taxa adm (exceto depilação)</li>
            </ul>
          </div>
        ) : null}
      </SectionCard>

      <SectionCard title="Rascunho da quinzena">
        {loading ? <p className="text-sm text-muted">Carregando…</p> : null}
        {!loading && status ? (
          <div className="space-y-4 text-sm">
            <p className="text-foreground">{status.message}</p>
            {actionMsg ? <p className="text-xs text-muted">{actionMsg}</p> : null}

            {draft ? (
              <>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="rounded-md border border-border px-2 py-1 text-xs">
                    {statusLabel(periodStatus)}
                  </span>
                  <span className="text-muted">{draft.quinzena.label}</span>
                  <span className="text-muted">8123 {draft.reference_day}</span>
                  <span className="text-muted">{draft.line_count} profissionais</span>
                  <span className="font-medium">
                    Total {formatMoney(draft.total_proposed_pay)}
                  </span>
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
                      {lines.map((l) => (
                        <option key={l.name} value={l.name}>
                          {l.name}
                        </option>
                      ))}
                    </select>
                  </label>
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
                  <input
                    className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
                    placeholder="Assunto (opcional)"
                    value={taxSubject}
                    onChange={(e) => setTaxSubject(e.target.value)}
                  />
                  <textarea
                    className="min-h-[80px] w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
                    placeholder="Corpo do e-mail…"
                    value={taxBody}
                    onChange={(e) => setTaxBody(e.target.value)}
                  />
                  <button
                    type="button"
                    disabled={busy || !taxBody.trim()}
                    onClick={() => void onTaxIngest()}
                    className="rounded-md border border-border px-3 py-1.5 text-xs disabled:opacity-50"
                  >
                    Ler e aplicar se houver nome
                  </button>
                  <p className="text-[11px] text-muted">
                    IMAP automático entra depois (FOLHA_IMAP_*). Hoje é paste manual.
                  </p>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
                        <th className="py-2 pr-3 font-medium">Profissional</th>
                        <th className="py-2 pr-3 font-medium">Cargo</th>
                        <th className="py-2 pr-3 font-medium tabular-nums">a_pagar</th>
                        <th className="py-2 pr-3 font-medium tabular-nums">U</th>
                        <th className="py-2 pr-3 font-medium tabular-nums">DARF</th>
                        <th className="py-2 pr-3 font-medium tabular-nums">DAS</th>
                        <th className="py-2 pr-3 font-medium tabular-nums">Proposto</th>
                        <th className="py-2 font-medium">Alertas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((line) => (
                        <tr
                          key={line.name}
                          className="cursor-pointer border-b border-border/60 hover:bg-background/80"
                          onClick={() => selectLine(line)}
                        >
                          <td className="py-2 pr-3 text-foreground">{line.name}</td>
                          <td className="py-2 pr-3 text-muted">{line.cargo_raw ?? '—'}</td>
                          <td className="py-2 pr-3 tabular-nums">
                            {formatMoney(line.avec.net_payable)}
                          </td>
                          <td className="py-2 pr-3 tabular-nums">
                            {formatMoney(line.folha_extras.servicos_assistente_como_pro)}
                          </td>
                          <td className="py-2 pr-3 tabular-nums">
                            {formatMoney(line.folha_extras.darf)}
                          </td>
                          <td className="py-2 pr-3 tabular-nums">
                            {formatMoney(line.folha_extras.das)}
                          </td>
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
                </div>
              </>
            ) : (
              <div className="space-y-2">
                <p className="text-muted">Nenhuma quinzena com dados 8123 no momento.</p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void onRefresh()}
                  className="rounded-md border border-border px-3 py-1.5 text-xs disabled:opacity-50"
                >
                  Tentar montar do 8123
                </button>
              </div>
            )}
          </div>
        ) : null}
      </SectionCard>
    </IntranetPage>
  )
}
