import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Check, Copy, Flame, Loader2, Upload } from "lucide-react";
import { Wordmark } from "@/components/brand";
import { ContentProtection } from "@/components/ContentProtection";
import { useProfile } from "@/hooks/useProfile";
import { formatDateTime } from "@/lib/access";
import {
  cancelMyPaymentRequest,
  createPaymentRequest,
  fetchMyPaymentRequests,
  fetchPaymentSettings,
  fetchPlans,
  fetchPromoStatus,
  formatGs,
  paymentError,
  planDurationLabel,
  uploadReceipt,
  type PaymentPlan,
} from "@/lib/payments";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/activar")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Activa tu acceso — ANIKE EJEPIKA" },
      {
        name: "description",
        content:
          "Elige tu plan de acceso a ANIKE EJEPIKA, realiza la transferencia y sube tu comprobante.",
      },
      { property: "og:title", content: "Activa tu acceso — ANIKE EJEPIKA" },
      {
        property: "og:description",
        content: "Planes de 7 días, 30 días y de por vida. Pago por transferencia bancaria.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ActivarPage,
});

function ActivarPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, loading } = useProfile();
  const [selected, setSelected] = useState<PaymentPlan | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const transferRef = useRef<HTMLElement>(null);

  const selectPlan = (plan: PaymentPlan) => {
    setSelected(plan);
    // Dejar que el DOM renderice la sección antes de deslizar
    setTimeout(() => {
      transferRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  };

  useEffect(() => {
    if (!loading && !user) router.navigate({ to: "/login", replace: true });
  }, [loading, user, router]);

  const plans = useQuery({ queryKey: ["payment-plans"], queryFn: fetchPlans, enabled: !!user });
  const settings = useQuery({
    queryKey: ["payment-settings"],
    queryFn: fetchPaymentSettings,
    enabled: !!user,
  });
  const promo = useQuery({
    queryKey: ["promo-status"],
    queryFn: fetchPromoStatus,
    enabled: !!user,
    refetchInterval: 30_000,
  });
  const requests = useQuery({
    queryKey: ["my-payments", user?.id],
    queryFn: fetchMyPaymentRequests,
    enabled: !!user,
    refetchInterval: 15_000,
  });

  const pending = (requests.data ?? []).find((r) => r.status === "PENDING") ?? null;
  const lastRejected = (requests.data ?? []).find((r) => r.status === "REJECTED") ?? null;

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["my-payments"] });
    void queryClient.invalidateQueries({ queryKey: ["promo-status"] });
  };

  const create = useMutation({
    mutationFn: (plan: PaymentPlan) => createPaymentRequest(plan.key),
    onSuccess: () => {
      toast.success("Solicitud creada. Realiza la transferencia y sube tu comprobante.");
      refresh();
    },
    onError: (e) => toast.error(paymentError(e)),
  });

  const upload = useMutation({
    mutationFn: (file: File) => uploadReceipt(user!.id, pending!.id, file),
    onSuccess: () => {
      toast.success("Comprobante enviado. El administrador verificará tu pago.");
      refresh();
    },
    onError: (e) => toast.error(paymentError(e)),
  });

  const cancel = useMutation({
    mutationFn: () => cancelMyPaymentRequest(pending!.id),
    onSuccess: () => {
      toast.success("Solicitud cancelada.");
      setSelected(null);
      refresh();
    },
    onError: (e) => toast.error(paymentError(e)),
  });

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" />
      </div>
    );
  }

  const all = plans.data ?? [];
  const regular = all.filter((p) => !p.is_promo && p.is_active);
  const launch = all.find((p) => p.is_promo && p.is_active) ?? null;
  const slots = promo.data ?? { taken: 0, total: 0 };
  const slotsLeft = Math.max(slots.total - slots.taken, 0);
  const bank = settings.data;

  const activePlan = pending ? (all.find((p) => p.key === pending.plan_key) ?? null) : selected;

  async function copyAlias() {
    if (!bank?.alias) return;
    try {
      await navigator.clipboard.writeText(bank.alias);
      toast.success("Alias copiado.");
    } catch {
      toast.error("No se pudo copiar el alias.");
    }
  }

  return (
    <div className="grid-noise min-h-screen px-4 py-8 sm:px-6">
      <ContentProtection />
      <div className="mx-auto w-full max-w-3xl">
        <button
          onClick={() => router.navigate({ to: "/estado" })}
          className="mb-5 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Volver al estado
        </button>

        <Wordmark />

        <header className="mt-6">
          <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
            ACTIVA TU ACCESO A ANIKE EJEPIKA
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Tu cuenta está creada, pero todavía no tienes un acceso activo.
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Analiza. Evalúa. Decide. Registra. Mejora.
          </p>
        </header>

        {lastRejected && !pending && (
          <div className="mt-5 rounded-xl border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
            <p className="font-semibold">🔴 PAGO RECHAZADO</p>
            <p className="mt-1">
              Motivo: {lastRejected.rejection_reason ?? "No especificado."} Puedes generar una nueva
              solicitud.
            </p>
          </div>
        )}

        {/* ---------- PASO 1: PLANES ---------- */}
        {!pending && (
          <section className="mt-6">
            <p className="label-mono">1 · Elige tu plan</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              {regular.map((plan) => (
                <PlanCard
                  key={plan.key}
                  plan={plan}
                  selected={selected?.key === plan.key}
                  onSelect={() => selectPlan(plan)}
                />
              ))}
            </div>

            {launch && (
              <div
                className={cn("panel mt-4 border-primary/50 p-4", slotsLeft === 0 && "opacity-60")}
              >
                <div className="flex items-center gap-2 text-primary">
                  <Flame className="h-4 w-4" />
                  <p className="label-mono !text-primary">🔥 OFERTA DE LANZAMIENTO</p>
                </div>
                <p className="mt-2 font-display text-xl font-semibold">LIFETIME</p>
                <p className="mt-1 text-sm text-muted-foreground line-through">
                  Valor normal: 420.000 Gs
                </p>
                <p className="font-display text-2xl font-semibold text-primary">
                  Precio de lanzamiento: {formatGs(launch.price_pyg)}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">Primeros 5 usuarios.</p>
                <p className="mt-2 text-sm font-semibold tabular-nums">
                  {slotsLeft === 0
                    ? "PROMOCIÓN AGOTADA"
                    : `${slotsLeft} de ${slots.total} cupos disponibles`}
                </p>
                {slotsLeft > 0 && (
                  <button
                    onClick={() => selectPlan(launch)}
                    className={cn(
                      "mt-3 min-h-12 w-full rounded-xl text-sm font-semibold tracking-wide",
                      selected?.key === launch.key
                        ? "bg-primary text-primary-foreground"
                        : "border border-primary/60 text-primary",
                    )}
                  >
                    {selected?.key === launch.key ? "PLAN SELECCIONADO" : "SOLICITAR ACCESO"}
                  </button>
                )}
              </div>
            )}
          </section>
        )}

        {/* ---------- PASO 2: TRANSFERENCIA ---------- */}
        {activePlan && (
          <section className="panel mt-6 p-4 sm:p-5">
            <p className="label-mono">2 · Pago por transferencia</p>
            <div className="mt-3 flex flex-wrap items-baseline gap-2">
              <p className="font-display text-xl font-semibold">{activePlan.name}</p>
              <p className="font-display text-xl font-semibold text-primary">
                {formatGs(pending?.amount ?? activePlan.price_pyg)}
              </p>
              <span className="text-sm text-muted-foreground">
                · {planDurationLabel(activePlan)}
              </span>
            </div>

            {bank && (bank.alias || bank.bank_name || bank.holder_name) ? (
              <div className="mt-4 rounded-xl border border-border bg-surface-2 p-4">
                <p className="label-mono">Alias</p>
                <div className="mt-1 flex items-center gap-2">
                  <p className="font-display text-lg font-semibold break-all">
                    {bank.alias || "—"}
                  </p>
                  <button
                    onClick={copyAlias}
                    className="ml-auto inline-flex min-h-10 items-center gap-2 rounded-xl border border-border bg-surface px-3 text-xs font-semibold"
                  >
                    <Copy className="h-3.5 w-3.5" /> COPIAR ALIAS
                  </button>
                </div>
                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                  <Info label="Banco" value={bank.bank_name} />
                  <Info label="Titular" value={bank.holder_name} />
                  <Info label="Nº de cuenta" value={bank.account_number} />
                </dl>
                {bank.instructions && (
                  <p className="mt-3 text-sm text-muted-foreground">{bank.instructions}</p>
                )}
              </div>
            ) : (
              <p className="mt-4 rounded-xl border border-warn/40 bg-warn/10 p-4 text-sm text-warn">
                El administrador todavía no cargó los datos bancarios. Vuelve en unos minutos.
              </p>
            )}

            <ol className="mt-4 space-y-1.5 text-sm text-muted-foreground">
              {[
                "Selecciona tu plan.",
                "Realiza la transferencia por el monto exacto.",
                "Guarda el comprobante.",
                "Sube el comprobante.",
                "Envía la solicitud.",
                "El administrador verificará el pago.",
                "Una vez aprobado, se activará tu acceso.",
              ].map((step, i) => (
                <li key={step} className="flex gap-2">
                  <span className="tabular-nums text-primary">{i + 1}.</span>
                  {step}
                </li>
              ))}
            </ol>
            <p className="mt-3 rounded-xl border border-border bg-surface-2 p-3 text-sm">
              El acceso no se activa automáticamente. Será habilitado después de verificar el
              comprobante.
            </p>

            {/* ---------- PASO 3: SOLICITUD / COMPROBANTE ---------- */}
            {!pending ? (
              <button
                onClick={() => create.mutate(activePlan)}
                disabled={create.isPending}
                className="mt-5 inline-flex min-h-13 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold tracking-wide text-primary-foreground disabled:opacity-50"
              >
                {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                SOLICITAR ACCESO
              </button>
            ) : (
              <div className="mt-5">
                <div className="rounded-xl border border-warn/40 bg-warn/10 p-4 text-sm text-warn">
                  <p className="font-semibold">🟡 PAGO PENDIENTE</p>
                  <p className="mt-1">
                    {pending.receipt_path
                      ? "Estamos verificando tu comprobante."
                      : "Sube tu comprobante para que podamos verificar el pago."}
                  </p>
                  <p className="mt-1 tabular-nums opacity-80">
                    Solicitud del {formatDateTime(pending.created_at)}
                  </p>
                </div>

                <input
                  ref={fileInput}
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) upload.mutate(file);
                    e.target.value = "";
                  }}
                />
                <button
                  onClick={() => fileInput.current?.click()}
                  disabled={upload.isPending}
                  className="mt-4 inline-flex min-h-13 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold tracking-wide text-primary-foreground disabled:opacity-50"
                >
                  {upload.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : pending.receipt_path ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  {pending.receipt_path ? "REEMPLAZAR COMPROBANTE" : "SUBIR COMPROBANTE"}
                </button>
                <p className="mt-2 text-xs text-muted-foreground">
                  Formatos: JPG, JPEG, PNG o PDF.
                </p>

                <button
                  onClick={() => cancel.mutate()}
                  disabled={cancel.isPending}
                  className="mt-3 min-h-12 w-full rounded-xl border border-border bg-surface-2 text-sm text-muted-foreground disabled:opacity-50"
                >
                  CANCELAR SOLICITUD
                </button>
              </div>
            )}
          </section>
        )}

        <p className="mt-8 text-center text-xs text-muted-foreground">
          Antes de entrar al mercado, valida tu idea.
        </p>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="label-mono">{label}</dt>
      <dd className="mt-1 break-all">{value || "—"}</dd>
    </div>
  );
}

function PlanCard({
  plan,
  selected,
  onSelect,
}: {
  plan: PaymentPlan;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <div
      className={cn("panel flex flex-col p-4", selected && "border-primary ring-1 ring-primary/40")}
    >
      <p className="label-mono">{plan.name}</p>
      <p className="mt-1 font-display text-2xl font-semibold">{formatGs(plan.price_pyg)}</p>
      <p className="mt-2 flex-1 text-sm text-muted-foreground">{plan.description}</p>
      <p className="mt-2 text-xs text-muted-foreground">{planDurationLabel(plan)}</p>
      <button
        onClick={onSelect}
        className={cn(
          "mt-3 min-h-12 w-full rounded-xl text-sm font-semibold tracking-wide",
          selected
            ? "bg-primary text-primary-foreground"
            : "border border-border bg-surface-2 text-foreground",
        )}
      >
        {selected ? "PLAN SELECCIONADO" : "SOLICITAR ACCESO"}
      </button>
    </div>
  );
}
