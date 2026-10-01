/**
 * Tipos da Folha PJ (shell + motor de regras).
 */

import type { FolhaRulesSummary } from '@/lib/folha/rules'

export type FolhaPeriodStatus =
  | 'awaiting_rules'
  | 'draft'
  | 'ready_for_review'
  | 'approved'
  | 'paid'

export type FolhaShellStatus = {
  /**
   * true enquanto não há rascunho de quinzena a partir do 8123.
   * Regras de cálculo já estão travadas (`rules_locked`).
   */
  shell_only: boolean
  /** Regras do motor confirmadas (caderno + Fopag + RH). */
  rules_locked: boolean
  message: string
  rules: FolhaRulesSummary
  periods: FolhaPeriodSummary[]
}

export type FolhaPeriodSummary = {
  id: string
  label: string
  status: FolhaPeriodStatus
}
