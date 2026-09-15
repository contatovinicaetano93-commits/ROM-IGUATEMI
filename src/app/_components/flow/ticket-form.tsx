"use client";

import { FormEvent, useRef, useState } from "react";
import { Camera, Upload, X } from "lucide-react";
import { AREA_LABEL, EXPENSE_TYPE_LABEL, maskMoneyInput, parseMoneyInput } from "@/lib/flow/format";
import type { Company, Expense, ExpenseType, RequestArea, StoredFile, User } from "@/lib/flow/types";
import { defaultPaymentDate, initialStatus } from "@/lib/flow/workflow";
import { fileToStored } from "@/lib/flow/files-client";

const RH_TYPES: ExpenseType[] = [
  "ferias",
  "admissao",
  "desligamento",
  "salario",
  "beneficio",
  "atestado",
  "uniforme",
  "outros",
];

export function TicketForm({
  area,
  company,
  user,
  onCreated,
  onCancel,
}: {
  area: Exclude<RequestArea, "financeiro">;
  company: Company;
  user: User;
  onCreated: (input: Omit<Expense, "id" | "created" | "updated">) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [detail, setDetail] = useState("");
  const [urgency, setUrgency] = useState("media");
  const [amount, setAmount] = useState("");
  const [rhType, setRhType] = useState<ExpenseType>("ferias");
  const [file, setFile] = useState<File | null>(null);
  const [stored, setStored] = useState<StoredFile | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  async function handleFile(next: File | null) {
    if (!next) {
      return;
    }
    setBusy(true);
    try {
      setFile(next);
      setStored(await fileToStored(next));
    } catch (caught) {
      setFile(null);
      setStored(null);
      setError(caught instanceof Error ? caught.message : "Não foi possível ler o arquivo.");
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim() || !description.trim()) {
      setError("Preencha título e descrição.");
      return;
    }
    setBusy(true);
    setError("");
    const type: ExpenseType = area === "manutencao" ? "chamado" : area === "compras" ? "pedido" : rhType;
    try {
      await onCreated({
        title: title.trim(),
        description: description.trim(),
        area,
        expense_type: type,
        event_project: detail.trim(),
        event_date: "",
        amount: parseMoneyInput(amount),
        category: area === "rh" ? EXPENSE_TYPE_LABEL[rhType] : urgency,
        payment_method: "pix",
        beneficiary_name: user.name,
        beneficiary_document: "",
        pix_key: "",
        bank_name: "",
        agency: "",
        account: "",
        boleto_code: "",
        max_payment_date: defaultPaymentDate(type),
        payment_date_justification: "Prazo padrão da área",
        receipt_justification: "",
        receipt: stored,
        payment_proof: null,
        company: company.id,
        requester: user.id,
        approver: null,
        status: initialStatus(area),
        scheduled_date: null,
        review_note: "",
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível enviar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="expense-form-page" onSubmit={submit}>
      <section className="premium-form-card">
        <div className="form-step">
          <div className="form-step-title">
            <div>
              <h3>{AREA_LABEL[area]}</h3>
              <p>
                {area === "manutencao"
                  ? "Depois, em Minhas solicitações, marque Em andamento, Finalizado ou Cancelado."
                  : area === "compras"
                    ? "Abra o pedido. O admin de compras valida e anda o chamado."
                    : "Abra a solicitação. O admin de RH analisa, devolve, aprova ou recusa."}
              </p>
            </div>
          </div>
          <div className="form-grid">
            <label className="full-field">
              Título <span>*</span>
              <input value={title} onChange={(event) => setTitle(event.target.value)} required />
            </label>
            <label className="full-field">
              Descrição <span>*</span>
              <textarea value={description} onChange={(event) => setDescription(event.target.value)} required />
            </label>
            {area === "manutencao" ? (
              <label className="full-field">
                Local / equipamento
                <input value={detail} onChange={(event) => setDetail(event.target.value)} />
              </label>
            ) : null}
            {area === "compras" ? (
              <label className="full-field">
                Especificação / fornecedor sugerido
                <input value={detail} onChange={(event) => setDetail(event.target.value)} />
              </label>
            ) : null}
            {area === "rh" ? (
              <>
                <label>
                  Tipo
                  <select value={rhType} onChange={(event) => setRhType(event.target.value as ExpenseType)}>
                    {RH_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {EXPENSE_TYPE_LABEL[type]}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Colaborador
                  <input value={detail} onChange={(event) => setDetail(event.target.value)} />
                </label>
              </>
            ) : (
              <label>
                Urgência
                <select value={urgency} onChange={(event) => setUrgency(event.target.value)}>
                  <option value="baixa">Baixa</option>
                  <option value="media">Média</option>
                  <option value="alta">Alta</option>
                </select>
              </label>
            )}
            <label>
              Valor estimado
              <div className="money-input">
                <span>R$</span>
                <input value={amount} onChange={(event) => setAmount(maskMoneyInput(event.target.value))} />
              </div>
            </label>
          </div>
          <div className="form-footer-split" style={{ marginTop: 16 }}>
            <button type="button" className="upload-zone" onClick={() => fileRef.current?.click()}>
              <Upload size={22} />
              <strong>Anexar arquivo</strong>
            </button>
            <button type="button" className="upload-zone" onClick={() => cameraRef.current?.click()}>
              <Camera size={22} />
              <strong>Tirar foto</strong>
            </button>
          </div>
          <input ref={fileRef} type="file" hidden accept="image/*,application/pdf" onChange={(event) => handleFile(event.target.files?.[0] ?? null)} />
          <input ref={cameraRef} type="file" hidden accept="image/*" capture="environment" onChange={(event) => handleFile(event.target.files?.[0] ?? null)} />
          {file ? (
            <div className="selected-file">
              <strong>{file.name}</strong>
              <button type="button" onClick={() => { setFile(null); setStored(null); }} aria-label="Remover">
                <X size={16} />
              </button>
            </div>
          ) : null}
        </div>
        {error ? <div className="form-error" style={{ margin: "0 24px 16px" }}>{error}</div> : null}
        <div className="form-footer">
          <span>{AREA_LABEL[area]} • {company.name}</span>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="secondary-button" onClick={onCancel}>
              Cancelar
            </button>
            <button className="primary-button" type="submit" disabled={busy}>
              {busy ? "Enviando…" : "Enviar solicitação"}
            </button>
          </div>
        </div>
      </section>
    </form>
  );
}
