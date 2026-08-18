import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { Clock, ShieldOff, Ban, TimerOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Wordmark } from "@/components/brand";
import { ContentProtection } from "@/components/ContentProtection";
import { useProfile } from "@/hooks/useProfile";
import {
  effectiveStatus,
  formatDate,
  formatExpiration,
  hasActiveAccess,
  PLAN_LABEL,
  timeRemaining,
} from "@/lib/access";
import { useNow } from "@/hooks/useNow";
import { PaymentHistory } from "@/components/PaymentHistory";
import { fetchMyPaymentRequests, formatGs } from "@/lib/payments";

export const Route = createFileRoute("/estado")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Estado de tu cuenta — ANIKE EJEPIKA" },
      { name: "description", content: "Consulta el estado de tu solicitud de acceso al sistema." },
      { property: "og:title", content: "Estado de tu cuenta — ANIKE EJEPIKA" },
      { property: "og:description", content: "Consulta el estado de tu solicitud de acceso." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: EstadoPage,
});

const SCREENS = {
  PENDING: {
    icon: Clock,
    tone: "text-warn",
    title: "ACCESO PENDIENTE",
    lines: [
      "Tu solicitud está siendo revisada.",
      "No tendrás acceso al sistema hasta que un administrador apruebe tu cuenta.",
    ],
  },
  REJECTED: {
    icon: Ban,
    tone: "text-danger",
    title: "ACCESO NO APROBADO",
    lines: ["Tu solicitud de acceso no ha sido aprobada."],
  },
  SUSPENDED: {
    icon: ShieldOff,
    tone: "text-muted-foreground",
    title: "CUENTA SUSPENDIDA",
    lines: ["Tu acceso al sistema ha sido suspendido."],
  },
  EXPIRED: {
    icon: TimerOff,
    tone: "text-orange-400",
    title: "ACCESO EXPIRADO",
    lines: [
      "Tu período de acceso ha terminado.",
      "Contacta con el administrador para renovar tu licencia.",
    ],
  },
} as const;

function EstadoPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, profile, loading } = useProfile();
  const now = useNow(15_000);
  const payments = useQuery({
    queryKey: ["my-payments", user?.id],
    queryFn: fetchMyPaymentRequests,
    enabled: !!user,
    refetchInterval: 15_000,
  });

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.navigate({ to: "/login", replace: true });
      return;
    }
    if (hasActiveAccess(profile)) router.navigate({ to: "/dashboard", replace: true });
  }, [loading, user, profile, router]);

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    router.navigate({ to: "/login", replace: true });
  }

  if (loading || !profile) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" />
      </div>
    );
  }

  const status = effectiveStatus(profile);
  const screen = SCREENS[status as keyof typeof SCREENS] ?? SCREENS.PENDING;
  const Icon = screen.icon;
  const list = payments.data ?? [];
  const pendingPayment = list.find((r) => r.status === "PENDING") ?? null;
  const rejectedPayment = !pendingPayment
    ? list.find((r) => r.status === "REJECTED") ?? null
    : null;
  const reason =
    status === "REJECTED"
      ? profile.rejection_reason
      : status === "SUSPENDED"
        ? profile.suspension_reason
        : null;

  return (
    <div className="grid-noise flex min-h-screen flex-col items-center justify-center px-5 py-10">
      <ContentProtection />
      <div className="w-full max-w-md">
        <Wordmark />
        <div className="panel animate-rise mt-7 p-6">
          <Icon className={`h-8 w-8 ${screen.tone}`} />
          <h1 className="mt-4 font-display text-2xl font-semibold tracking-tight">{screen.title}</h1>
          {screen.lines.map((line) => (
            <p key={line} className="mt-2 text-sm text-muted-foreground">
              {line}
            </p>
          ))}

          {reason && (
            <div className="mt-5 rounded-xl border border-border bg-surface-2 p-4">
              <p className="label-mono">Motivo</p>
              <p className="mt-1 text-sm">{reason}</p>
            </div>
          )}

          <dl className="mt-6 grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="label-mono">Cuenta</dt>
              <dd className="mt-1 break-all">{profile.email ?? "—"}</dd>
            </div>
            <div>
              <dt className="label-mono">Plan</dt>
              <dd className="mt-1">{PLAN_LABEL[profile.plan]}</dd>
            </div>
            <div>
              <dt className="label-mono">Solicitud</dt>
              <dd className="mt-1">{formatDate(profile.created_at)}</dd>
            </div>
            <div className="col-span-2">
              <dt className="label-mono">Vencimiento exacto</dt>
              <dd className="mt-1 tabular-nums">{formatExpiration(profile)}</dd>
            </div>
            <div className="col-span-2">
              <dt className="label-mono">Tiempo restante</dt>
              <dd className="mt-1 tabular-nums">{timeRemaining(profile, now)}</dd>
            </div>
          </dl>

          {pendingPayment ? (
            <div className="mt-6 rounded-xl border border-warn/40 bg-warn/10 p-4 text-sm text-warn">
              <p className="font-semibold">🟡 PAGO PENDIENTE</p>
              <p className="mt-1">
                {pendingPayment.receipt_path
                  ? "Estamos verificando tu comprobante."
                  : "Falta subir tu comprobante de transferencia."}
              </p>
              <p className="mt-1 tabular-nums opacity-80">
                {pendingPayment.plan_name} · {formatGs(pendingPayment.amount)}
              </p>
            </div>
          ) : rejectedPayment ? (
            <div className="mt-6 rounded-xl border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
              <p className="font-semibold">🔴 PAGO RECHAZADO</p>
              <p className="mt-1">Motivo: {rejectedPayment.rejection_reason ?? "No especificado."}</p>
            </div>
          ) : null}

          <button
            onClick={() => router.navigate({ to: "/activar" })}
            className="mt-6 min-h-13 w-full rounded-xl bg-primary text-sm font-semibold tracking-wide text-primary-foreground"
          >
            {pendingPayment ? "VER MI SOLICITUD DE PAGO" : status === "EXPIRED" ? "RENOVAR ACCESO" : "ACTIVAR ACCESO"}
          </button>

          <button
            onClick={signOut}
            className="mt-3 min-h-12 w-full rounded-xl border border-border bg-surface-2 text-sm font-semibold tracking-wide transition-colors hover:bg-surface"
          >
            CERRAR SESIÓN
          </button>
        </div>
        <PaymentHistory />
      </div>
    </div>
  );
}
