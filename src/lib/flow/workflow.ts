import type {
  Expense,
  ExpenseStatus,
  ExpenseType,
  RequestAction,
  RequestArea,
  Role,
  Screen,
  User,
} from "@/lib/flow/types";
import { assertNever } from "@/lib/flow/types";

export const REQUEST_AREAS: RequestArea[] = ["financeiro", "manutencao", "compras", "rh"];

export const ROLES: Role[] = [
  "master",
  "admin_financeiro",
  "admin_manutencao",
  "admin_compras",
  "admin_rh",
  "solicitante",
];

export function parseRole(value: unknown): Role {
  if (value === "admin") {
    return "master";
  }
  if (value === "financeiro") {
    return "admin_financeiro";
  }
  if (
    value === "master" ||
    value === "admin_financeiro" ||
    value === "admin_manutencao" ||
    value === "admin_compras" ||
    value === "admin_rh" ||
    value === "solicitante"
  ) {
    return value;
  }
  throw new Error("Perfil inválido.");
}

export function parseArea(value: unknown): RequestArea {
  if (value === "financeiro" || value === "manutencao" || value === "compras" || value === "rh") {
    return value;
  }
  return "financeiro";
}

export function parseAreas(values: unknown): RequestArea[] {
  if (!Array.isArray(values)) {
    return [];
  }
  const unique = new Set<RequestArea>();
  for (const value of values) {
    if (value === "financeiro" || value === "manutencao" || value === "compras" || value === "rh") {
      unique.add(value);
    }
  }
  return REQUEST_AREAS.filter((area) => unique.has(area));
}

export function parseExpenseType(value: unknown): ExpenseType {
  switch (value) {
    case "reembolso":
      return "reembolso_colaborador";
    case "adiantamento":
    case "impostos":
      return "outros";
    case "fornecedor":
    case "reembolso_colaborador":
    case "reembolso_cliente":
    case "outros":
    case "chamado":
    case "pedido":
    case "ferias":
    case "admissao":
    case "desligamento":
    case "salario":
    case "beneficio":
    case "atestado":
    case "uniforme":
      return value;
    default:
      return "outros";
  }
}

export function parseStatus(value: unknown): ExpenseStatus {
  switch (value) {
    case "enviada":
      return "em_analise";
    case "aguardando_documentacao":
      return "devolvido";
    case "agendada":
    case "paga":
    case "aprovada":
      return "aprovada";
    case "em_analise":
    case "devolvido":
    case "recusada":
    case "aberta":
    case "em_andamento":
    case "finalizada":
    case "cancelada":
      return value;
    default:
      return "em_analise";
  }
}

export function isMaster(role: Role): boolean {
  return role === "master";
}

export function canManageUsers(role: Role): boolean {
  return role === "master";
}

export function areaForAdminRole(role: Role): RequestArea | null {
  switch (role) {
    case "master":
    case "solicitante":
      return null;
    case "admin_financeiro":
      return "financeiro";
    case "admin_manutencao":
      return "manutencao";
    case "admin_compras":
      return "compras";
    case "admin_rh":
      return "rh";
    default:
      return assertNever(role);
  }
}

export function defaultAreasForRole(role: Role, selected: RequestArea[]): RequestArea[] {
  const area = areaForAdminRole(role);
  if (role === "master") {
    return [...REQUEST_AREAS];
  }
  if (area) {
    return [area];
  }
  const granted = parseAreas(selected);
  if (granted.length === 0) {
    throw new Error("Selecione ao menos uma área de solicitação.");
  }
  return granted;
}

export function userAreas(user: User): RequestArea[] {
  if (user.role === "master") {
    return [...REQUEST_AREAS];
  }
  const area = areaForAdminRole(user.role);
  if (area) {
    return [area];
  }
  return user.areaIds;
}

export function canAccessArea(user: User, area: RequestArea): boolean {
  return userAreas(user).includes(area);
}

export function canSeeExpense(user: User, expense: Expense): boolean {
  if (!user.companyIds.includes(expense.company)) {
    return false;
  }
  if (!canAccessArea(user, expense.area)) {
    return false;
  }
  if (user.role === "solicitante") {
    return expense.requester === user.id;
  }
  return true;
}

export function canAdminArea(user: User, area: RequestArea): boolean {
  return user.role === "master" || areaForAdminRole(user.role) === area;
}

export function canAttachProof(user: User, expense: Expense): boolean {
  return canAdminArea(user, expense.area) && user.companyIds.includes(expense.company);
}

export function initialStatus(area: RequestArea): ExpenseStatus {
  switch (area) {
    case "financeiro":
    case "compras":
    case "rh":
      return "em_analise";
    case "manutencao":
      return "aberta";
    default:
      return assertNever(area);
  }
}

export function isReimbursement(type: ExpenseType): boolean {
  return type === "reembolso_colaborador" || type === "reembolso_cliente";
}

const APP_TIMEZONE = "America/Sao_Paulo";

