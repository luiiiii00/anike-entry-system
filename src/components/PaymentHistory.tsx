import { useQuery } from "@tanstack/react-query";
import { formatDateTime } from "@/lib/access";
import {
  METHOD_LABEL,
  PAYMENT_STATUS_BADGE,
  PAYMENT_STATUS_LABEL,
  fetchMyPaymentRequests,
  formatGs,
} from "@/lib/payments";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

export function PaymentHistory() {
  const { user } = useAuth();
  const payments = useQuery({
    queryKey: ["my-payments", user?.id],
    queryFn: fetchMyPaymentRequests,
    enabled: !!user,
  });

  const rows = payments.data ?? [];

  return (
    <div className="panel mt-4 p-4">
      <p className="label-mono">Historial de pagos</p>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          {payments.isLoading ? "Cargando…" : "Todavía no registraste pagos."}
        </p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                {["Fecha", "Plan", "Monto", "Método", "Estado"].map((h) => (
                  <th key={h} className="label-mono pb-2 pr-3 font-normal">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border/60">
                  <td className="py-2.5 pr-3 tabular-nums text-muted-foreground">
                    {formatDateTime(r.created_at)}
                  </td>
                  <td className="py-2.5 pr-3">{r.plan_name}</td>
                  <td className="py-2.5 pr-3 tabular-nums">{formatGs(r.amount)}</td>
                  <td className="py-2.5 pr-3 text-muted-foreground">
                    {METHOD_LABEL[r.payment_method] ?? r.payment_method}
                  </td>
                  <td className="py-2.5">
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold",
                        PAYMENT_STATUS_BADGE[r.status],
                      )}
                    >
                      {PAYMENT_STATUS_LABEL[r.status]}
                    </span>
                    {r.status === "REJECTED" && r.rejection_reason && (
                      <span className="block text-xs text-muted-foreground">
                        {r.rejection_reason}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
