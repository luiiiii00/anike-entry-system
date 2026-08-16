import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { AuthField, AuthLayout, AuthSubmit } from "@/components/AuthLayout";
import { friendlyAuthError, validateEmail } from "@/lib/auth-errors";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Iniciar sesión — ANIKE EJEPIKA Trading Entry System" },
      {
        name: "description",
        content: "Accede a tu sistema privado de evaluación de entradas y registro de operaciones.",
      },
      { property: "og:title", content: "Iniciar sesión — ANIKE EJEPIKA" },
      { property: "og:description", content: "Accede a tu sistema privado de evaluación." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);

  useEffect(() => {
    // La sesión confirmada siempre gana: el guard de /dashboard decide si el
    // usuario entra o debe continuar en /estado.
    if (!loading && user) void router.navigate({ to: "/dashboard", replace: true });
  }, [loading, user, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const emailError = validateEmail(email);
    if (emailError) {
      toast.error(emailError);
      return;
    }
    if (!password) {
      toast.error("Escribe tu contraseña.");
      return;
    }

    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;
      router.navigate({ to: "/dashboard", replace: true });
    } catch (error) {
      toast.error(friendlyAuthError(error));
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    if (busy || googleBusy) return;
    setGoogleBusy(true);
    let timeoutId: ReturnType<typeof window.setTimeout> | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => {
        timeoutId = window.setTimeout(
          () => reject(new Error("La conexión con Google tardó demasiado. Inténtalo nuevamente.")),
          90_000,
        );
      });
      const result = await Promise.race([
        lovable.auth.signInWithOAuth("google", {
          // En Preview el helper usa web_message y guarda la sesión en esta
          // ventana. En una pestaña normal vuelve al origen público.
          redirect_uri: window.location.origin,
          extraParams: { prompt: "select_account" },
        }),
        timeout,
      ]);
      if (result.error) throw new Error(String(result.error));
      if (result.redirected) return;

      // El helper ya llamó setSession antes de resolver. La navegación pasa
      // por el guard, que deriva cuentas pendientes o vencidas a /estado.
      await router.navigate({ to: "/dashboard", replace: true });
    } catch (error) {
      toast.error(friendlyAuthError(error));
    } finally {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      setGoogleBusy(false);
    }
  }

  return (
    <AuthLayout
      eyebrow="Acceso"
      title="Entra a tu sistema"
      description="Contenido privado. Solo cuentas registradas."
      footer={
        <>
          ¿No tienes cuenta?{" "}
          <Link to="/register" className="text-primary underline-offset-4 hover:underline">
            Crear cuenta
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="mt-6 space-y-3">
        <AuthField
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          placeholder="tu@email.com"
          autoComplete="email"
          required
        />
        <AuthField
          label="Contraseña"
          type="password"
          value={password}
          onChange={setPassword}
          placeholder="Tu contraseña"
          autoComplete="current-password"
          required
        />
        <AuthSubmit busy={busy} disabled={googleBusy}>INICIAR SESIÓN</AuthSubmit>
      </form>

      <button
        type="button"
        onClick={google}
        disabled={busy || googleBusy}
        className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-border bg-surface-2 text-sm font-medium transition-colors hover:bg-surface disabled:opacity-60"
      >
        {googleBusy ? "Conectando…" : "Continuar con Google"}
      </button>

      <Link
        to="/forgot-password"
        className="mt-5 block text-center text-sm text-muted-foreground underline-offset-4 hover:underline"
      >
        ¿Olvidaste tu contraseña?
      </Link>
    </AuthLayout>
  );
}
