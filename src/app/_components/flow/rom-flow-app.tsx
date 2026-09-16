'use client'

import { useCallback, useEffect, useState } from 'react'
import { AppShell, canAccessScreen } from '@/app/_components/flow/app-shell'
import { AuditPage } from '@/app/_components/flow/audit-page'
import { CompanySelect } from '@/app/_components/flow/company-select'
import { Dashboard } from '@/app/_components/flow/dashboard'
import { ExpenseDrawer } from '@/app/_components/flow/expense-drawer'
import { ExpenseForm } from '@/app/_components/flow/expense-form'
import { TicketForm } from '@/app/_components/flow/ticket-form'
import { ExpenseList } from '@/app/_components/flow/expense-list'
import { FinancePage } from '@/app/_components/flow/finance-page'
import { ReportsPage } from '@/app/_components/flow/reports-page'
import { SettingsPage } from '@/app/_components/flow/settings-page'
import { UsersPage } from '@/app/_components/flow/users-page'
import { KINDNESS_PHRASES } from '@/lib/flow/format'
import { useStore } from '@/app/_components/flow/flow-client-store'
import type { Expense, RequestArea, Screen } from '@/lib/flow/types'
import { assertNever } from '@/lib/flow/types'
import { homeScreen } from '@/lib/flow/workflow'

