/**
 * Orquestra rascunho Folha: 8123 → persistência → extras → status.
 */

import type { RomPanelId } from '@/lib/brand'
import { isAvecConfigured, isAvecMock } from '@/lib/avec/client'
import { fetchCommissions8123ForRange } from '@/lib/avec/sync-commissions'
import {
  buildFolhaDraftFrom8123,
  type FolhaDraft,
} from '@/lib/folha/draft-from-8123'
import {
  acceptsFolhaTaxExtras,
  listRecentQuinzenas,
  parseFolhaPeriodId,
  quinzenaAvecRangeBr,
  resolveFolhaQuinzena,
  todayIsoSaoPaulo,
  type FolhaQuinzena,
} from '@/lib/folha/period'
import { sendFolhaNotifyEmail } from '@/lib/folha/notify'
import { insertFolhaTaxDocument } from '@/lib/folha/store'
import {
  getFolhaPeriod,
  getLatestSalonCommissionsNearOrLatest,
  saveFolhaPeriodLines,
  updateFolhaPeriodStatus,
  upsertFolhaPeriodFromDraft,
  type FolhaPeriodRow,
} from '@/lib/folha/store-facade'
import { parseFolhaTaxEmail, taxKindToExtrasKey } from '@/lib/folha/tax-parse'
import type {
  FolhaPeriodStatus,
  FolhaPeriodSummary,
  FolhaUpcomingPayment,
} from '@/lib/folha/types'
import {
  applyExtrasToDraftLines,
  canTransitionFolhaStatus,
  periodRowToDraft,
  refreshDraftPreservingExtras,
  sumProposedPay,
  type FolhaLineExtrasPatch,
} from '@/lib/folha/workflow'
import {
  fetchZigDetailedTransactions,
  zigWindowForQuinzenaDays,
} from '@/lib/folha/zig-client'
import {
  aggregateZigEmployeeConsumo,
  isZigFolhaConfigured,
  planZigConsumoBaruExtras,
  type ApplyZigConsumoResult,
} from '@/lib/folha/zig-consumo'
import { occupancyMergeKey } from '@/lib/director-report/match-pro'
import type { CommissionProfessionalRow } from '@/lib/salon/commission-metrics'

export type FolhaLoadOpts = {
  /** id `YYYY-MM-q1|q2` */
  periodId?: string
  /** Âncora YYYY-MM-DD (alternativa a periodId) */
  referenceDay?: string
  actor?: string | null
  today?: string
}

export function buildUpcomingPayments(today = todayIsoSaoPaulo()): FolhaUpcomingPayment[] {
  return listRecentQuinzenas({ today, count: 6 })
    .map((q) => ({
      period_id: q.id,
      label: q.label,
      pay_date: q.payDate,
      from: q.from,
      to: q.to,
      upcoming: q.payDate >= today,
    }))
    .sort((a, b) => a.pay_date.localeCompare(b.pay_date))
}

export async function listFolhaPeriodSummaries(
  today = todayIsoSaoPaulo(),
): Promise<FolhaPeriodSummary[]> {
  const recent = listRecentQuinzenas({ today, count: 6 })
  const out: FolhaPeriodSummary[] = []
  for (const q of recent) {
    const row = await getFolhaPeriod(q.id)
    out.push({
      id: q.id,
      label: q.label,
      status: row?.status ?? 'draft',
      reference_day: row?.reference_day ?? q.to,
      line_count: row?.lines.length ?? null,
      total_proposed_pay: row?.total_proposed_pay ?? null,
      pay_date: q.payDate,
      from: q.from,
      to: q.to,
    })
  }
  return out
}

/**
 * Carrega (ou cria) o rascunho da quinzena alvo.
 * Leitura: período persistido, senão snapshot DB perto do fim da quinzena.
 * Corte real inicio/fim vem de `refreshFolhaDraft` (live Avec).
 */