export function todayIsoDate(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function daysFromToday(date: string): number {
  const today = Date.parse(`${todayIsoDate()}T00:00:00Z`);
  const target = Date.parse(`${date}T00:00:00Z`);
  return Math.round((target - today) / 86_400_000);
}

export function isoDatePlus(days: number): string {
  const date = new Date(`${todayIsoDate()}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function validateEventDate(type: ExpenseType, eventDate: string): void {
  if (!isReimbursement(type)) {
    return;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) {
    throw new Error("Informe a data do fato (quando o reembolso ou estorno aconteceu).");
  }
  const days = daysFromToday(eventDate);
  if (days > 0) {
    throw new Error("A data do fato não pode ser no futuro.");
  }
}

export function eventDateObservation(eventDate: string): string {
  const [year, month, day] = eventDate.split("-");
  return `Observação da data do fato: ${day}/${month}/${year}.`;
}

export function withEventDateObservation(description: string, type: ExpenseType, eventDate: string): string {
  if (!isReimbursement(type) || !eventDate) {
    return description.trim();
  }
  const note = eventDateObservation(eventDate);
  const body = description.trim();
  if (body.includes(note) || /data do fato/i.test(body)) {
    return body;
  }
  return body ? `${body}\n\n${note}` : note;
}

export function validatePaymentDate(type: ExpenseType, date: string, justification: string): void {
  const days = daysFromToday(date);
  if (days < 0) {
    throw new Error("A data de pagamento não pode ser no passado.");
  }
  if (isReimbursement(type)) {
    if (days > 5) {
      throw new Error("Reembolso deve ter data de pagamento em até 5 dias.");
    }
    if (!justification.trim()) {
      throw new Error("Informe a justificativa da data de pagamento.");
    }
    return;
  }
  if (days < 15 && !justification.trim()) {
    throw new Error("Datas com menos de 15 dias precisam de justificativa.");
  }
}

export function defaultPaymentDate(type: ExpenseType): string {
  return isoDatePlus(isReimbursement(type) ? 5 : 15);
}

export function screenForNewArea(area: RequestArea): Screen {
  switch (area) {
    case "financeiro":
      return "new-financeiro";
    case "manutencao":
      return "new-manutencao";
    case "compras":
      return "new-compras";
    case "rh":
      return "new-rh";
    default:
      return assertNever(area);
  }
}

export function homeScreen(role: Role): Screen {
  return role === "solicitante" ? "expenses" : "dashboard";
}

export function newRequestScreen(user: User): Screen {
  const area = REQUEST_AREAS.find((item) => canAccessArea(user, item));
  return area ? screenForNewArea(area) : homeScreen(user.role);
}

export function allowedActions(user: User, expense: Expense): RequestAction[] {
  if (!canSeeExpense(user, expense)) {
    return [];
  }
  const actions: RequestAction[] = [];
  const isOwner = expense.requester === user.id;
  const admin = canAdminArea(user, expense.area);

  if (expense.area === "manutencao" && isOwner) {
    if (expense.status === "aberta") {
      actions.push("progress", "complete", "cancel");
    }
    if (expense.status === "em_andamento") {
      actions.push("complete", "cancel");
    }
  }

  if (admin) {
    if (expense.area === "financeiro" || expense.area === "rh") {
      if (expense.status === "em_analise" || expense.status === "devolvido") {
        actions.push("docs", "approve", "reject");
      }
      if (expense.status === "aprovada") {
        actions.push("attach_proof");
      }
    }
    if (expense.area === "compras") {
      if (expense.status === "em_analise" || expense.status === "devolvido") {
        actions.push("docs", "approve", "reject");
      }
      if (expense.status === "aprovada") {
        actions.push("progress", "attach_proof");
      }
      if (expense.status === "em_andamento") {
        actions.push("complete", "attach_proof");
      }
      if (expense.status === "finalizada") {
        actions.push("attach_proof");
      }
    }
    if (expense.area === "manutencao") {
      if (expense.status === "aberta") {
        actions.push("progress", "complete", "reject");
      }
      if (expense.status === "em_andamento") {
        actions.push("complete", "reject", "attach_proof");
      }
      if (expense.status === "finalizada") {
        actions.push("attach_proof");
      }
    }
  }

  if (isOwner && expense.status === "devolvido") {
    actions.push("resubmit");
  }

  return [...new Set(actions)];
}

export function isAdminInbox(expense: Expense): boolean {
  switch (expense.area) {
    case "financeiro":
    case "rh":
      return expense.status === "em_analise";
    case "compras":
      return expense.status === "em_analise" || expense.status === "em_andamento";
    case "manutencao":
      return expense.status === "aberta" || expense.status === "em_andamento";
    default:
      return assertNever(expense.area);
  }
}

export function isWaitingPayment(expense: Expense): boolean {
  if (expense.payment_proof || expense.amount <= 0) {
    return false;
  }
  switch (expense.area) {
    case "financeiro":
    case "rh":
      return expense.status === "aprovada";
    case "compras":
      return expense.status === "aprovada" || expense.status === "em_andamento" || expense.status === "finalizada";
    case "manutencao":
      return expense.status === "finalizada";
    default:
      return assertNever(expense.area);
  }
}

export function isSolicitanteInbox(expense: Expense): boolean {
  switch (expense.status) {
    case "devolvido":
    case "aprovada":
    case "recusada":
    case "finalizada":
      return true;
    case "em_andamento":
      return expense.area === "compras";
    case "em_analise":
    case "aberta":
    case "cancelada":
      return false;
    default:
      return assertNever(expense.status);
  }
}

export function companyInbox(user: User, expenses: Expense[], companyId: string): Expense[] {
  return expenses.filter((expense) => {
    if (expense.company !== companyId) {
      return false;
    }
    if (!canSeeExpense(user, expense)) {
      return false;
    }
    if (user.role === "solicitante") {
      return isSolicitanteInbox(expense);
    }
    return isAdminInbox(expense);
  });
}

export function nextStatus(action: RequestAction, expense: Expense): ExpenseStatus {
  switch (action) {
    case "docs":
      return "devolvido";
    case "approve":
      return "aprovada";
    case "reject":
      return expense.area === "manutencao" ? "cancelada" : "recusada";
    case "resubmit":
      return expense.area === "manutencao" ? "aberta" : "em_analise";
    case "attach_proof":
      return expense.status;
    case "progress":
      return "em_andamento";
    case "complete":
      return "finalizada";
    case "cancel":
      return "cancelada";
    default:
      return assertNever(action);
  }
}
