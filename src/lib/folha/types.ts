/**
 * Tipos do shell da Folha PJ.
 * Motor de cálculo / DARF entram depois das regras confirmadas pelo RH.
 */

export type FolhaPeriodStatus =
  | 'awaiting_rules'
  | 'draft'
  | 'ready_for_review'
  | 'approved'
  | 'paid'

export type FolhaShellStatus = {
  /** Shell sem motor — true até regras + cálculo existirem. */
  shell_only: boolean
  message: string
  periods: FolhaPeriodSummary[]
}

export type FolhaPeriodSummary = {
  id: string
  label: string
  status: FolhaPeriodStatus
}