export async function loadOrCreateFolhaDraft(
  panel: RomPanelId,
  opts?: FolhaLoadOpts,
): Promise<{
  draft: FolhaDraft | null
  period: FolhaPeriodRow | null
  quinzena: FolhaQuinzena
}> {
  const today = opts?.today ?? todayIsoSaoPaulo()
  const quinzena = resolveFolhaQuinzena({
    periodId: opts?.periodId,
    day: opts?.referenceDay,
    today,
  })
  const persisted = await getFolhaPeriod(quinzena.id)
  const snapshot = await getLatestSalonCommissionsNearOrLatest(quinzena.to)

  if (!snapshot && !persisted) {
    return { draft: null, period: null, quinzena }
  }

  if (persisted && !snapshot) {
    return {
      draft: periodRowToDraft(panel, persisted),
      period: persisted,
      quinzena,
    }
  }

  if (!snapshot) return { draft: null, period: persisted, quinzena }

  if (!persisted) {
    const draft = buildFolhaDraftFrom8123({
      panel,
      referenceDay: snapshot.day,
      professionals: snapshot.professionals,
      quinzenaDay: quinzena.to,
    })
    // Garante id/label/payDate da quinzena pedida (não a do snapshot day).
    draft.quinzena = quinzena
    const period = await upsertFolhaPeriodFromDraft({
      draft,
      status: 'draft',
      sourceProfessionals: snapshot.professionals,
      updatedBy: opts?.actor ?? null,
      forceStatus: true,
    })
    return { draft: periodRowToDraft(panel, period), period, quinzena }
  }

  return {
    draft: periodRowToDraft(panel, persisted),
    period: persisted,
    quinzena,
  }
}

/**
 * Atualiza o rascunho com 8123 na janela da quinzena (inicio→fim, cortado em hoje).
 * Não grava em `salon_commissions_daily` (MTD do painel fica intacto).
 * Fallback: snapshot DB se Avec falhar / não configurado.
 */
export async function refreshFolhaDraft(
  panel: RomPanelId,
  opts?: FolhaLoadOpts,
): Promise<{
  draft: FolhaDraft
  period: FolhaPeriodRow
  quinzena: FolhaQuinzena
  source: 'avec_window' | 'db_snapshot'
  avec_range: { inicio: string; fim: string } | null
}> {
  const today = opts?.today ?? todayIsoSaoPaulo()
  const quinzena = resolveFolhaQuinzena({
    periodId: opts?.periodId,
    day: opts?.referenceDay,
    today,
  })
  const range = quinzenaAvecRangeBr(quinzena, today)

  let professionals: CommissionProfessionalRow[] | null = null
  let referenceDay = range.fimIso
  let source: 'avec_window' | 'db_snapshot' = 'db_snapshot'
  let avecRange: { inicio: string; fim: string } | null = null
  let avecError: Error | null = null

  // Mock fixtures não têm janela real — só Avec live (token/login).
  if (isAvecConfigured() && !isAvecMock()) {
    try {
      const fetched = await fetchCommissions8123ForRange({
        inicioBr: range.inicio,
        fimBr: range.fim,
      })
      if (fetched.truncated) {
        throw new Error(
          `8123 truncado na janela ${range.inicio}–${range.fim} — aumente AVEC_SYNC_MAX_PAGES ou tente de novo`,
        )
      }
      if (fetched.professionals.length > 0) {
        professionals = fetched.professionals
        referenceDay = range.fimIso
        source = 'avec_window'
        avecRange = { inicio: fetched.inicio, fim: fetched.fim }
      }
    } catch (e) {
      avecError = e instanceof Error ? e : new Error(String(e))
    }
  }

  if (!professionals) {
    const snapshot = await getLatestSalonCommissionsNearOrLatest(quinzena.to)
    if (!snapshot || snapshot.professionals.length === 0) {
      throw (
        avecError ??
        new Error(
          `Sem 8123 na janela ${range.inicio}–${range.fim} (nem snapshot DB até ${quinzena.to})`,
        )
      )
    }
    professionals = snapshot.professionals
    referenceDay = snapshot.day
    source = 'db_snapshot'
  }

  const existing = await getFolhaPeriod(quinzena.id)
  if (existing?.status === 'paid') {
    throw new Error('Período já pago — reabra para editar')
  }
  const previousLines = existing?.lines ?? []

  const draft = refreshDraftPreservingExtras({
    panel,
    referenceDay,
    professionals,
    previousLines,
    quinzenaDay: quinzena.to,
  })
  draft.quinzena = quinzena

  const period = await upsertFolhaPeriodFromDraft({
    draft,
    sourceProfessionals: professionals,
    updatedBy: opts?.actor ?? null,
    status: existing?.status ?? 'draft',
    forceStatus: false,
  })

  return {
    draft: periodRowToDraft(panel, period),
    period,
    quinzena,
    source,
    avec_range: avecRange,
  }
}

