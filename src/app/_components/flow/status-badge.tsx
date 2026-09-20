"use client";

import {
  CheckCircle2,
  Clock3,
  FileWarning,
  Hammer,
  Send,
  XCircle,
} from "lucide-react";
import { STATUS_CLASS, STATUS_LABEL } from "@/lib/flow/format";
import type { ExpenseStatus } from "@/lib/flow/types";
import { assertNever } from "@/lib/flow/types";

function StatusIcon({ status }: { status: ExpenseStatus }) {
  switch (status) {
    case "em_analise":
      return <Clock3 size={13} />;
    case "devolvido":
      return <FileWarning size={13} />;
    case "aprovada":
      return <CheckCircle2 size={13} />;
    case "recusada":
    case "cancelada":
      return <XCircle size={13} />;
    case "aberta":
      return <Send size={13} />;
    case "em_andamento":
      return <Hammer size={13} />;
    case "finalizada":
      return <CheckCircle2 size={13} />;
    default:
      return assertNever(status);
  }
}

export function StatusBadge({
  status,
  className,
}: {
  status: ExpenseStatus;
  className?: string;
}) {
  return (
    <span className={`status-badge ${STATUS_CLASS[status]} ${className ?? ""}`.trim()}>
      <StatusIcon status={status} />
      {STATUS_LABEL[status]}
    </span>
  );
}
