"use client";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ArrowLeft,
  BarChart3,
  Bell,
  ChevronDown,
  ClipboardCheck,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Shield,
  Users,
  Wallet,
  Wrench,
  ShoppingCart,
  HeartHandshake,
  X,
} from "lucide-react";
import { ROLE_LABEL, STATUS_LABEL, cls, initials } from "@/lib/flow/format";
import type { Company, Expense, Role, Screen, User } from "@/lib/flow/types";
import { assertNever } from "@/lib/flow/types";
import { canAccessArea, canManageUsers, isAdminInbox } from "@/lib/flow/workflow";

type NavItem = {
  label: string;
  icon: LucideIcon;
  screen: Screen;
  primary?: boolean;
};

export function navItemsFor(user: User): NavItem[] {
  if (user.role === "solicitante") {
    const items: NavItem[] = [];
    if (canAccessArea(user, "financeiro")) {
      items.push({ label: "Solicitação financeiro", icon: Plus, screen: "new-financeiro", primary: true });
    }
    if (canAccessArea(user, "manutencao")) {
      items.push({ label: "Solicitação manutenção", icon: Wrench, screen: "new-manutencao" });
    }
    if (canAccessArea(user, "compras")) {
      items.push({ label: "Solicitação compras", icon: ShoppingCart, screen: "new-compras" });
    }
    if (canAccessArea(user, "rh")) {
      items.push({ label: "Solicitação RH", icon: HeartHandshake, screen: "new-rh" });
    }
    items.push({ label: "Minhas Solicitações", icon: FileText, screen: "expenses" });
    return items;
  }

  const items: NavItem[] = [{ label: "Visão geral", icon: LayoutDashboard, screen: "dashboard" }];
  if (canAccessArea(user, "financeiro")) {
    items.push({ label: "Solicitação financeiro", icon: Plus, screen: "new-financeiro" });
  }
  if (canAccessArea(user, "manutencao")) {
    items.push({ label: "Solicitação manutenção", icon: Wrench, screen: "new-manutencao" });
  }
  if (canAccessArea(user, "compras")) {
    items.push({ label: "Solicitação compras", icon: ShoppingCart, screen: "new-compras" });
  }
  if (canAccessArea(user, "rh")) {
    items.push({ label: "Solicitação RH", icon: HeartHandshake, screen: "new-rh" });
  }
  items.push({ label: "Minhas Solicitações", icon: FileText, screen: "my-expenses" });
  items.push({ label: "Central de aprovação", icon: ClipboardCheck, screen: "approvals" });
  if (
    canAccessArea(user, "financeiro") ||
    canAccessArea(user, "manutencao") ||
    canAccessArea(user, "compras") ||
    canAccessArea(user, "rh")
  ) {
    items.push({ label: "Pagamentos", icon: Wallet, screen: "payments" });
  }
  items.push({ label: "Todas Solicitações", icon: FileText, screen: "expenses" });
  items.push({ label: "Relatórios", icon: BarChart3, screen: "reports" });
  if (canManageUsers(user.role)) {
    items.push({ label: "Gestão de usuários", icon: Users, screen: "users" });
    items.push({ label: "Log de auditoria", icon: Shield, screen: "audit" });
    items.push({ label: "Configurações", icon: Settings, screen: "settings" });
  }
  return items;
}

function shortNavLabel(item: NavItem): string {
  switch (item.screen) {
    case "dashboard":
      return "Início";
    case "new-financeiro":
      return "Financeiro";
    case "new-manutencao":
      return "Manutenção";
    case "new-compras":
      return "Compras";
    case "new-rh":
      return "RH";
    case "my-expenses":
      return "Minhas";
    case "expenses":
      return item.label.startsWith("Minhas") ? "Minhas" : "Lista";
    case "approvals":
      return "Aprovar";
    case "payments":
      return "Pagar";
    case "reports":
      return "Relatórios";
    case "users":
      return "Usuários";
    case "audit":
      return "Auditoria";
    case "settings":
      return "Ajustes";
    default: {
      const unexpected: never = item.screen;
      return unexpected;
    }
  }
}

