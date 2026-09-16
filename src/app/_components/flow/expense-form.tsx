"use client";

import { FormEvent, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Building2,
  CalendarDays,
  Camera,
  Check,
  FileText,
  Landmark,
  QrCode,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import {
  CATEGORY_COLOR,
  EXPENSE_TYPE_LABEL,
  PAYMENT_METHOD_LABEL,
  cls,
  formatDate,
  maskMoneyInput,
  money,
  parseMoneyInput,
} from "@/lib/flow/format";
import type {
  Category,
  Company,
  Expense,
  ExpenseType,
  PaymentMethod,
  StoredFile,
  User,
} from "@/lib/flow/types";
import { assertNever } from "@/lib/flow/types";
import { fileToStored } from "@/lib/flow/files-client";
import { daysFromToday, defaultPaymentDate, isReimbursement, todayIsoDate, withEventDateObservation } from "@/lib/flow/workflow";

const STEPS = [
  { title: "Dados básicos", caption: "Sobre a despesa" },
  { title: "Beneficiário", caption: "Forma de pagamento" },
  { title: "Documentos", caption: "Nota fiscal" },
  { title: "Revisão", caption: "Confirmar envio" },
];

const TYPES: ExpenseType[] = [
  "fornecedor",
  "reembolso_colaborador",
  "reembolso_cliente",
  "outros",
];
const METHODS: PaymentMethod[] = ["pix", "ted", "boleto"];

export function ExpenseForm({
  company,
  user,
  categories,
  greetingPhrase,
  onCreated,
  onCancel,
}: {
  company: Company;
  user: User;
  categories: Category[];
  greetingPhrase: string;
  onCreated: (input: Omit<Expense, "id" | "created" | "updated">) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<File | null>(null);
  const [receiptStored, setReceiptStored] = useState<StoredFile | null>(null);
  const [preparingFile, setPreparingFile] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const activeCategories = categories.filter((item) => item.is_active);
  const categoryChoices =
    activeCategories.length > 0
      ? activeCategories
      : Object.keys(CATEGORY_COLOR).map((name) => ({
          id: name,
          name,
          color: CATEGORY_COLOR[name] ?? "#71717A",
          is_active: true,
        }));
  const [form, setForm] = useState(() => ({
    title: "",
    description: "",
    expense_type: "fornecedor" as ExpenseType,
    event_project: "",
    event_date: "",
    amount: "",
    category: categoryChoices[0]?.name ?? "Software",
    payment_method: "pix" as PaymentMethod,
    beneficiary_name: "",
    beneficiary_document: "",
    pix_key: "",
    bank_name: "",
    agency: "",
    account: "",
    boleto_code: "",
    max_payment_date: defaultPaymentDate("fornecedor"),
    payment_date_justification: "",
    receipt_justification: "",
  }));
  const [now] = useState(() => Date.now());

  const urgency = useMemo(() => {
    const days = Math.ceil(
      (new Date(`${form.max_payment_date}T23:59:59`).getTime() - now) / 86_400_000,
    );
    if (days <= 2) {
      return { label: "Prazo crítico", detail: `${Math.max(days, 0)} dias para pagamento`, tone: "red" };
    }
    if (days <= 5) {
      return { label: "Prazo de atenção", detail: `${days} dias para pagamento`, tone: "amber" };
    }
    return { label: "Prazo confortável", detail: `${days} dias para pagamento`, tone: "green" };
  }, [form.max_payment_date, now]);

  const reimbursement = isReimbursement(form.expense_type);
  const needsDateJustification = reimbursement || daysFromToday(form.max_payment_date) < 15;
  const dateCap = reimbursement ? defaultPaymentDate(form.expense_type) : undefined;

  const canContinue =
    step === 0
      ? Boolean(
          form.title &&
            form.description &&
            form.amount &&
            form.max_payment_date &&
            (!reimbursement || form.event_date) &&
            (!needsDateJustification || form.payment_date_justification.trim()),
        )
      : step === 1
        ? Boolean(
            form.beneficiary_name &&
              (form.payment_method !== "pix" || form.pix_key) &&
              (form.payment_method !== "boleto" || form.boleto_code) &&
              (form.payment_method !== "ted" || (form.bank_name && form.agency && form.account)),
          )
        : step === 2
          ? Boolean((receiptStored || form.receipt_justification.trim().length >= 15) && !preparingFile)
          : !preparingFile;

  function setField<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleFile(file: File | null) {
    if (!file) {
      return;
    }
    setPreparingFile(true);
    setError("");
    setReceipt(file);
    try {
      setReceiptStored(await fileToStored(file));
    } catch (caught) {
      setReceipt(null);
      setReceiptStored(null);
      setError(caught instanceof Error ? caught.message : "Não foi possível ler o arquivo.");
    } finally {
      setPreparingFile(false);
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (step < 3) {
      if (canContinue) {
        setStep((current) => current + 1);
      }
      return;
    }
    if (!confirmed) {
      setError("Confirme que os dados estão corretos para enviar a solicitação.");
      return;
    }
    if (preparingFile) {
      setError("Aguarde a nota fiscal terminar de carregar.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await onCreated({
        title: form.title,
        description: withEventDateObservation(form.description, form.expense_type, form.event_date),
        area: "financeiro",
        expense_type: form.expense_type,
        event_project: form.event_project,
        event_date: form.event_date,
        amount: parseMoneyInput(form.amount),
        category: form.category,
        payment_method: form.payment_method,
        beneficiary_name: form.beneficiary_name,
        beneficiary_document: form.beneficiary_document,
        pix_key: form.pix_key,
        bank_name: form.bank_name,
        agency: form.agency,
        account: form.account,
        boleto_code: form.boleto_code,
        max_payment_date: form.max_payment_date,
        payment_date_justification: form.payment_date_justification,
        receipt_justification: form.receipt_justification,
        receipt: receiptStored,
        payment_proof: null,
        company: company.id,
        requester: user.id,
        approver: null,
        status: "em_analise",
        scheduled_date: null,
        review_note: "",
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível concluir a operação.");
    } finally {
      setSubmitting(false);
    }
  }

  function methodIcon(method: PaymentMethod) {
    switch (method) {
      case "pix":
        return <QrCode size={16} />;
      case "ted":
        return <Landmark size={16} />;
      case "boleto":
        return <FileText size={16} />;
      default:
        return assertNever(method);
    }
  }

  return (
    <form className="expense-form-page page-stack" onSubmit={handleSubmit}>
      <section className="kindness-banner fade-in">
        <div className="kindness-content">
          <span className="kindness-icon-pulse">
            <Sparkles size={16} />
          </span>
          <div className="kindness-text">
            <strong>{greetingPhrase}</strong>
            <span>
              {user.name ? `Olá, ${user.name}! ` : ""}
              Estamos aqui para agilizar seu pedido de pagamento.
            </span>
          </div>
        </div>
      </section>
      <section className="form-page-head">
        <button type="button" className="back-button" onClick={onCancel}>
          <ArrowLeft size={18} /> Minhas solicitações
        </button>
        <div>
          <span className="eyebrow">PEDIDO DE PAGAMENTO</span>
          <h2>Conte os detalhes da despesa</h2>
          <p>Preencha as informações com atenção. Isso agiliza a análise do Financeiro.</p>
        </div>
        <div className="form-progress">
          {STEPS.map((item, index) => (
            <div
              key={item.title}
              className={cls(index === step && "active", index < step && "completed")}
            >
              <span>{index + 1}</span>
              <p>
                <strong>{item.title}</strong>
                <small>{item.caption}</small>
              </p>
              <i />
            </div>
          ))}
        </div>
      </section>
      <section className="premium-form-card">
        {step === 0 ? (
          <div className="form-step">
            <div className="form-step-title">
              <Building2 size={20} />
              <div>
                <h3>Dados básicos</h3>
                <p>Comece informando o que será pago e por quê.</p>
              </div>
            </div>
            <div className="form-grid">
              <label className="full-field">
                Título da solicitação <span>*</span>
                <input
                  value={form.title}
                  onChange={(event) => setField("title", event.target.value)}
                  required
                />
              </label>
              <label className="full-field">
                Descrição <span>*</span>
                <textarea
                  value={form.description}
                  maxLength={500}
                  onChange={(event) => setField("description", event.target.value)}
                  placeholder={
                    reimbursement
                      ? "Descreva o fato e a data como observação. Ex.: almoço com cliente no dia 12/08."
                      : undefined
                  }
                  required
                />
                <small className="char-count">{form.description.length}/500</small>
              </label>
              <label>
                Tipo
                <select
                  value={form.expense_type}
                  onChange={(event) => {
                    const next = event.target.value as ExpenseType;
                    setForm((current) => ({
                      ...current,
                      expense_type: next,
                      max_payment_date: defaultPaymentDate(next),
                    }));
                  }}
                >
                  {TYPES.map((type) => (
                    <option key={type} value={type}>
                      {EXPENSE_TYPE_LABEL[type]}
                    </option>
                  ))}
                </select>
              </label>
              {reimbursement ? (
                <label>
                  Data do fato <span>*</span>
                  <div className="date-input">
                    <CalendarDays size={16} />
                    <input
                      type="date"
                      value={form.event_date}
                      max={todayIsoDate()}
                      onChange={(event) => setField("event_date", event.target.value)}
                      required
                    />
                  </div>
                  <small className="char-count">Quando o gasto ou o estorno aconteceu.</small>
                </label>
              ) : (
                <label>
                  Evento / Projeto
                  <input
                    value={form.event_project}
                    onChange={(event) => setField("event_project", event.target.value)}
                  />
                </label>
              )}
              <label>
                Categoria
                <select
                  value={form.category}
                  onChange={(event) => setField("category", event.target.value)}
                >
                  {categoryChoices.map((category) => (
                    <option key={category.id}>{category.name}</option>
                  ))}
                </select>
              </label>
              <label>
                Valor <span>*</span>
                <div className="money-input">
                  <span>R$</span>
                  <input
                    value={form.amount}
                    onChange={(event) => setField("amount", maskMoneyInput(event.target.value))}
                    required
                  />
                </div>
              </label>
              <label>
                Data de pagamento <span>*</span>
                <div className="date-input">
                  <CalendarDays size={16} />
                  <input
                    type="date"
                    value={form.max_payment_date}
                    max={dateCap}
                    onChange={(event) => setField("max_payment_date", event.target.value)}
                    required
                  />
                </div>
              </label>
              {needsDateJustification ? (
                <label className="full-field">
                  Justificativa da data de pagamento <span>*</span>
                  <textarea
                    value={form.payment_date_justification}
                    onChange={(event) => setField("payment_date_justification", event.target.value)}
                    placeholder={
                      isReimbursement(form.expense_type)
                        ? "Reembolso: data em até 5 dias. Explique o motivo."
                        : "Explique por que a data é inferior a 15 dias."
                    }
                    required
                  />
                </label>
              ) : null}
              <span className={`urgency-pill urgency-${urgency.tone}`}>
                <i /> <strong>{urgency.label}</strong> {urgency.detail}
              </span>
            </div>
          </div>
        ) : null}
        {step === 1 ? (
          <div className="form-step">
            <div className="form-step-title">
              <Landmark size={20} />
              <div>
                <h3>Dados do beneficiário</h3>
                <p>Informe quem receberá e como o pagamento deve ser feito.</p>
              </div>
            </div>
            <fieldset className="payment-options">
              <legend>
                Forma de pagamento <span>*</span>
              </legend>
              {METHODS.map((method) => (
                <button
                  key={method}
                  type="button"
                  className={cls(form.payment_method === method && "selected")}
                  onClick={() => setField("payment_method", method)}
                >
                  {methodIcon(method)}
                  <span>
                    <strong>{PAYMENT_METHOD_LABEL[method]}</strong>
                    <small>
                      {method === "pix"
                        ? "PIX, e-mail ou CPF/CNPJ"
                        : method === "ted"
                          ? "Banco, agência e conta"
                          : "Linha digitável do boleto"}
                    </small>
                  </span>
                  {form.payment_method === method ? <Check className="option-check" size={15} /> : null}
                </button>
              ))}
            </fieldset>
            <div className="form-grid">
              <label>
                Nome / Razão social <span>*</span>
                <input
                  value={form.beneficiary_name}
                  onChange={(event) => setField("beneficiary_name", event.target.value)}
                  required
                />
              </label>
              <label>
                Documento
                <input
                  value={form.beneficiary_document}
                  onChange={(event) => setField("beneficiary_document", event.target.value)}
                />
              </label>
              {form.payment_method === "pix" ? (
                <label className="full-field">
                  Chave PIX <span>*</span>
                  <input
                    value={form.pix_key}
                    onChange={(event) => setField("pix_key", event.target.value)}
                    required
                  />
                </label>
              ) : null}
              {form.payment_method === "ted" ? (
                <>
                  <label>
                    Banco <span>*</span>
                    <input
                      value={form.bank_name}
                      onChange={(event) => setField("bank_name", event.target.value)}
                      required
                    />
                  </label>
                  <label>
                    Agência <span>*</span>
                    <input
                      value={form.agency}
                      onChange={(event) => setField("agency", event.target.value)}
                      required
                    />
                  </label>
                  <label className="full-field">
                    Conta <span>*</span>
                    <input
                      value={form.account}
                      onChange={(event) => setField("account", event.target.value)}
                      required
                    />
                  </label>
                </>
              ) : null}
              {form.payment_method === "boleto" ? (
                <label className="full-field">
                  Código de barras <span>*</span>
                  <input
                    value={form.boleto_code}
                    onChange={(event) => setField("boleto_code", event.target.value)}
                    required
                  />
                </label>
              ) : null}
            </div>
          </div>
        ) : null}
        {step === 2 ? (
          <div className="form-step">
            <div className="form-step-title">
              <Upload size={20} />
              <div>
                <h3>Documentos fiscais</h3>
                <p>Anexe a nota fiscal ou informe por que ela ainda não está disponível.</p>
              </div>
            </div>
            <div className="form-footer-split">
              <button
                type="button"
                className={cls("upload-zone", dragging && "dragging")}
                onClick={() => fileRef.current?.click()}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragging(false);
                  handleFile(event.dataTransfer.files[0] ?? null);
                }}
              >
                <span>
                  <Upload size={22} />
                </span>
                <strong>Arraste a nota fiscal para cá</strong>
                <p>ou clique para selecionar o arquivo</p>
                <small>PDF, JPG, PNG ou WEBP • até 10 MB</small>
              </button>
              <button type="button" className="upload-zone" onClick={() => cameraRef.current?.click()}>
                <span>
                  <Camera size={22} />
                </span>
                <strong>Tirar foto</strong>
                <p>Use a câmera do celular</p>
                <small>JPG ou PNG • até 10 MB</small>
              </button>
            </div>
            <input
              ref={fileRef}
              type="file"
              hidden
              accept="image/jpeg,image/png,image/webp,application/pdf"
              onChange={(event) => handleFile(event.target.files?.[0] ?? null)}
            />
            <input
              ref={cameraRef}
              type="file"
              hidden
              accept="image/*"
              capture="environment"
              onChange={(event) => handleFile(event.target.files?.[0] ?? null)}
            />
            {preparingFile ? (
              <div className="selected-file">
                <span className="spinner" />
                <span>
                  <strong>Preparando arquivo…</strong>
                  <small>Compactando para o envio ficar leve</small>
                </span>
              </div>
            ) : receipt ? (
              <div className="selected-file">
                <FileText size={18} />
                <span>
                  <strong>{receipt.name}</strong>
                  <small>{(receipt.size / 1024).toFixed(0)} KB</small>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setReceipt(null);
                    setReceiptStored(null);
                  }}
                  aria-label="Remover arquivo"
                >
                  <X size={16} />
                </button>
              </div>
            ) : null}
            <div className="or-divider">OU, SE A NOTA AINDA NÃO FOI EMITIDA</div>
            <label>
              Justificativa
              <textarea
                value={form.receipt_justification}
                onChange={(event) => setField("receipt_justification", event.target.value)}
                placeholder="Explique por que a nota ainda não está disponível."
              />
            </label>
            <div className="info-message">
              <strong>Atenção:</strong>
              <p> solicitações sem nota fiscal podem voltar para a etapa de documentação antes da aprovação.</p>
            </div>
          </div>
        ) : null}
        {step === 3 ? (
          <div className="form-step">
            <div className="form-step-title">
              <Check size={20} />
              <div>
                <h3>Revise antes de enviar</h3>
                <p>Depois do envio, o Financeiro será notificado imediatamente.</p>
              </div>
            </div>
            <div className="review-hero">
              <span>Total solicitado</span>
              <strong>{money(parseMoneyInput(form.amount))}</strong>
              <em className={`urgency-pill urgency-${urgency.tone}`}>{urgency.label}</em>
            </div>
            <div className="review-grid">
              <div>
                <small>Solicitação</small>
                <strong>{form.title}</strong>
                <span>{form.category}</span>
              </div>
              <div>
                <small>Beneficiário</small>
                <strong>{form.beneficiary_name}</strong>
                <span>{PAYMENT_METHOD_LABEL[form.payment_method]}</span>
              </div>
              <div>
                <small>Data de pagamento</small>
                <strong>{formatDate(form.max_payment_date)}</strong>
                <span>{urgency.detail}</span>
              </div>
              {reimbursement && form.event_date ? (
                <div>
                  <small>Data do fato</small>
                  <strong>{formatDate(form.event_date)}</strong>
                  <span>Quando o reembolso ou estorno aconteceu</span>
                </div>
              ) : null}
              <div>
                <small>Documento</small>
                <strong>{receipt?.name || "Sem nota fiscal"}</strong>
                <span>{receipt ? "Arquivo anexado" : form.receipt_justification.slice(0, 40)}</span>
              </div>
            </div>
            <label className={cls("confirmation-box", error.includes("Confirme") && "needs-confirm")}>
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
              />
              <p>
                Confirmo que os dados informados estão corretos e os documentos anexados são autênticos.
              </p>
            </label>
          </div>
        ) : null}
        {error ? <div className="form-error" style={{ margin: "0 24px 16px" }}>{error}</div> : null}
        <div className="form-footer">
          <span>Etapa {step + 1} de 4 • Ambiente corporativo protegido</span>
          <div style={{ display: "flex", gap: 8 }}>
            {step > 0 ? (
              <button
                type="button"
                className="secondary-button"
                onClick={() => setStep((current) => current - 1)}
              >
                Cancelar
              </button>
            ) : (
              <button type="button" className="secondary-button" onClick={onCancel}>
                Cancelar
              </button>
            )}
            <button className="primary-button" type="submit" disabled={!canContinue || submitting}>
              {submitting ? (
                <span className="spinner" />
              ) : step < 3 ? (
                preparingFile ? "Preparando arquivo…" : "Continuar"
              ) : (
                "Enviar solicitação"
              )}
            </button>
          </div>
        </div>
      </section>
    </form>
  );
}
