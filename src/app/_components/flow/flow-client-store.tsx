'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type {
  AuditAction,
  AuditLog,
  Category,
  Company,
  Database,
  Expense,
  FinanceAction,
  FinanceActionPayload,
  FlowBootstrap,
  Invitation,
  RequestArea,
  Role,
  User,
} from '@/lib/flow/types'
import { canManageUsers } from '@/lib/flow/workflow'

const COMPANY_KEY = 'rom-flow-company'

const EMPTY_DB: Database = {
  revision: 1,
  companies: [],
  categories: [],
  users: [],
  invitations: [],
  expenses: [],
  auditLogs: [],
  emailLogs: [],
}

function mapAuditAction(action: string): AuditAction {
  const normalized = action.toUpperCase()
  switch (normalized) {
    case 'CREATE_EXPENSE':
    case 'CREATE':
      return 'CREATE_EXPENSE'
    case 'DOCS':
    case 'REQUEST_DOCUMENTATION':
      return 'REQUEST_DOCUMENTATION'
    case 'APPROVE':
    case 'APPROVE_EXPENSE':
      return 'APPROVE_EXPENSE'
    case 'REJECT':
    case 'REJECT_EXPENSE':
      return 'REJECT_EXPENSE'
    case 'UPDATE_EXPENSE':
    case 'RESUBMIT':
      return 'UPDATE_EXPENSE'
    case 'DELETE_EXPENSE':
      return 'DELETE_EXPENSE'
    case 'UPDATE_USER':
      return 'UPDATE_USER'
    case 'REVOKE_USER':
      return 'REVOKE_USER'
    case 'ATTACH_PROOF':
      return 'ATTACH_PROOF'
    case 'PROGRESS':
    case 'PROGRESS_EXPENSE':
      return 'PROGRESS_EXPENSE'
    case 'COMPLETE':
    case 'COMPLETE_EXPENSE':
      return 'COMPLETE_EXPENSE'
    case 'CANCEL':
    case 'CANCEL_EXPENSE':
      return 'CANCEL_EXPENSE'
    default:
      return 'UPDATE_EXPENSE'
  }
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const method = (init?.method ?? 'GET').toUpperCase()
  const url = method === 'GET' ? `${path}${path.includes('?') ? '&' : '?'}_ts=${Date.now()}` : path
  const res = await fetch(url, {
    ...init,
    method,
    cache: 'no-store',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  const body = (await res.json().catch(() => ({}))) as { data?: T; error?: string }
  if (!res.ok) {
    throw new Error(body.error || 'Não foi possível concluir a operação.')
  }
  return (body.data ?? body) as T
}

type StoreValue = {
  ready: boolean
  db: Database
  user: User | null
  company: Company | null
  logout: () => Promise<void>
  selectCompany: (id: string) => void
  switchCompany: () => void
  reload: () => Promise<void>
  accessibleCompanies: () => Company[]
  companyExpenses: (companyId?: string) => Expense[]
  createExpense: (expense: Omit<Expense, 'id' | 'created' | 'updated'>) => Promise<Expense>
  applyFinanceAction: (expenseId: string, action: FinanceAction, payload?: FinanceActionPayload) => Promise<void>
  inviteUser: (
    email: string,
    role: Role,
    companyIds: string[],
    areaIds: string[],
  ) => Promise<Invitation & { emailSent: boolean; emailError?: string }>
  toggleUserStatus: (userId: string) => Promise<void>
  revokeUserAccess: (userId: string) => Promise<void>
  cancelInvitation: (invitationId: string) => Promise<void>
  updateUserAccess: (userId: string, role: Role, companyIds: string[], areaIds: RequestArea[]) => Promise<void>
  updateInvitationAccess: (
    invitationId: string,
    role: Role,
    companyIds: string[],
    areaIds: RequestArea[],
  ) => Promise<void>
  createCompany: (input: { name: string; color: string }) => Promise<void>
  createCategory: (input: { name: string; color: string }) => Promise<void>
  updateCategory: (id: string, patch: Partial<Category>) => Promise<void>
  findUser: (id: string) => User | undefined
  findCompany: (id: string) => Company | undefined
}

const StoreContext = createContext<StoreValue | null>(null)

export function FlowClientStoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [db, setDb] = useState<Database>(EMPTY_DB)
  const [user, setUser] = useState<User | null>(null)
  const [companyId, setCompanyId] = useState<string | null>(null)

  const reload = useCallback(async () => {
    const boot = await api<FlowBootstrap>('/api/flow')
    let auditLogs: AuditLog[] = []
    if (canManageUsers(boot.user.role)) {
      try {
        const audit = await api<{ logs: Array<{ id: string; username: string; action: string; resource: string; created_at: string }> }>(
          '/api/flow/audit',
        )
        auditLogs = (audit.logs ?? []).map((item) => ({
          id: item.id,
          user: item.username,
          action: mapAuditAction(item.action),
          resource: item.resource,
          before: '',
          after: '',
          created: item.created_at,
        }))
      } catch {
        auditLogs = []
      }
    }
    setUser(boot.user)
    setDb({
      revision: 1,
      companies: boot.companies,
      categories: boot.categories,
      users: boot.users?.length ? boot.users : [boot.user],
      invitations: [],
      expenses: boot.expenses,
      auditLogs,
      emailLogs: [],
    })
    setCompanyId((current) => {
      const stored = typeof window !== 'undefined' ? window.localStorage.getItem(COMPANY_KEY) : null
      const allowed = new Set(boot.user.companyIds)
      const fromStore = boot.companies.filter((item) => allowed.has(item.id) || boot.user.role === 'master')
      const pool = fromStore.length ? fromStore : boot.companies
      if (current && pool.some((item) => item.id === current)) return current
      if (stored && pool.some((item) => item.id === stored)) return stored
      return pool.length === 1 ? pool[0].id : null
    })
    setReady(true)
  }, [])

  useEffect(() => {
    void reload().catch(() => setReady(true))
  }, [reload])

  const accessibleCompanies = useCallback(() => {
    if (!user) return []
    if (user.role === 'master') return db.companies.filter((item) => item.is_active)
    const allowed = new Set(user.companyIds)
    return db.companies.filter((item) => item.is_active && allowed.has(item.id))
  }, [db.companies, user])

  const company = useMemo(
    () => db.companies.find((item) => item.id === companyId) ?? null,
    [companyId, db.companies],
  )

  const selectCompany = useCallback((id: string) => {
    setCompanyId(id)
    window.localStorage.setItem(COMPANY_KEY, id)
  }, [])

  const switchCompany = useCallback(() => {
    setCompanyId(null)
    window.localStorage.removeItem(COMPANY_KEY)
  }, [])

  const companyExpenses = useCallback(
    (id?: string) => {
      const target = id ?? companyId
      if (!target) return []
      return db.expenses.filter((item) => item.company === target)
    },
    [companyId, db.expenses],
  )

  const createExpense = useCallback(
    async (expense: Omit<Expense, 'id' | 'created' | 'updated'>) => {
      const created = await api<{ expense: Expense }>('/api/flow', {
        method: 'POST',
        body: JSON.stringify(expense),
      })
      await reload()
      return created.expense
    },
    [reload],
  )

  const applyFinanceAction = useCallback(
    async (expenseId: string, action: FinanceAction, payload: FinanceActionPayload = {}) => {
      await api(`/api/flow/${expenseId}`, {
        method: 'POST',
        body: JSON.stringify({
          action,
          note: payload.note,
          proof: payload.proof ?? null,
          receipt: payload.receipt ?? null,
        }),
      })
      await reload()
    },
    [reload],
  )

  const inviteUser = useCallback(
    async (email: string, role: Role, companyIds: string[], areaIds: string[]) => {
      const password = `${crypto.randomUUID().replaceAll('-', '').slice(0, 10)}Aa1`
      await api('/api/employees', {
        method: 'POST',
        body: JSON.stringify({
          email,
          name: email.split('@')[0],
          password,
          flow_role: role,
          panel_role: role === 'master' ? 'admin' : 'staff',
          companyIds,
          areaIds,
        }),
      })
      await reload()
      const now = new Date().toISOString()
      return {
        id: crypto.randomUUID(),
        email,
        role,
        companyIds,
        areaIds: areaIds as RequestArea[],
        token: '',
        invitedBy: user?.id ?? '',
        created: now,
        expires: now,
        accepted: true,
        emailSent: false,
        emailError: `Acesso criado. Senha inicial: ${password}`,
      }
    },
    [reload, user],
  )

  const value = useMemo<StoreValue>(
    () => ({
      ready,
      db,
      user,
      company,
      logout: async () => {
        await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
        window.location.href = '/login?logged_out=1'
      },
      selectCompany,
      switchCompany,
      reload,
      accessibleCompanies,
      companyExpenses,
      createExpense,
      applyFinanceAction,
      inviteUser,
      toggleUserStatus: async (userId) => {
        await api('/api/flow/users/toggle', { method: 'POST', body: JSON.stringify({ userId }) })
        await reload()
      },
      revokeUserAccess: async (userId) => {
        await api('/api/flow/users/revoke', { method: 'POST', body: JSON.stringify({ userId }) })
        await reload()
      },
      cancelInvitation: async () => undefined,
      updateUserAccess: async (userId, role, companyIds, areaIds) => {
        await api('/api/flow/users', {
          method: 'PATCH',
          body: JSON.stringify({ userId, role, companyIds, areaIds }),
        })
        await reload()
      },
      updateInvitationAccess: async () => undefined,
      createCompany: async () => {
        throw new Error('As empresas desta intranet são as da unidade e não se cadastram aqui.')
      },
      createCategory: async (input) => {
        await api('/api/flow/categories', { method: 'POST', body: JSON.stringify(input) })
        await reload()
      },
      updateCategory: async (id, patch) => {
        await api('/api/flow/categories', { method: 'PATCH', body: JSON.stringify({ id, ...patch }) })
        await reload()
      },
      findUser: (id) => db.users.find((item) => item.id === id),
      findCompany: (id) => db.companies.find((item) => item.id === id),
    }),
    [
      accessibleCompanies,
      applyFinanceAction,
      company,
      companyExpenses,
      createExpense,
      db,
      inviteUser,
      ready,
      reload,
      selectCompany,
      switchCompany,
      user,
    ],
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore precisa do FlowClientStoreProvider')
  return ctx
}
