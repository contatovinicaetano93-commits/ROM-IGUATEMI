"use client";

import { useMemo, useState } from "react";
import { Mail, Search, Shield } from "lucide-react";
import {
  AUDIT_LABEL,
  EMAIL_KIND_LABEL,
  EMAIL_STATUS_LABEL,
  ROLE_LABEL,
  formatDateTime,
  initials,
} from "@/lib/flow/format";
import type { AuditLog, EmailLog, User } from "@/lib/flow/types";

function findAuditActor(users: User[], userKey: string) {
  const needle = userKey.toLowerCase();
  return users.find((user) => user.id === userKey || user.email.toLowerCase() === needle);
}

export function AuditPage({
  logs,
  emailLogs,
  users,
}: {
  logs: AuditLog[];
  emailLogs: EmailLog[];
  users: User[];
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(
    () =>
      logs.filter((item) => {
        const actor = findAuditActor(users, item.user);
        return `${actor?.name ?? item.user} ${AUDIT_LABEL[item.action]} ${item.resource}`
          .toLowerCase()
          .includes(query.toLowerCase());
      }),
    [logs, query, users],
  );
  const filteredMail = useMemo(
    () =>
      emailLogs.filter((item) =>
        `${item.toEmail} ${item.toName} ${item.subject} ${EMAIL_KIND_LABEL[item.kind]} ${item.status}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    [emailLogs, query],
  );
  const uniqueUsers = new Set(logs.map((item) => item.user)).size;
  const sentCount = emailLogs.filter((item) => item.status === "sent").length;

  return (
    <div className="page-stack">
      <section className="page-title-row">
        <div>
          <span className="eyebrow">GOVERNANÇA</span>
          <h2>Log de auditoria</h2>
          <p>Rastreabilidade das alterações e de cada e-mail enviado pelo ROM Flow.</p>
        </div>
      </section>
      <section className="audit-summary">
        <article>
          <Shield size={18} />
          <div>
            <strong>{logs.length}</strong>
            <span>eventos registrados</span>
          </div>
        </article>
        <article>
          <Mail size={18} />
          <div>
            <strong>{sentCount}</strong>
            <span>e-mails enviados</span>
          </div>
        </article>
        <article>
          <Shield size={18} />
          <div>
            <strong>{uniqueUsers}</strong>
            <span>usuários ativos no log</span>
          </div>
        </article>
      </section>
      <section className="panel data-panel">
        <div className="filter-bar">
          <div className="table-search">
            <Search size={16} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar evento ou e-mail"
            />
          </div>
        </div>
        {filtered.length === 0 ? (
          <div className="empty-state">
            <strong>Nenhum evento registrado</strong>
          </div>
        ) : (
          <div className="expense-table-wrap">
            <table className="expense-table audit-table">
              <thead>
                <tr>
                  <th>Data e hora</th>
                  <th>Responsável</th>
                  <th>Ação</th>
                  <th>Recurso</th>
                  <th>Antes → Depois</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => {
                  const actor = findAuditActor(users, item.user);
                  return (
                    <tr key={item.id}>
                      <td>{formatDateTime(item.created)}</td>
                      <td>
                        <div className="audit-user">
                          <i>{initials(actor?.name || actor?.email || item.user || "RO")}</i>
                          <span>
                            <strong>{actor?.name || actor?.email || item.user || "Sistema"}</strong>
                            <small>{actor?.email || (actor ? "" : item.user)}</small>
                          </span>
                        </div>
                      </td>
                      <td>
                        <span className="audit-action">{AUDIT_LABEL[item.action]}</span>
                      </td>
                      <td>
                        <code>{item.resource}</code>
                      </td>
                      <td>
                        {item.before} → {item.after}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="panel data-panel">
        <header className="email-log-header">
          <h3>Envios de e-mail</h3>
          <p>Cada convite e cada movimentação de solicitação fica registrado aqui.</p>
        </header>
        {filteredMail.length === 0 ? (
          <div className="empty-state">
            <strong>Nenhum e-mail registrado</strong>
          </div>
        ) : (
          <div className="expense-table-wrap">
            <table className="expense-table audit-table">
              <thead>
                <tr>
                  <th>Data e hora</th>
                  <th>Destinatário</th>
                  <th>Tipo</th>
                  <th>Assunto</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredMail.map((item) => (
                  <tr key={item.id}>
                    <td>{formatDateTime(item.created)}</td>
                    <td>
                      <strong>{item.toName || item.toEmail}</strong>
                      <small className="table-subline">
                        {item.toEmail}
                        {item.toRole ? ` · ${ROLE_LABEL[item.toRole]}` : ""}
                      </small>
                    </td>
                    <td>{EMAIL_KIND_LABEL[item.kind]}</td>
                    <td>{item.subject}</td>
                    <td>
                      <span className={`email-status ${item.status}`}>
                        {EMAIL_STATUS_LABEL[item.status]}
                      </span>
                      {item.status === "failed" && item.error ? (
                        <small className="table-subline">{item.error}</small>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