/**
 * Puxa consumo funcionário no Baru (Zig) e preenche `consumo_baru` nas linhas.
 * Não sobrescreve valor já lançado; não reabate se Baru já veio no 8123.
 */
export async function applyZigConsumoBaruToPeriod(
  panel: RomPanelId,
  args: { periodId: string; actor?: string | null },
): Promise<{
  draft: FolhaDraft
  period: FolhaPeriodRow
  report: ApplyZigConsumoResult
  zig: { placeId: string; txs: number; pages: number; skipped?: string }
}> {
  if (!isZigFolhaConfigured()) {
    throw new Error(
      'Zig não configurado — defina ZIG_API_TOKEN (e opcional ZIG_TRANSACTIONS_RPC)',
    )
  }
  const period = await getFolhaPeriod(args.periodId)
  if (!period) throw new Error('Período da Folha não encontrado')
  if (period.status === 'paid') throw new Error('Período já pago — reabra para editar')
  if (period.lines.length === 0) {
    throw new Error('Rascunho vazio — atualize do 8123 antes de puxar o Baru')
  }

  const quinzena = parseFolhaPeriodId(period.id)
  if (!quinzena) throw new Error(`Período inválido: ${period.id}`)
  const { sinceIso, untilIso } = zigWindowForQuinzenaDays(
    quinzena.from,
    quinzena.to,
  )
  const fetched = await fetchZigDetailedTransactions({
    panel,
    sinceIso,
    untilIso,
  })
  if (fetched.skipped === 'not_configured') {
    throw new Error('Zig não configurado — defina ZIG_API_TOKEN')
  }

  const spends = aggregateZigEmployeeConsumo(fetched.transactions, {
    fromIso: quinzena.from,
    toIso: quinzena.to,
  })
  const draftView = periodRowToDraft(panel, period)
  const { patches, report } = planZigConsumoBaruExtras(draftView.lines, spends)

  const applyTax = acceptsFolhaTaxExtras(quinzena.half)
  let lines = period.lines
  for (const patch of patches) {
    const result = applyExtrasToDraftLines({
      panel,
      lines,
      sourceProfessionals: period.source_professionals,
      professionalName: patch.professionalName,
      extras: patch.extras,
      applyTaxExtras: applyTax,
    })
    lines = result.lines
  }

  const updated = await saveFolhaPeriodLines({
    id: period.id,
    lines,
    totalProposedPay: sumProposedPay(lines),
    updatedBy: args.actor ?? null,
  })
  if (!updated) throw new Error('Falha ao salvar consumo Baru')

  return {
    draft: periodRowToDraft(panel, updated),
    period: updated,
    report,
    zig: {
      placeId: fetched.placeId,
      txs: fetched.transactions.length,
      pages: fetched.pages,
    },
  }
}

export async function patchFolhaLine(
  panel: RomPanelId,
  args: {
    periodId: string
    professionalName: string
    extras: FolhaLineExtrasPatch
    actor?: string | null
  },
): Promise<{ draft: FolhaDraft; period: FolhaPeriodRow }> {
  const period = await getFolhaPeriod(args.periodId)
  if (!period) throw new Error('Período da Folha não encontrado')
  if (period.status === 'paid') throw new Error('Período já pago — reabra para editar')

  const quinzena = parseFolhaPeriodId(period.id)
  const applyTax = quinzena ? acceptsFolhaTaxExtras(quinzena.half) : period.half === 1
  if (
    !applyTax &&
    (args.extras.darf != null ||
      args.extras.das != null ||
      args.extras.mensalidade_contabilidade != null)
  ) {
    throw new Error(
      'DARF/DAS/mensalidade só entram no pagamento do dia 20 (1ª quinzena)',
    )
  }

  const result = applyExtrasToDraftLines({
    panel,
    lines: period.lines,
    sourceProfessionals: period.source_professionals,
    professionalName: args.professionalName,
    extras: args.extras,
    applyTaxExtras: applyTax,
  })
  if (!result.matched) throw new Error('Profissional não encontrado no rascunho')

  const updated = await saveFolhaPeriodLines({
    id: period.id,
    lines: result.lines,
    totalProposedPay: result.total,
    updatedBy: args.actor ?? null,
  })
  if (!updated) throw new Error('Falha ao salvar linha')
  return { draft: periodRowToDraft(panel, updated), period: updated }
}

