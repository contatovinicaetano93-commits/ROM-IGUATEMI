/**
 * Tipos da Folha PJ (shell + motor + rascunho 8123).
 */

import type { FolhaDraft } from '@/lib/folha/draft-from-8123'
import type { FolhaRulesSummary } from '@/lib/folha/rules'

export type FolhaPeriodStatus =
  | 'awaiting_rules'
  | 'draft'
  | 'ready_for_review'
  | 'approved'
  | 'paid'

export type FolhaShellStatus = {
  /**
   * true enquanto não há linhas do 8123 para montar rascunho.
   * Regras travadas independente disso (`rules_locked`).
   */
  shell_only: boolean
  /** Regras do motor confirmadas (caderno + Fopag + RH). */
  rules_locked: boolean
  message: string
  rules: FolhaRulesSummary
  /** Rascunho atual a partir do 8123; null se ainda não há snapshot. */
  draft: FolhaDraft | null
  periods: FolhaPeriodSummary[]
}

export type FolhaPeriodSummary = {
  id: string
  label: string
  status: FolhaPeriodStatus
  reference_day?: string | null
  line_count?: number | null
  total_proposed_pay?: number | null
}
