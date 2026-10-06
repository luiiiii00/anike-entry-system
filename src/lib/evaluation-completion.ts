/**
 * Regla de finalización (servidor): una evaluación sólo puede persistirse como
 * `completed` si el cuestionario activo está completo. Incompleta = BORRADOR,
 * sin importar el status/decision que envíe el navegador.
 */
export type CompletionCheck =
  | { ok: true }
  | {
      ok: false;
      code:
        | "decision_required"
        | "asset_required"
        | "incomplete_cannot_complete"
        | "trade_rejected_cannot_register"
        | "conditional_cannot_register";
    };

export function checkCompletion(input: {
  status: "draft" | "completed";
  decision?: "registrado" | "no_trade" | null | undefined;
  asset?: string | null | undefined;
  complete: boolean;
  rejected: boolean;
  finalState: string;
}): CompletionCheck {
  if (input.status !== "completed") return { ok: true };
  if (!input.decision) return { ok: false, code: "decision_required" };
  if (!input.asset?.trim()) return { ok: false, code: "asset_required" };
  if (!input.complete || input.finalState === "BORRADOR")
    return { ok: false, code: "incomplete_cannot_complete" };
  if (input.decision === "registrado") {
    if (input.rejected) return { ok: false, code: "trade_rejected_cannot_register" };
    if (input.finalState !== "APROBADA") return { ok: false, code: "conditional_cannot_register" };
  }
  return { ok: true };
}