export async function transitionFolhaPeriod(args: {
  panel: RomPanelId
  periodId: string
  status: FolhaPeriodStatus
  actor?: string | null
  /** default true — e-mail ops ao aprovar */
  notifyOnApprove?: boolean
}): Promise<{
  draft: FolhaDraft
  period: FolhaPeriodRow
  notify: Awaited<ReturnType<typeof sendFolhaNotifyEmail>> | null
}> {
  const period = await getFolhaPeriod(args.periodId)
  if (!period) throw new Error('Período da Folha não encontrado')
  if (!canTransitionFolhaStatus(period.status, args.status)) {
    throw new Error(`Transição inválida: ${period.status} → ${args.status}`)
  }
  if (
    (args.status === 'ready_for_review' || args.status === 'approved') &&
    period.lines.length === 0
  ) {
    throw new Error('Rascunho vazio — atualize a partir do 8123 antes')
  }

  const updated = await updateFolhaPeriodStatus({
    id: args.periodId,
    status: args.status,
    actor: args.actor ?? null,
  })
  if (!updated) throw new Error('Falha ao atualizar status')
  const draft = periodRowToDraft(args.panel, updated)

  let notify: Awaited<ReturnType<typeof sendFolhaNotifyEmail>> | null = null
  if (args.status === 'approved' && args.notifyOnApprove !== false) {
    notify = await sendFolhaNotifyEmail({
      draft,
      status: args.status,
      actor: args.actor,
    })
  }

  return { draft, period: updated, notify }
}

/** Aplica DARF/DAS/mensalidade na linha (Q1); só preenche campo ainda null. */
export async function applyFolhaTaxParsedToPeriod(
  panel: RomPanelId,
  args: {
    periodId: string
    kind: ReturnType<typeof parseFolhaTaxEmail>['kind']
    amount: number | null
    professionalName: string | null
    actor?: string | null
  },
): Promise<{ applied: boolean; period: FolhaPeriodRow }> {
  const period = await getFolhaPeriod(args.periodId)
  if (!period) throw new Error('Período da Folha não encontrado')
  const extrasKey = taxKindToExtrasKey(args.kind)
  const quinzena = parseFolhaPeriodId(args.periodId)
  const applyTax = quinzena ? acceptsFolhaTaxExtras(quinzena.half) : period.half === 1
  if (
    !extrasKey ||
    args.amount == null ||
    !args.professionalName ||
    !applyTax
  ) {
    return { applied: false, period }
  }
  const key = occupancyMergeKey(args.professionalName)
  const hit = period.lines.find(
    (l) =>
      l.name === args.professionalName ||
      (key != null && occupancyMergeKey(l.name) === key),
  )
  if (!hit) return { applied: false, period }
  const existing = hit.folha_extras[extrasKey]
  if (existing != null) return { applied: false, period }
  const patched = await patchFolhaLine(panel, {
    periodId: args.periodId,
    professionalName: hit.name,
    extras: { [extrasKey]: args.amount },
    actor: args.actor,
  })
  return { applied: true, period: patched.period }
}

export async function ingestFolhaTaxEmail(
  panel: RomPanelId,
  args: {
    periodId: string
    subject?: string | null
    body: string
    filenames?: string[] | null
    source?: string
    actor?: string | null
    applyToLine?: boolean
  },
): Promise<{
  parsed: ReturnType<typeof parseFolhaTaxEmail>
  documentId: number
  draft: FolhaDraft
  period: FolhaPeriodRow
  applied: boolean
}> {
  const period = await getFolhaPeriod(args.periodId)
  if (!period) throw new Error('Período da Folha não encontrado')

  const parsed = parseFolhaTaxEmail({
    subject: args.subject,
    body: args.body,
    filenames: args.filenames,
  })
  const doc = await insertFolhaTaxDocument({
    periodId: args.periodId,
    kind: parsed.kind,
    professionalName: parsed.professional_name,
    amount: parsed.amount,
    subject: args.subject,
    body: args.body,
    source: args.source ?? 'paste',
  })

  let applied = false
  let current = period
  if (args.applyToLine !== false) {
    const result = await applyFolhaTaxParsedToPeriod(panel, {
      periodId: args.periodId,
      kind: parsed.kind,
      amount: parsed.amount,
      professionalName: parsed.professional_name,
      actor: args.actor,
    })
    current = result.period
    applied = result.applied
  }

  return {
    parsed,
    documentId: doc.id,
    draft: periodRowToDraft(panel, current),
    period: current,
    applied,
  }
}
