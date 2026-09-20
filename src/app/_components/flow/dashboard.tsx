"use client";

import { ArrowUpRight, CheckCircle2, ClipboardCheck, LayoutDashboard, Plus, Sparkles, Wallet } from "lucide-react";
import { useState } from "react";
import { CATEGORY_COLOR, KINDNESS_PHRASES, money } from "@/lib/flow/format";
import type { Category, Company, Expense, Role, Screen, User } from "@/lib/flow/types";
import { newRequestScreen } from "@/lib/flow/workflow";
import { StatusBadge } from "./status-badge";

const MONTH_LABELS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function lastSixMonthBuckets(now: number): { label: string; start: number; end: number }[] {
  const date = new Date(now);
  const buckets: { label: string; start: number; end: number }[] = [];
  for (let offset = 5; offset >= 0; offset -= 1) {
    const startDate = new Date(date.getFullYear(), date.getMonth() - offset, 1);
    const endDate = new Date(date.getFullYear(), date.getMonth() - offset + 1, 1);
    buckets.push({
      label: MONTH_LABELS[startDate.getMonth()],
      start: startDate.getTime(),
      end: endDate.getTime(),
    });
  }
  return buckets;
}

function chartLine(values: number[], max: number): string {
  return values
    .map((value, index) => {
      const x = values.length === 1 ? 0 : (index / (values.length - 1)) * 500;
      const y = max === 0 ? 160 : 160 - (value / max) * 132;
      return `${index === 0 ? "M" : "L"}${x} ${y}`;
    })
    .join(" ");
}

