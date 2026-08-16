import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { hasActiveAccess } from "@/lib/access";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/login", replace: true });

    // Autorización: aprobado, no suspendido, no rechazado, no vencido.
    // Este chequeo es solo de UX — las políticas RLS bloquean los datos igualmente.
    const { data: profile } = await supabase
      .from("profiles")
      .select("status, plan, access_expiration")
      .eq("id", data.user.id)
      .maybeSingle();

    if (!hasActiveAccess(profile)) throw redirect({ to: "/estado", replace: true });

    return { user: data.user, profile };
  },
  component: () => <Outlet />,
  pendingComponent: () => (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" />
        <p className="label-mono mt-4">Verificando acceso</p>
      </div>
    </div>
  ),
});