export function RomFlowApp() {
  const store = useStore()
  const [screen, setScreen] = useState<Screen>('dashboard')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Expense | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [reloading, setReloading] = useState(false)
  const [viewEpoch, setViewEpoch] = useState(0)

  const greeting = KINDNESS_PHRASES[new Date().getDate() % KINDNESS_PHRASES.length]
  const accessibleCompanies = store.accessibleCompanies()
  const onlyCompanyId = accessibleCompanies.length === 1 ? accessibleCompanies[0].id : null
  const expenses = store.companyExpenses()
  const myExpenses = expenses.filter((item) => item.requester === store.user?.id)

  const selectCompany = store.selectCompany
  const switchCompany = store.switchCompany
  const currentCompanyId = store.company?.id ?? null

  useEffect(() => {
    if (!store.user || currentCompanyId || !onlyCompanyId) return
    selectCompany(onlyCompanyId)
  }, [currentCompanyId, onlyCompanyId, selectCompany, store.user])

  useEffect(() => {
    if (!currentCompanyId) return
    if (!accessibleCompanies.some((item) => item.id === currentCompanyId)) {
      switchCompany()
    }
  }, [accessibleCompanies, currentCompanyId, switchCompany])

  const closePopovers = useCallback(() => {
    setNotificationsOpen(false)
    setProfileOpen(false)
    setMenuOpen(false)
  }, [])

  const navigate = useCallback(
    (next: Screen) => {
      if (store.user && !canAccessScreen(store.user, next)) return
      setScreen(next)
      closePopovers()
    },
    [closePopovers, store.user],
  )

  if (!store.ready) {
    return (
      <div className="login-page">
        <section className="login-form-wrap">
          <div className="login-form">
            <span className="secure-label">ROM FLOW</span>
            <h2>Carregando o fluxo...</h2>
          </div>
        </section>
      </div>
    )
  }

  if (!store.user) {
    return (
      <div className="login-page">
        <section className="login-form-wrap">
          <div className="login-form">
            <span className="secure-label">ROM FLOW</span>
            <h2>Entre na intranet para abrir o Flow.</h2>
          </div>
        </section>
      </div>
    )
  }

  if (!store.company) {
    if (onlyCompanyId) {
      return (
        <div className="login-page">
          <section className="login-form-wrap">
            <div className="login-form">
              <span className="secure-label">ROM FLOW</span>
              <h2>Abrindo sua empresa...</h2>
            </div>
          </section>
        </div>
      )
    }
    return (
      <CompanySelect
        user={store.user}
        companies={accessibleCompanies}
        expenses={store.db.expenses}
        onSelect={(id) => {
          store.selectCompany(id)
          setScreen(homeScreen(store.user?.role ?? 'solicitante'))
        }}
        onLogout={store.logout}
      />
    )
  }

  const companyNames = Object.fromEntries(store.db.companies.map((item) => [item.id, item.name]))
  const visibleScreen = store.user && canAccessScreen(store.user, screen) ? screen : homeScreen(store.user.role)

  function renderScreen(current: Screen) {
    const role = store.user!.role
    const resolved = canAccessScreen(store.user!, current) ? current : homeScreen(role)
    switch (resolved) {
      case 'dashboard':
        return (
          <Dashboard
            role={store.user!.role}
            company={store.company!}
            user={store.user!}
            expenses={expenses}
            categories={store.db.categories}
            onNavigate={navigate}
            onOpenExpense={setSelected}
          />
        )
      case 'expenses':
        return (
          <ExpenseList
            expenses={store.user!.role === 'solicitante' ? myExpenses : expenses}
            search={search}
            title={store.user!.role === 'solicitante' ? 'Minhas solicitações' : 'Todas as solicitações'}
            subtitle={
              store.user!.role === 'solicitante'
                ? 'Manutenção: mude o status aqui — em andamento, finalizado ou cancelado.'
                : 'Visão completa das solicitações desta empresa.'
            }
            eyebrow={store.user!.role === 'solicitante' ? 'MEU FLUXO' : 'TODAS AS OPERAÇÕES'}
            companyNames={companyNames}
            user={store.user!}
            onSearch={setSearch}
            onNavigate={navigate}
            onOpen={setSelected}
            onAction={(expense, action) => store.applyFinanceAction(expense.id, action)}
          />
        )
      case 'my-expenses':
        return (
          <ExpenseList
            expenses={myExpenses}
            search={search}
            companyNames={companyNames}
            user={store.user!}
            onSearch={setSearch}
            onNavigate={navigate}
            onOpen={setSelected}
            onAction={(expense, action) => store.applyFinanceAction(expense.id, action)}
          />
        )
      case 'new-financeiro':
      case 'new-manutencao':
      case 'new-compras':
      case 'new-rh': {
        const area: RequestArea =
          resolved === 'new-financeiro'
            ? 'financeiro'
            : resolved === 'new-manutencao'
              ? 'manutencao'
              : resolved === 'new-compras'
                ? 'compras'
                : 'rh'
        const back = store.user!.role === 'solicitante' ? 'expenses' : 'my-expenses'
        if (area === 'financeiro') {
          return (
            <ExpenseForm
              company={store.company!}
              user={store.user!}
              categories={store.db.categories}
              greetingPhrase={greeting}
              onCancel={() => navigate(back)}
              onCreated={async (input) => {
                await store.createExpense(input)
                navigate(back)
              }}
            />
          )
        }
        return (
          <TicketForm
            area={area}
            company={store.company!}
            user={store.user!}
            onCancel={() => navigate(back)}
            onCreated={async (input) => {
              await store.createExpense(input)
              navigate(back)
            }}
          />
        )
      }
      case 'approvals':
        return (
          <FinancePage mode="approvals" expenses={expenses} users={store.db.users} onOpen={setSelected} />
        )
      case 'payments':
        return (
          <FinancePage mode="payments" expenses={expenses} users={store.db.users} onOpen={setSelected} />
        )
      case 'reports':
        return <ReportsPage expenses={expenses} categories={store.db.categories} />
      case 'users':
        return (
          <UsersPage
            users={store.db.users}
            invitations={store.db.invitations}
            companies={store.db.companies}
            currentUserId={store.user!.id}
            onInvite={store.inviteUser}
            onUpdateUser={store.updateUserAccess}
            onUpdateInvitation={store.updateInvitationAccess}
            onToggle={async (userId) => {
              await store.toggleUserStatus(userId)
            }}
            onRevoke={store.revokeUserAccess}
            onCancelInvite={store.cancelInvitation}
          />
        )
      case 'audit':
        return <AuditPage logs={store.db.auditLogs} emailLogs={store.db.emailLogs} users={store.db.users} />
      case 'settings':
        return (
          <SettingsPage
            companies={store.db.companies}
            categories={store.db.categories}
            onCreateCompany={store.createCompany}
            onCreateCategory={store.createCategory}
            onToggleCategory={(id, is_active) => store.updateCategory(id, { is_active })}
          />
        )
      default:
        return assertNever(resolved)
    }
  }

  return (
    <>
      <AppShell
        role={store.user.role}
        company={store.company}
        user={store.user}
        expenses={store.user.role === 'solicitante' ? myExpenses : expenses}
        screen={visibleScreen}
        search={search}
        onSearch={setSearch}
        onNavigate={navigate}
        onSwitchCompany={() => {
          closePopovers()
          store.switchCompany()
        }}
        onBack={() => {
          closePopovers()
          const home = homeScreen(store.user!.role)
          if (visibleScreen !== home) {
            navigate(home)
            return
          }
          store.switchCompany()
        }}
        onReload={() => {
          if (reloading) return
          closePopovers()
          setSelected(null)
          setReloading(true)
          void store
            .reload()
            .then(() => {
              setViewEpoch((value) => value + 1)
            })
            .finally(() => {
              setReloading(false)
            })
        }}
        reloading={reloading}
        onLogout={store.logout}
        notificationsOpen={notificationsOpen}
        profileOpen={profileOpen}
        menuOpen={menuOpen}
        onToggleNotifications={() => {
          setProfileOpen(false)
          setNotificationsOpen((value) => !value)
        }}
        onToggleProfile={() => {
          setNotificationsOpen(false)
          setProfileOpen((value) => !value)
        }}
        onToggleMenu={() => setMenuOpen((value) => !value)}
      >
        <div key={viewEpoch} className="screen-refresh-root">
          {renderScreen(visibleScreen)}
        </div>
      </AppShell>
      {selected && (store.user.role !== 'solicitante' || selected.requester === store.user.id) ? (
        <ExpenseDrawer
          expense={store.db.expenses.find((item) => item.id === selected.id) ?? selected}
          requester={store.findUser(selected.requester)}
          companyName={store.findCompany(selected.company)?.name ?? store.company.name}
          user={store.user}
          onClose={() => setSelected(null)}
          onAction={async (action, payload) => {
            await store.applyFinanceAction(selected.id, action, payload)
          }}
        />
      ) : null}
    </>
  )
}
