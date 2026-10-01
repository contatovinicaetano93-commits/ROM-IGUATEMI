/**
 * Orquestra rascunho Folha: 8123 → persistência → extras → status.
 */

import type { RomPanelId } from '@/lib/brand'
import { occupancyMergeKey } from '@/lib/director-report/match-pro'
import {
  buildFolhaDraftFrom8123,
  type FolhaDraft,
} from '@/lib/folha/draft-from-8123'
import { quinzenaForDay, todayIsoSaoPaulo } from '@/lib/folha/period'
import { sendFolhaNotifyEmail } from '@/lib/folha/notify'
import { insertFolhaTaxDocument } from '@/lib/folha/store'
import {
  getFolhaPeriod,
  getLatestFolhaPeriod,
  getLatestSalonCommissionsNearOrLatest,
  saveFolhaPeriodLines,
  updateFolhaPeriodStatus,
  upsertFolhaPeriodFromDraft,
  type FolhaPeriodRow,
} from '@/lib/folha/store-facade'
import { parseFolhaTaxEmail, taxKindToExtrasKey } from '@/lib/folha/tax-parse'
import type { FolhaPeriodStatus } from '@/lib/folha/types'
import {
  applyExtrasToDraftLines,
  canTransitionFolhaStatus,
  periodRowToDraft,
  refreshDraftPreservingExtras,
  type FolhaLineExtrasPatch,
} from '@/lib/folha/workflow'

export async function loadOrCreateFolhaDraft(
  panel: RomPanelId,
  opts?: { referenceDay?: string; actor?: string | null },
): Promise<{ draft: FolhaDraft | null; period: FolhaPeriodRow | null }> {
  const anchor = opts?.referenceDay ?? todayIsoSaoPaulo()
  const quinzenaId = quinzenaForDay(anchor).id
  const persisted =
    (await getFolhaPeriod(quinzenaId)) ?? (await getLatestFolhaPeriod())

  const snapshot = await getLatestSalonCommissionsNearOrLatest(anchor)
  if (!snapshot && !persisted) return { draft: null, period: null }

  if (persisted && !snapshot) {
    return {
      draft: periodRowToDraft(panel, persisted),
      period: persisted,
    }
  }

  if (!snapshot) return { draft: null, period: persisted }

  if (!persisted) {
    const draft = buildFolhaDraftFrom8123({
      panel,
      referenceDay: snapshot.day,
      professionals: snapshot.professionals,
      quinzenaDay: anchor,
    })
    const period = await upsertFolhaPeriodFromDraft({
      draft,
      status: 'draft',
      sourceProfessionals: snapshot.professionals,
      updatedBy: opts?.actor ?? null,
      forceStatus: true,
    })
    return { draft: periodRowToDraft(panel, period), period }
  }

  return {
    draft: periodRowToDraft(panel, persisted),
    period: persisted,
  }
}

export async function refreshFolhaDraft(
  panel: RomPanelId,
  opts?: { referenceDay?: string; actor?: string | null },
): Promise<{ draft: FolhaDraft; period: FolhaPeriodRow }> {
  const anchor = opts?.referenceDay ?? todayIsoSaoPaulo()
  const snapshot = await getLatestSalonCommissionsNearOrLatest(anchor)
  if (!snapshot || snapshot.professionals.length === 0) {
    throw new Error('Sem snapshot 8123 para montar a Folha')
  }

  const quinzena = quinzenaForDay(anchor)
  const existing = await getFolhaPeriod(quinzena.id)
  const previousLines = existing?.lines ?? []

  const draft = refreshDraftPreservingExtras({
    panel,
    referenceDay: snapshot.day,
    professionals: snapshot.professionals,
    previousLines,
    quinzenaDay: anchor,
  })

  const period = await upsertFolhaPeriodFromDraft({
    draft,
    sourceProfessionals: snapshot.professionals,
    updatedBy: opts?.actor ?? null,
    status: existing?.status ?? 'draft',
    forceStatus: false,
  })

  return { draft: periodRowToDraft(panel, period), period }
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

  const result = applyExtrasToDraftLines({
    panel,
    lines: period.lines,
    sourceProfessionals: period.source_professionals,
    professionalName: args.professionalName,
    extras: args.extras,
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

export async function ingestFolhaTaxEmail(
  panel: RomPanelId,
  args: {
    periodId: string
    subject?: string | null
    body: string
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

  const parsed = parseFolhaTaxEmail({ subject: args.subject, body: args.body })
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
  const extrasKey = taxKindToExtrasKey(parsed.kind)
  if (
    args.applyToLine !== false &&
    extrasKey &&
    parsed.amount != null &&
    parsed.professional_name
  ) {
    const key = occupancyMergeKey(parsed.professional_name)
    const hit = period.lines.find(
      (l) =>
        l.name === parsed.professional_name ||
        (key != null && occupancyMergeKey(l.name) === key),
    )
    if (hit) {
      const patched = await patchFolhaLine(panel, {
        periodId: args.periodId,
        professionalName: hit.name,
        extras: { [extrasKey]: parsed.amount },
        actor: args.actor,
      })
      current = patched.period
      applied = true
    }
  }

  return {
    parsed,
    documentId: doc.id,
    draft: periodRowToDraft(panel, current),
    period: current,
    applied,
  }
}