function bottomNavItems(user: User): NavItem[] {
  const all = navItemsFor(user);
  if (user.role === "solicitante") {
    const create = all.filter((item) => item.screen.startsWith("new-"));
    const mine = all.find((item) => item.screen === "expenses");
    return [...create.slice(0, 3), ...(mine ? [mine] : [])].slice(0, 4);
  }
  const preferred: Screen[] = ["dashboard", "approvals", "payments", "my-expenses"];
  const picked: NavItem[] = [];
  for (const screen of preferred) {
    const item = all.find((entry) => entry.screen === screen);
    if (item) {
      picked.push(item);
    }
  }
  return picked.slice(0, 4);
}

const TITLES: Record<Screen, string> = {
  dashboard: "Visão geral",
  expenses: "Todas as solicitações",
  "my-expenses": "Minhas solicitações",
  "new-financeiro": "Solicitação financeiro",
  "new-manutencao": "Solicitação manutenção",
  "new-compras": "Solicitação compras",
  "new-rh": "Solicitação RH",
  approvals: "Central de aprovação",
  payments: "Pagamentos",
  reports: "Relatórios",
  users: "Gestão de usuários",
  audit: "Log de auditoria",
  settings: "Configurações",
};

export function canAccessScreen(user: User, screen: Screen): boolean {
  return navItemsFor(user).some((item) => item.screen === screen);
}