export function Dashboard({
  role,
  company,
  user,
  expenses,
  categories,
  onNavigate,
  onOpenExpense,
}: {
  role: Role;
  company: Company;
  user: User;
  expenses: Expense[];
  categories: Category[];
  onNavigate: (screen: Screen) => void;
  onOpenExpense: (expense: Expense) => void;
}) {
  const [now] = useState(() => Date.now());
  const isEmpty = expenses.length === 0;
  const createScreen = newRequestScreen(user);
  const paid = expenses.filter((item) => Boolean(item.payment_proof) || item.status === "finalizada");
  const pending = expenses.filter(
    (item) =>
      item.status !== "recusada" &&
      item.status !== "cancelada" &&
      item.status !== "finalizada" &&
      !item.payment_proof,
  );
  const total = expenses.reduce((sum, item) => sum + item.amount, 0);
  const paidTotal = paid.reduce((sum, item) => sum + item.amount, 0);
  const pendingTotal = pending.reduce((sum, item) => sum + item.amount, 0);
  const lastReimburse = expenses.find(
    (item) => item.expense_type === "reembolso_colaborador" || item.expense_type === "reembolso_cliente",
  );
  const greeting = KINDNESS_PHRASES[new Date(now).getDate() % KINDNESS_PHRASES.length];
  const categoryStats = (categories.length
    ? categories.map((item) => ({ category: item.name, color: item.color }))
    : Object.entries(CATEGORY_COLOR).map(([category, color]) => ({ category, color }))
  ).map((item) => ({
    ...item,
    value: expenses.filter((expense) => expense.category === item.category).reduce((sum, expense) => sum + expense.amount, 0),
  }));
  const maxCategory = Math.max(...categoryStats.map((item) => item.value), 1);

  const kpis =
    role === "solicitante"
      ? [
          {
            label: "Minhas solicitações",
            value: String(expenses.length),
            foot: `${pending.length} em aberto`,
            icon: LayoutDashboard,
            trend: "Seu fluxo",
            tone: "violet",
          },
          {
            label: "Volume",
            value: money(total),
            foot: `${expenses.length} registros`,
            icon: Wallet,
            trend: "No período",
            tone: "emerald",
          },
          {
            label: "Último reembolso",
            value: lastReimburse ? money(lastReimburse.amount) : "—",
            foot: lastReimburse ? lastReimburse.title : "Nenhum reembolso",
            icon: CheckCircle2,
            trend: "Financeiro",
            tone: "amber",
          },
        ]
      : [
          {
            label: "Aguardando ação",
            value: String(pending.length),
            foot: money(pendingTotal),
            icon: ClipboardCheck,
            trend: "Fila da sua área",
            tone: "violet",
          },
          {
            label: "Volume",
            value: money(total),
            foot: `${expenses.length} solicitações`,
            icon: LayoutDashboard,
            trend: "No período",
            tone: "emerald",
          },
          {
            label: "Com recibo",
            value: String(paid.length),
            foot: money(paidTotal),
            icon: Wallet,
            trend: "Pagamentos anexados",
            tone: "amber",
          },
        ];

  const monthBuckets = lastSixMonthBuckets(now);
  const monthValues = monthBuckets.map((bucket) =>
    expenses
      .filter((item) => {
        const created = new Date(item.created).getTime();
        return created >= bucket.start && created < bucket.end;
      })
      .reduce((sum, item) => sum + item.amount, 0),
  );
  const maxMonth = Math.max(...monthValues, 0);
  const previousMonth = monthValues[monthValues.length - 2] ?? 0;
  const currentMonth = monthValues[monthValues.length - 1] ?? 0;
  const monthTrend =
    isEmpty || previousMonth <= 0
      ? "—"
      : `${currentMonth >= previousMonth ? "+" : ""}${(((currentMonth - previousMonth) / previousMonth) * 100).toFixed(1).replace(".", ",")}%`;
  const linePath = chartLine(monthValues, maxMonth);

  return (
    <div className="page-stack">
      <section className="kindness-banner fade-in">
        <div className="kindness-content">
          <span className="kindness-icon-pulse">
            <Sparkles size={16} />
          </span>
          <div className="kindness-text">
            <strong>{greeting}</strong>
            <span>
              {user.name ? `Olá, ${user.name.split(" ")[0]}! ` : ""}
              Estamos aqui para agilizar suas solicitações.
            </span>
          </div>
        </div>
        <div className="kindness-tag">
          <Sparkles size={13} /> ROM Flow Care
        </div>
      </section>
      <section className="welcome-row">
        <div>
          <span className="eyebrow">
            <Sparkles size={14} /> VISÃO CONSOLIDADA
          </span>
          <h2>
            O fluxo da <span>{company.name}</span>
          </h2>
          <p>Acompanhe o que pede sua atenção nesta empresa.</p>
        </div>
        {role === "solicitante" ? (
          <button className="primary-button" onClick={() => onNavigate(createScreen)}>
            <Plus size={18} /> Nova solicitação
          </button>
        ) : (
          <div className="dashboard-header-actions">
            <button className="secondary-button" onClick={() => onNavigate("approvals")}>
              <ClipboardCheck size={17} /> Fila de aprovação
            </button>
            <button className="primary-button" onClick={() => onNavigate(createScreen)}>
              <Plus size={18} /> Nova solicitação
            </button>
          </div>
        )}
      </section>
      <section className="kpi-grid">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <article className={`kpi-card kpi-${kpi.tone}`} key={kpi.label}>
              <div className="kpi-head">
                <span>{kpi.label}</span>
                <i>
                  <Icon size={19} />
                </i>
              </div>
              <strong>{kpi.value}</strong>
              <div className="kpi-foot">
                <span>{kpi.foot}</span>
                <em>
                  <ArrowUpRight size={13} /> {kpi.trend}
                </em>
              </div>
            </article>
          );
        })}
      </section>
      <section className="dashboard-grid">
        <article className="panel chart-panel">
          <header className="panel-header">
            <div>
              <h3>Volume por categoria</h3>
              <p>Distribuição no período</p>
            </div>
          </header>
          {isEmpty ? (
            <div className="empty-state">
              <strong>Nenhuma solicitação neste negócio.</strong>
              <span>As categorias aparecem quando houver solicitações.</span>
            </div>
          ) : (
            <div className="bar-chart">
              {categoryStats.map((item) => (
                <div key={item.category}>
                  <span className="bar-value">{item.value ? money(item.value) : "—"}</span>
                  <span className="bar-track">
                    <i
                      style={{
                        height: `${item.value === 0 ? 0 : Math.max((item.value / maxCategory) * 100, 4)}%`,
                        background: item.color,
                      }}
                    />
                  </span>
                  <strong>{item.category}</strong>
                </div>
              ))}
            </div>
          )}
        </article>
        <article className="panel trend-panel">
          <header className="panel-header">
            <div>
              <h3>Tendência</h3>
              <p>Últimos 6 meses</p>
            </div>
            <span className={previousMonth > 0 && currentMonth >= previousMonth ? "positive-trend" : undefined}>
              {monthTrend}
            </span>
          </header>
          {isEmpty ? (
            <div className="empty-state">
              <strong>Sem tendência ainda.</strong>
              <span>O gráfico dos últimos 6 meses aparece com as primeiras solicitações.</span>
            </div>
          ) : (
            <div className="line-chart">
              <div className="line-grid" />
              <svg viewBox="0 0 500 180" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="area" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10B981" stopOpacity=".28" />
                    <stop offset="100%" stopColor="#10B981" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path d={`${linePath} L500 180 L0 180 Z`} fill="url(#area)" />
                <path d={linePath} fill="none" stroke="#10B981" strokeWidth="4" />
              </svg>
              <div className="chart-labels">
                {monthBuckets.map((item) => (
                  <span key={item.start}>{item.label}</span>
                ))}
              </div>
            </div>
          )}
        </article>
        <article className="panel activity-panel">
          <header className="panel-header">
            <div>
              <h3>Atividade recente</h3>
              <p>Atualizações do seu fluxo</p>
            </div>
          </header>
          {expenses.length === 0 ? (
            <div className="empty-state">
              <strong>Seu fluxo ainda não possui movimentações.</strong>
              <span>Crie a primeira solicitação para começar.</span>
            </div>
          ) : (
            <div className="activity-list">
              {expenses.slice(0, 6).map((item) => (
                <button key={item.id} type="button" onClick={() => onOpenExpense(item)}>
                  <span className="activity-avatar">
                    {item.title.slice(0, 2).toUpperCase()}
                  </span>
                  <span>
                    <strong>{item.title}</strong>
                    <small>{item.category}</small>
                  </span>
                  <em>{money(item.amount)}</em>
                  <StatusBadge status={item.status} />
                </button>
              ))}
            </div>
          )}
        </article>
      </section>
    </div>
  );
}
