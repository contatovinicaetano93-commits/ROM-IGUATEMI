"use client";

import { useMemo, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  Search,
  Wallet,
} from "lucide-react";
import { AREA_LABEL, daysUntil, formatDate, money, shortId } from "@/lib/flow/format";
import type { Expense, User } from "@/lib/flow/types";
import { isAdminInbox, isWaitingPayment } from "@/lib/flow/workflow";
import { StatusBadge } from "./status-badge";

type ApprovalTab = "review" | "returned" | "approved" | "rejected";
type PaymentTab = "waiting" | "paid";

export function FinancePage({
  mode,
  expenses,
  users,
  onOpen,
}: {
  mode: "approvals" | "payments";
  expenses: Expense[];
  users: User[];
  onOpen: (expense: Expense) => void;
}) {
  const [approvalTab, setApprovalTab] = useState<ApprovalTab>("review");
  const [paymentTab, setPaymentTab] = useState<PaymentTab>("waiting");
  const [query, setQuery] = useState("");

  const queue = useMemo(() => expenses.filter((item) => isAdminInbox(item)), [expenses]);
  const returned = useMemo(() => expenses.filter((item) => item.status === "devolvido"), [expenses]);
  const decided = useMemo(
    () => expenses.filter((item) => item.status === "aprovada" || item.status === "finalizada"),
    [expenses],
  );
  const rejected = useMemo(
    () => expenses.filter((item) => item.status === "recusada" || item.status === "cancelada"),
    [expenses],
  );
  const waitingPay = useMemo(() => expenses.filter((item) => isWaitingPayment(item)), [expenses]);
  const paid = useMemo(() => expenses.filter((item) => Boolean(item.payment_proof)), [expenses]);

  const list = useMemo(() => {
    let source: Expense[];
    if (mode === "payments") {
      switch (paymentTab) {
        case "waiting":
          source = waitingPay;
          break;
        case "paid":
          source = paid;
          break;
        default: {
          const exhaustive: never = paymentTab;
          return exhaustive;
        }
      }
    } else {
      switch (approvalTab) {
        case "review":
          source = queue;
          break;
        case "returned":
          source = returned;
          break;
        case "approved":
          source = decided;
          break;
        case "rejected":
          source = rejected;
          break;
        default: {
          const exhaustive: never = approvalTab;
          return exhaustive;
        }
      }
    }
    return source.filter((item) =>
      `${item.title} ${item.beneficiary_name} ${AREA_LABEL[item.area]}`
        .toLowerCase()
        .includes(query.toLowerCase()),
    );
  }, [approvalTab, decided, mode, paymentTab, paid, query, queue, rejected, returned, waitingPay]);

  return (
    <div className="page-stack">
      <section className="page-title-row">
        <div>
          <span className="eyebrow">{mode === "approvals" ? "FILA DA ÁREA" : "PAGAMENTOS"}</span>
          <h2>{mode === "approvals" ? "Central de aprovação" : "Pagamentos"}</h2>
          <p>
            {mode === "approvals"
              ? "Abra a solicitação, decida e o status atualiza na hora."
              : "Anexe o recibo das solicitações já validadas."}
          </p>
        </div>
      </section>
      <section className="finance-kpis">
        {mode === "approvals" ? (
          <>
            <article>
              <div className="finance-icon violet">
                <Clock3 size={19} />
              </div>
              <div>
                <small>Na fila</small>
                <strong>{queue.length}</strong>
                <em>precisam de decisão</em>
              </div>
            </article>
            <article>
              <div className="finance-icon amber">
                <Wallet size={19} />
              </div>
              <div>
                <small>Devolvidas</small>
                <strong>{returned.length}</strong>
                <em>aguardando ajuste</em>
              </div>
            </article>
            <article>
              <div className="finance-icon emerald">
                <CheckCircle2 size={19} />
              </div>
              <div>
                <small>Aprovadas</small>
                <strong>{decided.length}</strong>
                <em>nesta empresa</em>
              </div>
            </article>
          </>
        ) : (
          <>
            <article>
              <div className="finance-icon amber">
                <Wallet size={19} />
              </div>
              <div>
                <small>Aguardando recibo</small>
                <strong>{waitingPay.length}</strong>
                <em>{money(waitingPay.reduce((sum, item) => sum + item.amount, 0))}</em>
              </div>
            </article>
            <article>
              <div className="finance-icon emerald">
                <CheckCircle2 size={19} />
              </div>
              <div>
                <small>Com recibo</small>
                <strong>{paid.length}</strong>
                <em>{money(paid.reduce((sum, item) => sum + item.amount, 0))}</em>
              </div>
            </article>
            <article>
              <div className="finance-icon violet">
                <Clock3 size={19} />
              </div>
              <div>
                <small>Na fila de análise</small>
                <strong>{queue.length}</strong>
                <em>ainda não validadas</em>
              </div>
            </article>
          </>
        )}
      </section>
      <section className="panel data-panel">
        <div className="finance-tabs-flow">
          <div className="finance-flow-scroll">
            {mode === "approvals" ? (
              <>
                <button className={approvalTab === "review" ? "active" : ""} onClick={() => setApprovalTab("review")}>
                  Na fila {queue.length > 0 ? <span>{queue.length}</span> : null}
                </button>
                <button className={approvalTab === "returned" ? "active" : ""} onClick={() => setApprovalTab("returned")}>
                  Devolvido {returned.length > 0 ? <span>{returned.length}</span> : null}
                </button>
                <button className={approvalTab === "approved" ? "active" : ""} onClick={() => setApprovalTab("approved")}>
                  Aprovado {decided.length > 0 ? <span>{decided.length}</span> : null}
                </button>
                <button className={approvalTab === "rejected" ? "active" : ""} onClick={() => setApprovalTab("rejected")}>
                  Recusado {rejected.length > 0 ? <span>{rejected.length}</span> : null}
                </button>
              </>
            ) : (
              <>
                <button className={paymentTab === "waiting" ? "active" : ""} onClick={() => setPaymentTab("waiting")}>
                  Aguardando recibo {waitingPay.length > 0 ? <span>{waitingPay.length}</span> : null}
                </button>
                <button className={paymentTab === "paid" ? "active" : ""} onClick={() => setPaymentTab("paid")}>
                  Com recibo {paid.length > 0 ? <span>{paid.length}</span> : null}
                </button>
              </>
            )}
          </div>
        </div>
        <div className="finance-tabs">
          <label>
            <Search size={14} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar"
            />
          </label>
        </div>
        {list.length === 0 ? (
          <div className="empty-state">
            <strong>
              {mode === "payments"
                ? paymentTab === "waiting"
                  ? "Nada aguardando recibo."
                  : "Nenhum recibo anexado ainda."
                : approvalTab === "review"
                  ? "Fila limpa."
                  : "Nenhuma solicitação nessa etapa."}
            </strong>
            <span>
              {mode === "payments"
                ? "Pagamentos aparecem depois da validação da área."
                : "Novas solicitações da sua área entram aqui."}
            </span>
          </div>
        ) : (
          <div className="approval-list">
            {list.map((item) => {
              const requester = users.find((user) => user.id === item.requester);
              const showPayDate = item.area === "financeiro";
              const days = showPayDate ? daysUntil(item.max_payment_date) : null;
              return (
                <article className="approval-card" key={item.id}>
                  <button className="requester-avatar" onClick={() => onOpen(item)}>
                    {(requester?.name || "RO").slice(0, 2).toUpperCase()}
                  </button>
                  <div className="approval-main">
                    <div className="approval-title">
                      <button onClick={() => onOpen(item)}>
                        <strong>{item.title}</strong>
                        <span>
                          #{shortId(item.id)} • {AREA_LABEL[item.area]}
                        </span>
                      </button>
                      <StatusBadge status={item.status} />
                    </div>
                    <p>{item.description}</p>
                    <div className="approval-meta">
                      <span>
                        <small>Solicitante</small>
                        <strong>{requester?.name || "—"}</strong>
                      </span>
                      {item.area === "financeiro" ? (
                        <span>
                          <small>Beneficiário</small>
                          <strong>{item.beneficiary_name}</strong>
                        </span>
                      ) : (
                        <span>
                          <small>Tipo</small>
                          <strong>{item.category}</strong>
                        </span>
                      )}
                      {days !== null ? (
                        <span>
                          <small>Prazo</small>
                          <strong>{days < 0 ? "Encerrado" : `${days} dias`}</strong>
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="approval-value">
                    {item.amount > 0 ? (
                      <>
                        <small>Valor</small>
                        <strong>{money(item.amount)}</strong>
                      </>
                    ) : (
                      <>
                        <small>Área</small>
                        <strong>{AREA_LABEL[item.area]}</strong>
                      </>
                    )}
                    {showPayDate ? (
                      <span>
                        <CalendarDays size={12} /> {formatDate(item.max_payment_date)}
                      </span>
                    ) : null}
                  </div>
                  <div className="approval-actions">
                    <button className="view-action" onClick={() => onOpen(item)}>
                      {mode === "approvals" && approvalTab === "review" ? "Decidir" : "Ver detalhes"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
