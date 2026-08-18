import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatDateTime } from "@/lib/access";
import { fetchAllProfiles } from "@/lib/admin";
import {
  METHOD_LABEL,
  PAYMENT_STATUS_BADGE,
  PAYMENT_STATUS_LABEL,
  REJECTION_REASONS,
  fetchAllPaymentRequests,
  fetchPlans,
  fetchPaymentSettings,
  fetchPromoStatus,
  formatGs,
  paymentError,
  savePaymentSettings,
  savePlan,
  signedReceiptUrl,
  type PaymentPlan,
  type PaymentRequest,
} from "@/lib/payments";
import { approvePaymentFn, rejectPaymentFn } from "@/lib/payments.functions";
import { cn } from "@/lib/utils";

type Tab = "PENDING" | "APPROVED" | "REJECTED";
type Modal =
  | { kind: "approve"; row: PaymentRequest }
  | { kind: "reject"; row: PaymentRequest }
  | null;

export function AdminPayments() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("PENDING");
  const [modal, setModal] = useState<Modal>(null);

  const payments = useQuery({
    queryKey: ["admin-payments"],
    queryFn: fetchAllPaymentRequests,
    refetchInterval: 10_000,
    staleTime: 0,
  });
  const profiles = useQuery({ queryKey: ["admin-users"], queryFn: fetchAllProfiles });
  const promo = useQuery({ queryKey: ["promo-status"], queryFn: fetchPromoStatus });

  useEffect(() => {
    const channel = supabase
      .channel("admin-payments-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "payment_requests" }, () => {
        void queryClient.invalidateQueries({ queryKey: ["admin-payments"] });
        void queryClient.invalidateQueries({ queryKey: ["promo-status"] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const rows = payments.data ?? [];
  const people = useMemo(() => {
    const map: Record<string, { name: string; email: string }> = {};
    for (const p of profiles.data ?? [])
      map[p.id] = {
        name: p.full_name ?? p.display_name ?? "—",
        email: p.email ?? "—",
      };
    return map;
  }, [profiles.data]);

  const totals = useMemo(() => {
    const base = { PENDING: 0, APPROVED: 0, REJECTED: 0 } as Record<Tab, number>;
    const money = { PENDING: 0, APPROVED: 0, REJECTED: 0 } as Record<Tab, number>;
    for (const r of rows) {
      const s = r.status as Tab;
      if (base[s] === undefined) continue;
      base[s] += 1;
      money[s] += r.amount;
    }
    return { base, money };
  }, [rows]);

  const filtered = rows.filter((r) => r.status === tab);

  const act = useMutation({
    mutationFn: async (fn: () => Promise<unknown>) => fn(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-payments"] });
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      queryClient.invalidateQueries({ queryKey: ["admin-audit"] });
      queryClient.invalidateQueries({ queryKey: ["promo-status"] });
      setModal(null);
    },
    onError: (e) => toast.error(paymentError(e)),
  });

  async function openReceipt(row: PaymentRequest) {
    if (!row.receipt_path) {
      toast.error("Esta solicitud no tiene comprobante todavía.");
      return;
    }
    try {
      const url = await signedReceiptUrl(row.receipt_path);
      window.open(url, "_blank", "noopener");
    } catch (e) {
      toast.error(paymentError(e));
    }
  }

  return (
    <section className="mt-8">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="label-mono">Pagos</p>
          <h2 className="font-display text-xl font-semibold">Verificación de transferencias</h2>
        </div>
        <button
          onClick={() => payments.refetch()}
          className="flex min-h-11 items-center gap-2 rounded-xl border border-border bg-surface-2 px-4 text-sm"
        >
          <RefreshCw className={cn("h-4 w-4", payments.isFetching && "animate-spin")} /> Actualizar
        </button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card label="Pendientes" value={`${totals.base.PENDING}`} sub={formatGs(totals.money.PENDING)} tone="text-warn" />
        <Card label="Aprobados" value={`${totals.base.APPROVED}`} sub={formatGs(totals.money.APPROVED)} tone="text-ok" />
        <Card label="Rechazados" value={`${totals.base.REJECTED}`} sub={formatGs(totals.money.REJECTED)} tone="text-danger" />
        <Card
          label="Cupos lanzamiento"
          value={`${Math.max((promo.data?.total ?? 0) - (promo.data?.taken ?? 0), 0)} / ${promo.data?.total ?? 0}`}
          sub="disponibles"
          tone="text-primary"
        />
      </div>

      <div className="panel mt-4 p-4 sm:p-5">
        <div className="flex flex-wrap gap-2">
          {(["PENDING", "APPROVED", "REJECTED"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "min-h-10 rounded-xl border px-3 text-xs font-semibold tracking-wide",
                tab === t
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-border bg-surface-2 text-muted-foreground",
              )}
            >
              {PAYMENT_STATUS_LABEL[t]} ({totals.base[t]})
            </button>
          ))}
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                {["Usuario", "Email", "Plan", "Monto", "Fecha", "Estado", "Comprobante", "Acciones"].map(
                  (h) => (
                    <th key={h} className="label-mono pb-3 pr-3 font-normal">
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-b border-border/60">
                  <td className="py-3 pr-3 font-medium">{people[r.user_id]?.name ?? "—"}</td>
                  <td className="py-3 pr-3 text-muted-foreground">{people[r.user_id]?.email ?? "—"}</td>
                  <td className="py-3 pr-3">{r.plan_name}</td>
                  <td className="py-3 pr-3 tabular-nums">{formatGs(r.amount)}</td>
                  <td className="py-3 pr-3 text-muted-foreground tabular-nums">
                    {formatDateTime(r.created_at)}
                  </td>
                  <td className="py-3 pr-3">
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold",
                        PAYMENT_STATUS_BADGE[r.status],
                      )}
                    >
                      {PAYMENT_STATUS_LABEL[r.status]}
                    </span>
                  </td>
                  <td className="py-3 pr-3">
                    <button
                      onClick={() => openReceipt(r)}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary disabled:opacity-40"
                      disabled={!r.receipt_path}
                    >
                      <ExternalLink className="h-3.5 w-3.5" /> VER COMPROBANTE
                    </button>
                  </td>
                  <td className="py-3">
                    {r.status === "PENDING" ? (
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          onClick={() => setModal({ kind: "approve", row: r })}
                          className="min-h-9 rounded-lg border border-ok/40 bg-ok/10 px-2.5 text-[11px] font-semibold text-ok"
                        >
                          APROBAR PAGO
                        </button>
                        <button
                          onClick={() => setModal({ kind: "reject", row: r })}
                          className="min-h-9 rounded-lg border border-danger/40 bg-danger/10 px-2.5 text-[11px] font-semibold text-danger"
                        >
                          RECHAZAR PAGO
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {r.reviewed_at ? formatDateTime(r.reviewed_at) : "—"}
                        {r.rejection_reason ? ` · ${r.rejection_reason}` : ""}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-muted-foreground">
                    {payments.isLoading ? "Cargando…" : "Sin pagos en esta vista."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <PaymentModal
          modal={modal}
          person={people[modal.row.user_id]}
          busy={act.isPending}
          onClose={() => setModal(null)}
          onReceipt={() => openReceipt(modal.row)}
          onApprove={() =>
            act.mutate(async () => {
              await approvePaymentFn({ data: { request: modal.row.id } });
              toast.success("Pago aprobado y acceso activado.");
            })
          }
          onReject={(reason) =>
            act.mutate(async () => {
              await rejectPaymentFn({ data: { request: modal.row.id, reason } });
              toast.success("Pago rechazado.");
            })
          }
        />
      )}

      <PaymentConfig />
    </section>
  );
}

function Card({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: string;
}) {
  return (
    <div className="panel p-4">
      <p className="label-mono">{label}</p>
      <p className={cn("mt-1 font-display text-2xl font-semibold tabular-nums", tone)}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground tabular-nums">{sub}</p>}
    </div>
  );
}

function PaymentModal({
  modal,
  person,
  busy,
  onClose,
  onApprove,
  onReject,
  onReceipt,
}: {
  modal: NonNullable<Modal>;
  person?: { name: string; email: string } | undefined;
  busy: boolean;
  onClose: () => void;
  onApprove: () => void;
  onReject: (reason: string) => void;
  onReceipt: () => void;
}) {
  const [reason, setReason] = useState<string>(REJECTION_REASONS[0]);
  const [custom, setCustom] = useState("");
  const r = modal.row;

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-background/80 p-4 backdrop-blur-sm sm:items-center">
      <div className="panel w-full max-w-md p-5">
        <p className="label-mono">{modal.kind === "approve" ? "Aprobar pago" : "Rechazar pago"}</p>
        <h3 className="mt-1 font-display text-lg font-semibold">
          {modal.kind === "approve"
            ? "¿Confirmaste que el comprobante corresponde al monto y plan seleccionados?"
            : "Motivo del rechazo"}
        </h3>

        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="label-mono">Usuario</dt>
            <dd className="mt-1">{person?.name ?? "—"}</dd>
          </div>
          <div>
            <dt className="label-mono">Email</dt>
            <dd className="mt-1 break-all">{person?.email ?? "—"}</dd>
          </div>
          <div>
            <dt className="label-mono">Plan</dt>
            <dd className="mt-1">{r.plan_name}</dd>
          </div>
          <div>
            <dt className="label-mono">Monto</dt>
            <dd className="mt-1 tabular-nums">{formatGs(r.amount)}</dd>
          </div>
          <div className="col-span-2">
            <dt className="label-mono">Fecha</dt>
            <dd className="mt-1 tabular-nums">{formatDateTime(r.created_at)}</dd>
          </div>
        </dl>

        <button
          onClick={onReceipt}
          disabled={!r.receipt_path}
          className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-border bg-surface-2 text-sm disabled:opacity-40"
        >
          <ExternalLink className="h-4 w-4" /> VER COMPROBANTE
        </button>

        {modal.kind === "reject" && (
          <div className="mt-4">
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="min-h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-primary"
            >
              {REJECTION_REASONS.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
            {reason === "Otro." && (
              <input
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                placeholder="Describe el motivo"
                className="mt-2 min-h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-primary"
              />
            )}
          </div>
        )}

        <div className="mt-5 flex gap-2">
          <button
            onClick={onClose}
            className="min-h-12 flex-1 rounded-xl border border-border bg-surface-2 text-sm"
          >
            CANCELAR
          </button>
          <button
            onClick={() =>
              modal.kind === "approve"
                ? onApprove()
                : onReject(reason === "Otro." ? custom.trim() || "Otro." : reason)
            }
            disabled={busy}
            className={cn(
              "inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl text-sm font-semibold tracking-wide disabled:opacity-50",
              modal.kind === "approve"
                ? "bg-primary text-primary-foreground"
                : "bg-danger text-background",
            )}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {modal.kind === "approve" ? "CONFIRMAR APROBACIÓN" : "CONFIRMAR RECHAZO"}
          </button>
        </div>
      </div>
    </div>
  );
}

function PaymentConfig() {
  const queryClient = useQueryClient();
  const settings = useQuery({ queryKey: ["payment-settings"], queryFn: fetchPaymentSettings });
  const plans = useQuery({ queryKey: ["payment-plans"], queryFn: fetchPlans });

  const [form, setForm] = useState({
    bank_name: "",
    holder_name: "",
    alias: "",
    account_number: "",
    instructions: "",
  });

  useEffect(() => {
    const s = settings.data;
    if (!s) return;
    setForm({
      bank_name: s.bank_name,
      holder_name: s.holder_name,
      alias: s.alias,
      account_number: s.account_number,
      instructions: s.instructions,
    });
  }, [settings.data]);

  const saveBank = useMutation({
    mutationFn: () => savePaymentSettings(form),
    onSuccess: () => {
      toast.success("Datos bancarios guardados.");
      queryClient.invalidateQueries({ queryKey: ["payment-settings"] });
    },
    onError: (e) => toast.error(paymentError(e)),
  });

  const savePlanRow = useMutation({
    mutationFn: (input: { key: string; patch: Record<string, unknown> }) =>
      savePlan(input.key, input.patch),
    onSuccess: () => {
      toast.success("Plan actualizado. Solo afecta a nuevas solicitudes.");
      queryClient.invalidateQueries({ queryKey: ["payment-plans"] });
      queryClient.invalidateQueries({ queryKey: ["promo-status"] });
    },
    onError: (e) => toast.error(paymentError(e)),
  });

  return (
    <div className="panel mt-6 p-4 sm:p-5">
      <p className="label-mono">Configuración de pagos</p>
      <h3 className="mt-1 font-display text-lg font-semibold">Datos bancarios</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="Banco" value={form.bank_name} onChange={(v) => setForm({ ...form, bank_name: v })} />
        <Field label="Titular" value={form.holder_name} onChange={(v) => setForm({ ...form, holder_name: v })} />
        <Field label="Alias" value={form.alias} onChange={(v) => setForm({ ...form, alias: v })} />
        <Field
          label="Número de cuenta"
          value={form.account_number}
          onChange={(v) => setForm({ ...form, account_number: v })}
        />
        <div className="sm:col-span-2">
          <Field
            label="Instrucciones adicionales (opcional)"
            value={form.instructions}
            onChange={(v) => setForm({ ...form, instructions: v })}
          />
        </div>
      </div>
      <button
        onClick={() => saveBank.mutate()}
        disabled={saveBank.isPending}
        className="mt-4 min-h-12 w-full rounded-xl bg-primary text-sm font-semibold tracking-wide text-primary-foreground disabled:opacity-50 sm:w-auto sm:px-6"
      >
        GUARDAR DATOS BANCARIOS
      </button>

      <h3 className="mt-7 font-display text-lg font-semibold">Planes</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Los cambios afectan solo a nuevas solicitudes; las licencias ya aprobadas no se modifican.
      </p>
      <div className="mt-3 space-y-3">
        {(plans.data ?? []).map((p) => (
          <PlanEditor
            key={p.key}
            plan={p}
            busy={savePlanRow.isPending}
            onSave={(patch) => savePlanRow.mutate({ key: p.key, patch })}
          />
        ))}
      </div>
    </div>
  );
}

function PlanEditor({
  plan,
  busy,
  onSave,
}: {
  plan: PaymentPlan;
  busy: boolean;
  onSave: (patch: Record<string, unknown>) => void;
}) {
  const [name, setName] = useState(plan.name);
  const [description, setDescription] = useState(plan.description);
  const [price, setPrice] = useState(String(plan.price_pyg));
  const [days, setDays] = useState(plan.duration_days === null ? "" : String(plan.duration_days));
  const [limit, setLimit] = useState(plan.promo_limit === null ? "" : String(plan.promo_limit));
  const [active, setActive] = useState(plan.is_active);

  useEffect(() => {
    setName(plan.name);
    setDescription(plan.description);
    setPrice(String(plan.price_pyg));
    setDays(plan.duration_days === null ? "" : String(plan.duration_days));
    setLimit(plan.promo_limit === null ? "" : String(plan.promo_limit));
    setActive(plan.is_active);
  }, [plan]);

  return (
    <div className="rounded-xl border border-border bg-surface-2 p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={`Nombre (${plan.key})`} value={name} onChange={setName} />
        <Field label="Precio (Gs)" value={price} onChange={setPrice} type="number" />
        <div className="sm:col-span-2">
          <Field label="Descripción" value={description} onChange={setDescription} />
        </div>
        {plan.access_plan === "PRO" && (
          <Field label="Duración (días)" value={days} onChange={setDays} type="number" />
        )}
        {plan.is_promo && (
          <Field label="Cupos de la promoción" value={limit} onChange={setLimit} type="number" />
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          Plan visible
        </label>
        <button
          onClick={() =>
            onSave({
              name,
              description,
              price_pyg: Math.max(0, Math.round(Number(price) || 0)),
              ...(plan.access_plan === "PRO"
                ? { duration_days: Math.max(1, Math.round(Number(days) || 1)) }
                : {}),
              ...(plan.is_promo
                ? { promo_limit: Math.max(0, Math.round(Number(limit) || 0)) }
                : {}),
              is_active: active,
            })
          }
          disabled={busy}
          className="ml-auto min-h-10 rounded-xl border border-border bg-surface px-4 text-xs font-semibold disabled:opacity-50"
        >
          GUARDAR PLAN
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="label-mono">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 min-h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-primary"
      />
    </label>
  );
}
