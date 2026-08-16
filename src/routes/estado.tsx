import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { Clock, ShieldOff, Ban, TimerOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Wordmark } from "@/components/brand";
import { useProfile } from "@/hooks/useProfile";
import { effectiveStatus, formatDate, hasActiveAccess, PLAN_LABEL } from "@/lib/access";

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
  const reason =
    status === "REJECTED"
      ? profile.rejection_reason
      : status === "SUSPENDED"
        ? profile.suspension_reason
        : null;

  return (
    <div className="grid-noise flex min-h-screen flex-col items-center justify-center px-5 py-10">
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
            <div>
              <dt className="label-mono">Vencimiento</dt>
              <dd className="mt-1">{formatDate(profile.access_expiration)}</dd>
            </div>
          </dl>

          <button
            onClick={signOut}
            className="mt-7 min-h-12 w-full rounded-xl border border-border bg-surface-2 text-sm font-semibold tracking-wide transition-colors hover:bg-surface"
          >
            CERRAR SESIÓN
          </button>
        </div>
      </div>
    </div>
  );
}
