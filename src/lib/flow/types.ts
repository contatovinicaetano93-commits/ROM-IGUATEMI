export type RequestArea = 'financeiro' | 'manutencao' | 'compras' | 'rh'

export type FlowRole =
  | 'master'
  | 'admin_financeiro'
  | 'admin_manutencao'
  | 'admin_compras'
  | 'admin_rh'
  | 'solicitante'

/** Alias used by the copied RomFlow workflow. */
export type Role = FlowRole

export type UserStatus = 'active' | 'inactive'

export type ExpenseStatus =
  | 'em_analise'
  | 'devolvido'
  | 'aprovada'
  | 'recusada'
  | 'aberta'
  | 'em_andamento'
  | 'finalizada'
  | 'cancelada'

export type ExpenseType =
  | 'fornecedor'
  | 'reembolso_colaborador'
  | 'reembolso_cliente'
  | 'outros'
  | 'chamado'
  | 'pedido'
  | 'ferias'
  | 'admissao'
  | 'desligamento'
  | 'salario'
  | 'beneficio'
  | 'atestado'
  | 'uniforme'

export type PaymentMethod = 'pix' | 'ted' | 'boleto'

export type Screen =
  | 'dashboard'
  | 'expenses'
  | 'my-expenses'
  | 'new-financeiro'
  | 'new-manutencao'
  | 'new-compras'
  | 'new-rh'
  | 'approvals'
  | 'payments'
  | 'reports'
  | 'users'
  | 'audit'
  | 'settings'

export type AuditAction =
  | 'CREATE_EXPENSE'
  | 'REQUEST_DOCUMENTATION'
  | 'APPROVE_EXPENSE'
  | 'REJECT_EXPENSE'
  | 'UPDATE_EXPENSE'
  | 'DELETE_EXPENSE'
  | 'UPDATE_USER'
  | 'REVOKE_USER'
  | 'ATTACH_PROOF'
  | 'PROGRESS_EXPENSE'
  | 'COMPLETE_EXPENSE'
  | 'CANCEL_EXPENSE'

export type RequestAction =
  | 'docs'
  | 'approve'
  | 'reject'
  | 'resubmit'
  | 'attach_proof'
  | 'progress'
  | 'complete'
  | 'cancel'

export type FinanceAction = RequestAction

export type StoredFile = {
  name: string
  size: number
  type: string
  url?: string
  dataUrl?: string
}

export type FinanceActionPayload = {
  note?: string
  proof?: StoredFile | null
  receipt?: StoredFile | null
}

export type Company = {
  id: string
  name: string
  legal_name: string
  slug: string
  initials: string
  color: string
  is_active: boolean
}

export type Category = {
  id: string
  name: string
  color: string
  is_active: boolean
}

export type User = {
  id: string
  name: string
  email: string
  password?: string
  role: Role
  status: UserStatus
  companyIds: string[]
  areaIds: RequestArea[]
  created: string
}

export type Expense = {
  id: string
  title: string
  description: string
  area: RequestArea
  expense_type: ExpenseType
  event_project: string
  event_date: string
  amount: number
  category: string
  payment_method: PaymentMethod
  beneficiary_name: string
  beneficiary_document: string
  pix_key: string
  bank_name: string
  agency: string
  account: string
  boleto_code: string
  max_payment_date: string
  payment_date_justification: string
  receipt_justification: string
  receipt: StoredFile | null
  payment_proof: StoredFile | null
  company: string
  requester: string
  approver: string | null
  status: ExpenseStatus
  scheduled_date: string | null
  review_note: string
  created: string
  updated: string
}

export type Invitation = {
  id: string
  email: string
  role: Role
  companyIds: string[]
  areaIds: RequestArea[]
  token: string
  invitedBy: string
  created: string
  expires: string
  accepted: boolean
}

export type AuditLog = {
  id: string
  user: string
  action: AuditAction
  resource: string
  before: string
  after: string
  created: string
}

export type EmailLogKind = 'invite' | 'expense_created' | 'expense_status'

export type EmailLogStatus = 'sent' | 'failed'

export type EmailLog = {
  id: string
  kind: EmailLogKind
  expenseId: string | null
  invitationId: string | null
  toEmail: string
  toName: string
  toRole: Role | null
  subject: string
  status: EmailLogStatus
  error: string
  resendId: string | null
  created: string
}

export type Database = {
  revision: number
  companies: Company[]
  categories: Category[]
  users: User[]
  invitations: Invitation[]
  expenses: Expense[]
  auditLogs: AuditLog[]
  emailLogs: EmailLog[]
}

export type FlowPerson = {
  id: string
  name: string
  email: string
}

export type FlowBootstrap = {
  companies: Company[]
  categories: Category[]
  expenses: Expense[]
  user: User
  people: FlowPerson[]
  users: User[]
}

export function assertNever(value: never): never {
  throw new Error(`Unhandled value: ${String(value)}`)
}