export function AppShell({
  role,
  company,
  user,
  expenses,
  screen,
  search,
  onSearch,
  onNavigate,
  onSwitchCompany,
  onLogout,
  onBack,
  onReload,
  reloading = false,
  notificationsOpen,
  profileOpen,
  menuOpen,
  onToggleNotifications,
  onToggleProfile,
  onToggleMenu,
  children,
}: {
  role: Role;
  company: Company;
  user: User;
  expenses: Expense[];
  screen: Screen;
  search: string;
  onSearch: (value: string) => void;
  onNavigate: (screen: Screen) => void;
  onSwitchCompany: () => void;
  onLogout: () => void;
  onBack: () => void;
  onReload: () => void;
  reloading?: boolean;
  notificationsOpen: boolean;
  profileOpen: boolean;
  menuOpen: boolean;
  onToggleNotifications: () => void;
  onToggleProfile: () => void;
  onToggleMenu: () => void;
  children: ReactNode;
}) {
  const items = navItemsFor(user);
  const tabs = bottomNavItems(user);
  const recent = expenses.slice(0, 4);
  const pendingCount = expenses.filter((item) => isAdminInbox(item)).length;

  function titleFor(current: Screen): string {
    switch (current) {
      case "dashboard":
      case "expenses":
      case "my-expenses":
      case "new-financeiro":
      case "new-manutencao":
      case "new-compras":
      case "new-rh":
      case "approvals":
      case "payments":
      case "reports":
      case "users":
      case "audit":
      case "settings":
        return TITLES[current];
      default:
        return assertNever(current);
    }
  }

  return (
    <div className="app-shell">
      {menuOpen ? (
        <button className="mobile-overlay" aria-label="Fechar menu" onClick={onToggleMenu} />
      ) : null}
      <aside className={cls("sidebar", menuOpen && "sidebar-open")}>
        <div className="brand-row">
          <div className="brand-mark">R</div>
          <div>
            <strong>ROM FLOW</strong>
            <span>Gestão de solicitações</span>
          </div>
          <button className="icon-button sidebar-close" onClick={onToggleMenu} aria-label="Fechar menu">
            <X size={18} />
          </button>
        </div>
        <button className="company-chip" onClick={onSwitchCompany}>
          <span className="company-mini" style={{ background: company.color }}>
            {company.initials}
          </span>
          <span>
            <small>Empresa ativa</small>
            <strong>{company.name}</strong>
          </span>
          <ChevronDown size={15} />
        </button>
        <nav className="side-nav" aria-label="Navegação principal">
          <small>AÇÕES</small>
          {items.map((item) => {
            const Icon = item.icon;
            const active = screen === item.screen;
            return (
              <button
                key={item.screen + item.label}
                className={cls("nav-item", active && "active", item.primary && "nav-item-highlight")}
                onClick={() => onNavigate(item.screen)}
              >
                <Icon size={16} />
                {item.label}
                {item.screen === "approvals" && pendingCount > 0 ? <em>{pendingCount}</em> : null}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-security">
          <Shield size={16} />
          <div>
            <strong>Ambiente protegido</strong>
            <span>Governança e auditoria ativas</span>
          </div>
        </div>
        <div className="sidebar-user">
          <div className="avatar-fallback">{initials(user.name)}</div>
          <div>
            <strong>{user.name}</strong>
            <small>{ROLE_LABEL[role]}</small>
          </div>
        </div>
      </aside>
      <div className="main-area">
        <header className="top-header">
          <div className="header-title">
            <button className="icon-button mobile-menu" onClick={onToggleMenu} aria-label="Abrir menu">
              <Menu size={18} />
            </button>
            <button className="icon-button" onClick={onBack} aria-label="Voltar">
              <ArrowLeft size={18} />
            </button>
            <div>
              <span>ROM Flow</span>
              <h1>{titleFor(screen)}</h1>
            </div>
          </div>
          <div className="global-search">
            <Search size={16} />
            <input
              value={search}
              onChange={(event) => onSearch(event.target.value)}
              placeholder="Buscar solicitações, beneficiários, categorias"
            />
            <kbd>⌘ K</kbd>
          </div>
          <div className="header-actions">
            <div className="popover-wrap">
              <button
                className="icon-button notification-button"
                onClick={onToggleNotifications}
                aria-label="Notificações"
              >
                <Bell size={16} />
                {recent.length > 0 ? <i /> : null}
              </button>
              {notificationsOpen ? (
                <div className="header-popover notification-popover">
                  <div className="popover-title">
                    <strong>Notificações</strong>
                    <span>Status atualizado recentemente</span>
                  </div>
                  {recent.length === 0 ? (
                    <p>Nenhuma notificação no momento.</p>
                  ) : (
                    recent.map((item) => (
                      <button key={item.id} type="button" onClick={() => onNavigate("expenses")}>
                        <span className="activity-dot" />
                        <span>
                          <strong>{item.title}</strong>
                          <small>{STATUS_LABEL[item.status]}</small>
                        </span>
                      </button>
                    ))
                  )}
                </div>
              ) : null}
            </div>
            <div className="popover-wrap">
              <button className="profile-button" onClick={onToggleProfile}>
                <div className="avatar-fallback">{initials(user.name)}</div>
                <span className="profile-copy">
                  <strong>{user.name}</strong>
                  <small>{ROLE_LABEL[role]}</small>
                </span>
                <ChevronDown size={14} />
              </button>
              {profileOpen ? (
                <div className="header-popover profile-popover">
                  <button type="button" onClick={onSwitchCompany}>
                    Trocar empresa
                  </button>
                  <button type="button" onClick={onLogout}>
                    <LogOut size={14} /> Sair
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </header>
        <div className="content-area">{children}</div>
      </div>
      <button
        className={cls("refresh-fab", reloading && "reloading")}
        type="button"
        onClick={onReload}
        disabled={reloading}
        aria-label="Atualizar"
      >
        <RefreshCw size={20} />
        <span>Atualizar</span>
      </button>
      <nav className="bottom-nav" aria-label="Navegação do aplicativo">
        {tabs.map((item) => {
          const Icon = item.icon;
          const active = screen === item.screen;
          return (
            <button
              key={item.screen}
              type="button"
              className={cls(active && "active")}
              onClick={() => onNavigate(item.screen)}
            >
              <Icon size={20} />
              {shortNavLabel(item)}
              {item.screen === "approvals" && pendingCount > 0 ? <em>{pendingCount}</em> : null}
            </button>
          );
        })}
        <button type="button" className={cls(menuOpen && "active")} onClick={onToggleMenu}>
          <Menu size={20} />
          Menu
        </button>
      </nav>
    </div>
  );
}
