"use client";

import { BarChart3, CheckCircle2, PieChart, Wallet } from "lucide-react";
import { STATUS_LABEL, money } from "@/lib/flow/format";
import type { Category, Expense, ExpenseStatus } from "@/lib/flow/types";

const STATUS_ORDER: ExpenseStatus[] = [
  "em_analise",
  "devolvido",
  "aprovada",
  "recusada",
  "aberta",
  "em_andamento",
  "finalizada",
  "cancelada",
];

export function ReportsPage({
  expenses,
  categories: categoryOptions,
}: {
  expenses: Expense[];
  categories: Category[];
}) {
  const total = expenses.reduce((sum, item) => sum + item.amount, 0);
  const paid = expenses.filter((item) => Boolean(item.payment_proof));
  const paidTotal = paid.reduce((sum, item) => sum + item.amount, 0);
  const ticket = expenses.length ? total / expenses.length : 0;
  const categories = categoryOptions.map((item) => {
    const value = expenses
      .filter((expense) => expense.category === item.name)
      .reduce((sum, expense) => sum + expense.amount, 0);
    return { name: item.name, color: item.color, value, pct: total ? Math.round((value / total) * 100) : 0 };
  });
  const byStatus = STATUS_ORDER.map((status) => ({
    status,
    count: expenses.filter((item) => item.status === status).length,
  }));
  const paidPct = expenses.length ? Math.round((paid.length / expenses.length) * 100) : 0;
  const isEmpty = expenses.length === 0;

  return (
    <div className="page-stack">
      <section className="page-title-row">
        <div>
          <span className="eyebrow">INTELIGÊNCIA FINANCEIRA</span>
          <h2>Relatórios financeiros</h2>
          <p>Analise o volume, a execução e a distribuição das despesas.</p>
        </div>
      </section>
      <section className="report-kpis">
        <article>
          <Wallet size={18} />
          <span>
            <small>Volume solicitado</small>
            <strong>{money(total)}</strong>
          </span>
        </article>
        <article>
          <CheckCircle2 size={18} />
          <span>
            <small>Total realizado</small>
            <strong>{money(paidTotal)}</strong>
          </span>
        </article>
        <article>
          <BarChart3 size={18} />
          <span>
            <small>Ticket médio</small>
            <strong>{money(ticket)}</strong>
          </span>
        </article>
        <article>
          <PieChart size={18} />
          <span>
            <small>Solicitações</small>
            <strong>{expenses.length}</strong>
          </span>
        </article>
      </section>
      <section className="reports-grid">
        <article className="panel">
          <header className="panel-header">
            <div>
              <h3>Distribuição por categoria</h3>
              <p>Participação no valor total</p>
            </div>
          </header>
          {isEmpty ? (
            <div className="empty-state">
              <strong>Nenhuma despesa para distribuir.</strong>
              <span>Este relatório fica vazio até existir a primeira solicitação.</span>
            </div>
          ) : (
            <div className="report-category">
              {categories.map((item) => (
                <div key={item.name}>
                  <strong>{item.name}</strong>
                  <div className="report-progress">
                    <i style={{ width: `${item.pct}%`, background: item.color }} />
                  </div>
                  <strong>{money(item.value)}</strong>
                </div>
              ))}
            </div>
          )}
        </article>
        <article className="panel report-status">
          <header className="panel-header">
            <div>
              <h3>Saúde do fluxo</h3>
              <p>Solicitações por etapa</p>
            </div>
          </header>
          {isEmpty ? (
            <div className="empty-state">
              <strong>Fluxo ainda sem solicitações.</strong>
              <span>As etapas aparecem conforme o negócio começar a operar.</span>
            </div>
          ) : (
            <>
              <div
                className="donut"
                style={{
                  background: `conic-gradient(#10b981 0 ${paidPct}%, #6366f1 ${paidPct}% ${Math.min(paidPct + 25, 100)}%, #f59e0b ${Math.min(paidPct + 25, 100)}% 100%)`,
                }}
              >
                <span>
                  <strong>{paidPct}%</strong>
                  <small>Total</small>
                </span>
              </div>
              <div className="donut-legend">
                <span>
                  <i className="emerald" /> Pago
                </span>
                <span>
                  <i className="violet" /> Em fluxo
                </span>
                <span>
                  <i className="amber" /> Pendências
                </span>
              </div>
              {byStatus.map((item) => (
                <div
                  key={item.status}
                  style={{
                    padding: "8px 20px",
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 11,
                    color: "#a1a1aa",
                  }}
                >
                  <span>{STATUS_LABEL[item.status]}</span>
                  <strong style={{ color: "#fff" }}>{item.count}</strong>
                </div>
              ))}
            </>
          )}
        </article>
      </section>
    </div>
  );
}
