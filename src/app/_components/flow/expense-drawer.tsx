"use client";

import { FormEvent, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Ban,
  CheckCircle2,
  Download,
  FileText,
  RotateCcw,
  Upload,
  X,
} from "lucide-react";
import {
  AREA_LABEL,
  EXPENSE_TYPE_LABEL,
  PAYMENT_METHOD_LABEL,
  STATUS_LABEL,
  cls,
  formatDate,
  formatDateTime,
  money,
} from "@/lib/flow/format";
import type { Expense, FinanceAction, FinanceActionPayload, User } from "@/lib/flow/types";
import { assertNever } from "@/lib/flow/types";
import { fileHref, fileToStored } from "@/lib/flow/files-client";
import { allowedActions } from "@/lib/flow/workflow";
import { MaintenanceStatusActions } from "./maintenance-status-actions";
import { StatusBadge } from "./status-badge";

export function ExpenseDrawer({
  expense,
  requester,
  companyName,
  user,
  onClose,
  onAction,
}: {
  expense: Expense;
  requester?: User;
  companyName: string;
  user: User;
  onClose: () => void;
  onAction: (action: FinanceAction, payload?: FinanceActionPayload) => void | Promise<void>;
}) {
  const [modal, setModal] = useState<FinanceAction | null>(null);
  const [note, setNote] = useState("");
  const [proof, setProof] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const actions = allowedActions(user, expense);

  function openModal(action: FinanceAction) {
    if (busy) {
      return;
    }
    setError("");
    setNote("");
    setProof(null);
    setModal(action);
  }

  async function runDirect(action: FinanceAction) {
    if (busy) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onAction(action);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível concluir a operação.");
    } finally {
      setBusy(false);
    }
  }

  async function confirm(event: FormEvent) {
    event.preventDefault();
    if (!modal || busy) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      if ((modal === "reject" || modal === "docs") && !note.trim()) {
        throw new Error("Informe a justificativa.");
      }
      const stored = proof ? await fileToStored(proof) : null;
      const payload: FinanceActionPayload = {};
      if (modal === "reject" || modal === "docs") {
        payload.note = note.trim();
      }
      if (modal === "attach_proof") {
        payload.proof = stored;
      }
      if (modal === "resubmit") {
        payload.receipt = stored;
      }
      await onAction(modal, payload);
      setModal(null);
      setNote("");
      setProof(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível concluir a operação.");
    } finally {
      setBusy(false);
    }
  }

  function modalTitle(action: FinanceAction): string {
    switch (action) {
      case "docs":
        return "Devolver solicitação";
      case "approve":
        return "Aprovar solicitação";
      case "reject":
        return expense.area === "manutencao" ? "Encerrar / recusar chamado" : "Recusar solicitação";
      case "resubmit":
        return "Reenviar documentação";
      case "attach_proof":
        return "Anexar recibo de pagamento";
      case "progress":
        return "Marcar em andamento";
      case "complete":
        return "Finalizar solicitação";
      case "cancel":
        return "Cancelar solicitação";
      default:
        return assertNever(action);
    }
  }

  function modalLead(action: FinanceAction): string {
    switch (action) {
      case "docs":
        return "A solicitação volta para o solicitante ajustar. Explique o que falta.";
      case "approve":
        return `${expense.title} passa para ${STATUS_LABEL.aprovada}. O solicitante é avisado.`;
      case "reject":
        return "Explique o motivo. Essa decisão fica registrada na solicitação.";
      case "resubmit":
        return "Anexe o que foi pedido e reenvie para a fila da área.";
      case "attach_proof":
        return "O recibo fica anexado à solicitação. O status não muda.";
      case "progress":
        return "A solicitação passa para Em andamento.";
      case "complete":
        return "A solicitação será finalizada.";
      case "cancel":
        return "A solicitação será cancelada.";
      default:
        return assertNever(action);
    }
  }

  function modalIconTone(action: FinanceAction): "emerald" | "red" | "amber" {
    switch (action) {
      case "reject":
      case "cancel":
        return "red";
      case "docs":
      case "attach_proof":
        return "amber";
      case "approve":
      case "resubmit":
      case "progress":
      case "complete":
        return "emerald";
      default:
        return assertNever(action);
    }
  }

  function confirmLabel(action: FinanceAction): string {
    switch (action) {
      case "docs":
        return "Devolver";
      case "approve":
        return "Aprovar";
      case "reject":
        return "Recusar";
      case "resubmit":
        return "Reenviar";
      case "attach_proof":
        return "Anexar recibo";
      case "progress":
        return "Em andamento";
      case "complete":
        return "Finalizar";
      case "cancel":
        return "Cancelar";
      default:
        return assertNever(action);
    }
  }

  return (
    <div className="drawer-layer">
      <button className="drawer-overlay" aria-label="Fechar detalhes" onClick={onClose} />
      <aside className="details-drawer">
        <header className="drawer-header">
          <div>
            <div className="drawer-header-tag">
              {AREA_LABEL[expense.area]} #{expense.id.slice(-6).toUpperCase()}
            </div>
            <h2>{expense.title}</h2>
          </div>
          <button className="close-btn" onClick={onClose} aria-label="Fechar">
            <X size={16} />
          </button>
        </header>
        <div className="drawer-body">
          {expense.status === "recusada" || expense.status === "cancelada" ? (
            <div className="details-alert error">{expense.review_note || "Solicitação recusada"}</div>
          ) : null}
          {expense.status === "devolvido" ? (
            <div className="details-alert">
              {expense.review_note || "Devolvido para ajustes. Anexe os documentos e reenvie."}
            </div>
          ) : null}
          {expense.status === "aprovada" ? (
            <div className="details-alert success">Solicitação aprovada</div>
          ) : null}
          {expense.status === "finalizada" ? (
            <div className="details-alert success">Chamado finalizado</div>
          ) : null}
          {expense.payment_proof ? (
            <div className="details-alert success">Recibo de pagamento anexado</div>
          ) : null}
          <div className="details-hero">
            <div className="hero-top-row">
              <StatusBadge status={expense.status} />
              {expense.area === "financeiro" ? (
                <span className="hero-date">{formatDate(expense.max_payment_date)}</span>
              ) : null}
            </div>
            {expense.amount > 0 ? <strong>{money(expense.amount)}</strong> : <strong>{AREA_LABEL[expense.area]}</strong>}
          </div>

          {error && !modal ? <div className="form-error">{error}</div> : null}
          {expense.area === "manutencao" ? (
            <div className="finance-actions-section">
              <div className="section-header-row">
                <h3>Status do chamado</h3>
              </div>
              <p className="maintenance-status-hint">Escolha: em andamento, finalizado ou cancelado.</p>
              <MaintenanceStatusActions
                expense={expense}
                actions={actions}
                busy={busy}
                onAction={(action) => {
                  if (action === "cancel") {
                    openModal("cancel");
                    return;
                  }
                  void runDirect(action);
                }}
              />
              {actions.includes("reject") || actions.includes("attach_proof") ? (
                <div className="finance-action-buttons" style={{ marginTop: 12 }}>
                  {actions.includes("attach_proof") ? (
                    <button className="action-pill-btn pay" type="button" disabled={busy} onClick={() => openModal("attach_proof")}>
                      Anexar recibo
                    </button>
                  ) : null}
                  {actions.includes("reject") ? (
                    <button className="action-pill-btn reject" type="button" disabled={busy} onClick={() => openModal("reject")}>
                      <Ban size={16} /> Recusar
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          {actions.length > 0 && expense.area !== "manutencao" ? (
            <div className="finance-actions-section">
              <div className="section-header-row">
                <h3>Ações</h3>
              </div>
              <div className="finance-action-buttons">
                {actions.includes("progress") ? (
                  <button className="action-pill-btn review" type="button" disabled={busy} onClick={() => openModal("progress")}>
                    Em andamento
                  </button>
                ) : null}
                {actions.includes("complete") ? (
                  <button className="action-pill-btn approve" type="button" disabled={busy} onClick={() => openModal("complete")}>
                    <CheckCircle2 size={16} /> Finalizar
                  </button>
                ) : null}
                {actions.includes("cancel") ? (
                  <button className="action-pill-btn reject" type="button" disabled={busy} onClick={() => openModal("cancel")}>
                    Cancelar
                  </button>
                ) : null}
                {actions.includes("docs") ? (
                  <button className="action-pill-btn return" type="button" disabled={busy} onClick={() => openModal("docs")}>
                    <RotateCcw size={16} /> Devolver
                  </button>
                ) : null}
                {actions.includes("approve") ? (
                  <button className="action-pill-btn approve" type="button" disabled={busy} onClick={() => openModal("approve")}>
                    <CheckCircle2 size={16} /> Aprovar
                  </button>
                ) : null}
                {actions.includes("attach_proof") ? (
                  <button className="action-pill-btn pay" type="button" disabled={busy} onClick={() => openModal("attach_proof")}>
                    Anexar recibo
                  </button>
                ) : null}
                {actions.includes("reject") ? (
                  <button className="action-pill-btn reject" type="button" disabled={busy} onClick={() => openModal("reject")}>
                    <Ban size={16} /> Recusar
                  </button>
                ) : null}
                {actions.includes("resubmit") ? (
                  <button className="action-pill-btn review" type="button" disabled={busy} onClick={() => openModal("resubmit")}>
                    Reenviar
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="details-block">
            <h3>Detalhes</h3>
            <p>{expense.description}</p>
            <p>
              <small>Tipo</small> {EXPENSE_TYPE_LABEL[expense.expense_type]}
            </p>
            {expense.event_project ? (
              <p>
                <small>Complemento</small> {expense.event_project}
              </p>
            ) : null}
            {expense.event_date ? (
              <p>
                <small>Data do fato</small> {formatDate(expense.event_date)}
              </p>
            ) : null}
            <p>
              <small>Solicitante</small> {requester?.name ?? "—"}
            </p>
            <p>
              <small>Empresa</small> {companyName}
            </p>
            {expense.area === "financeiro" ? (
              <>
                <p>
                  <small>Data de pagamento</small> {formatDate(expense.max_payment_date)}
                </p>
                {expense.payment_date_justification ? (
                  <p>
                    <small>Justificativa da data</small> {expense.payment_date_justification}
                  </p>
                ) : null}
                <p>
                  <small>Beneficiário</small> {expense.beneficiary_name} · {PAYMENT_METHOD_LABEL[expense.payment_method]}
                </p>
              </>
            ) : null}
            {expense.receipt ? (
              <a href={fileHref(expense.receipt)} download={expense.receipt.name} target="_blank" rel="noreferrer">
                <Download size={14} /> {expense.receipt.name}
              </a>
            ) : (
              <p>{expense.receipt_justification || "Sem documento anexado."}</p>
            )}
            {expense.payment_proof ? (
              <p>
                <FileText size={14} /> Recibo:{" "}
                <a href={fileHref(expense.payment_proof)} download={expense.payment_proof.name} target="_blank" rel="noreferrer">
                  {expense.payment_proof.name}
                </a>
              </p>
            ) : null}
            <small>Atualizado em {formatDateTime(expense.updated)}</small>
          </div>
        </div>
      </aside>
      {modal
        ? createPortal(
            <div className="flow-modal-layer">
              <button
                className="modal-overlay"
                aria-label="Fechar"
                type="button"
                onClick={() => {
                  if (!busy) {
                    setModal(null);
                  }
                }}
              />
              <form className="action-modal" onSubmit={confirm}>
                <header>
                  <div className={`modal-icon ${modalIconTone(modal)}`}>
                    {modal === "reject" || modal === "cancel" ? <Ban size={20} /> : <CheckCircle2 size={20} />}
                  </div>
                  <div>
                    <h3>{modalTitle(modal)}</h3>
                    <p className="modal-lead">{modalLead(modal)}</p>
                  </div>
                </header>
                {modal === "docs" || modal === "reject" ? (
                  <label className="modal-field">
                    <span>Justificativa</span>
                    <textarea
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                      required
                      autoFocus
                    />
                  </label>
                ) : null}
                {modal === "attach_proof" || modal === "resubmit" ? (
                  <div className="modal-field">
                    <button type="button" className="secondary-button" onClick={() => fileRef.current?.click()}>
                      <Upload size={16} /> Anexar arquivo
                    </button>
                    <button type="button" className="secondary-button" onClick={() => cameraRef.current?.click()}>
                      Tirar foto
                    </button>
                    <input
                      ref={fileRef}
                      type="file"
                      hidden
                      accept="image/*,application/pdf"
                      onChange={(event) => setProof(event.target.files?.[0] ?? null)}
                    />
                    <input
                      ref={cameraRef}
                      type="file"
                      hidden
                      accept="image/*"
                      capture="environment"
                      onChange={(event) => setProof(event.target.files?.[0] ?? null)}
                    />
                    {proof ? <small>{proof.name}</small> : null}
                  </div>
                ) : null}
                {error ? <div className="form-error">{error}</div> : null}
                <footer>
                  <button type="button" className="secondary-button" disabled={busy} onClick={() => setModal(null)}>
                    Voltar
                  </button>
                  <button
                    className={cls("primary-button", (modal === "reject" || modal === "cancel") && "destructive-button")}
                    type="submit"
                    disabled={busy}
                  >
                    {busy ? "Confirmando..." : confirmLabel(modal)}
                  </button>
                </footer>
              </form>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
