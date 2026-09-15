"use client";

import { cls } from "@/lib/flow/format";
import type { Expense, FinanceAction, RequestAction } from "@/lib/flow/types";

export function MaintenanceStatusActions({
  expense,
  actions,
  busy,
  onAction,
}: {
  expense: Expense;
  actions: RequestAction[];
  busy?: boolean;
  onAction: (action: FinanceAction) => void;
}) {
  const canProgress = actions.includes("progress");
  const canComplete = actions.includes("complete");
  const canCancel = actions.includes("cancel");

  return (
    <div className="maintenance-status-actions">
      <button
        type="button"
        className={cls(
          "maintenance-status-btn",
          expense.status === "em_andamento" && "current",
          canProgress && "next",
        )}
        disabled={busy || !canProgress}
        onClick={() => onAction("progress")}
      >
        Em andamento
      </button>
      <button
        type="button"
        className={cls(
          "maintenance-status-btn",
          expense.status === "finalizada" && "current",
          canComplete && "next",
        )}
        disabled={busy || !canComplete}
        onClick={() => onAction("complete")}
      >
        Finalizado
      </button>
      <button
        type="button"
        className={cls(
          "maintenance-status-btn",
          expense.status === "cancelada" && "current",
          canCancel && "cancel",
        )}
        disabled={busy || !canCancel}
        onClick={() => onAction("cancel")}
      >
        Cancelado
      </button>
    </div>
  );
}
