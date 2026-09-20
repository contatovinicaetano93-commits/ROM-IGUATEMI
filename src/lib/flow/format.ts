import type {
  AuditAction,
  EmailLogKind,
  EmailLogStatus,
  ExpenseStatus,
  ExpenseType,
  PaymentMethod,
  RequestArea,
  Role,
} from "@/lib/flow/types";

export function money(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function parseDate(value: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day);
  }
  return new Date(value);
}

export function formatDate(value: string): string {
  const date = parseDate(value);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return date.toLocaleDateString("pt-BR");
}

export function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function shortId(id: string): string {
  return id.slice(-6).toUpperCase();
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return "RO";
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function daysUntil(date: string): number {
  return Math.ceil(
    (new Date(`${date}T23:59:59`).getTime() - Date.now()) / 86_400_000,
  );
}

export function maskMoneyInput(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  const cents = Number(digits || "0") / 100;
  return cents.toLocaleString("pt-BR", { minimumFractionDigits: 2 });
}

export function parseMoneyInput(raw: string): number {
  return Number(raw.replace(/\./g, "").replace(",", ".")) || 0;
}

export const STATUS_LABEL: Record<ExpenseStatus, string> = {
  em_analise: "Em análise",
  devolvido: "Devolvido",
  aprovada: "Aprovado",
  recusada: "Recusado",
  aberta: "Aberta",
  em_andamento: "Em andamento",
  finalizada: "Finalizada",
  cancelada: "Cancelada",
};

export const STATUS_CLASS: Record<ExpenseStatus, string> = {
  em_analise: "status-violet",
  devolvido: "status-amber",
  aprovada: "status-emerald",
  recusada: "status-red",
  aberta: "status-blue",
  em_andamento: "status-cyan",
  finalizada: "status-emerald",
  cancelada: "status-red",
};

export const ROLE_LABEL: Record<Role, string> = {
  master: "Master",
  admin_financeiro: "Admin financeiro",
  admin_manutencao: "Admin manutenção",
  admin_compras: "Admin compras",
  admin_rh: "Admin RH",
  solicitante: "Solicitante",
};

export const ROLE_CLASS: Record<Role, string> = {
  master: "role-admin",
  admin_financeiro: "role-financeiro",
  admin_manutencao: "role-admin",
  admin_compras: "role-admin",
  admin_rh: "role-admin",
  solicitante: "role-solicitante",
};

export const AREA_LABEL: Record<RequestArea, string> = {
  financeiro: "Financeiro",
  manutencao: "Manutenção",
  compras: "Compras",
  rh: "RH",
};

export const EXPENSE_TYPE_LABEL: Record<ExpenseType, string> = {
  fornecedor: "Pagamento fornecedor",
  reembolso_colaborador: "Reembolso funcionário/colaborador",
  reembolso_cliente: "Reembolso/Estorno cliente",
  outros: "Outros",
  chamado: "Chamado de manutenção",
  pedido: "Pedido de compras",
  ferias: "Férias",
  admissao: "Admissão",
  desligamento: "Desligamento",
  salario: "Alteração salarial",
  beneficio: "Benefício",
  atestado: "Atestado",
  uniforme: "Uniforme",
};

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  pix: "Chave instantânea",
  ted: "Conta bancária",
  boleto: "Código de barras",
};

export const CATEGORY_COLOR: Record<string, string> = {
  Viagem: "#6366F1",
  Alimentação: "#F59E0B",
  Escritório: "#EC4899",
  Software: "#10B981",
  Outros: "#71717A",
};

export const AUDIT_LABEL: Record<AuditAction, string> = {
  CREATE_EXPENSE: "Criou solicitação",
  REQUEST_DOCUMENTATION: "Devolveu para ajustes",
  APPROVE_EXPENSE: "Aprovou solicitação",
  REJECT_EXPENSE: "Recusou solicitação",
  UPDATE_EXPENSE: "Atualizou solicitação",
  DELETE_EXPENSE: "Excluiu solicitação",
  CREATE_USER: "Criou acesso de usuário",
  UPDATE_USER: "Atualizou acesso de usuário",
  REVOKE_USER: "Excluiu acesso de usuário",
  ATTACH_PROOF: "Anexou recibo de pagamento",
  PROGRESS_EXPENSE: "Colocou em andamento",
  COMPLETE_EXPENSE: "Finalizou solicitação",
  CANCEL_EXPENSE: "Cancelou solicitação",
};

export const EMAIL_KIND_LABEL: Record<EmailLogKind, string> = {
  invite: "Convite de acesso",
  expense_created: "Nova solicitação",
  expense_status: "Movimentação de solicitação",
};

export const EMAIL_STATUS_LABEL: Record<EmailLogStatus, string> = {
  sent: "Enviado",
  failed: "Falhou",
};

export const KINDNESS_PHRASES = [
  "Que bom tê-lo aqui!",
  "Que alegria vê-lo usando o Flow!",
  "Um ótimo dia! Em que podemos ajudar hoje?",
  "Você é uma pessoa fantástica, estamos aqui por você!",
  "Tenha um excelente dia de realizações!",
  "Bem-vindo de volta!",
  "Desejamos uma excelente experiência no ROM Flow hoje.",
];

export function cls(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
