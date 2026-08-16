import { createFileRoute, useRouter, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Wordmark } from "@/components/brand";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Acceso — ANIKE EJEPIKA Trading Entry System" },
      {
        name: "description",
        content: "Entra a tu sistema de evaluación de entradas y registro de operaciones.",
      },
      { property: "og:title", content: "Acceso — ANIKE EJEPIKA" },
      { property: "og:description", content: "Entra a tu sistema de evaluación de entradas." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) router.navigate({ to: "/dashboard" });
  }, [loading, user, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/dashboard`,
            data: { display_name: name },
          },
        });
        if (error) throw error;
        toast.success("Cuenta creada. Ya puedes usar el sistema.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      router.navigate({ to: "/dashboard" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No fue posible completar el acceso");
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      toast.error("No fue posible iniciar sesión con Google");
      return;
    }
    if (result.redirected) return;
    router.navigate({ to: "/dashboard" });
  }

  return (
    <div className="grid-noise flex min-h-screen flex-col items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm">
        <Link to="/">
          <Wordmark />
        </Link>
        <div className="panel animate-rise mt-7 p-6">
          <p className="label-mono">{mode === "login" ? "Acceso" : "Crear cuenta"}</p>
          <h1 className="mt-2 font-display text-2xl font-semibold">
            {mode === "login" ? "Entra a tu sistema" : "Empieza tu registro"}
          </h1>

          <form onSubmit={submit} className="mt-6 space-y-3">
            {mode === "signup" && (
              <Field label="Nombre" value={name} onChange={setName} placeholder="Tu nombre" />
            )}
            <Field
              label="Email"
              type="email"
              value={email}
              onChange={setEmail}
              placeholder="tu@email.com"
              required
            />
            <Field
              label="Contraseña"
              type="password"
              value={password}
              onChange={setPassword}
              placeholder="Mínimo 6 caracteres"
              required
            />
            <button
              type="submit"
              disabled={busy}
              className="mt-2 flex min-h-12 w-full items-center justify-center rounded-xl bg-primary text-sm font-semibold tracking-wide text-primary-foreground transition-transform active:scale-[0.98] disabled:opacity-60"
            >
              {busy ? "..." : mode === "login" ? "ENTRAR" : "CREAR CUENTA"}
            </button>
          </form>

          <button
            onClick={google}
            className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-border bg-surface-2 text-sm font-medium transition-colors hover:bg-surface"
          >
            Continuar con Google
          </button>

          <button
            onClick={() => setMode(mode === "login" ? "signup" : "login")}
            className="mt-5 w-full text-center text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            {mode === "login" ? "No tengo cuenta" : "Ya tengo cuenta"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="label-mono">{label}</span>
      <input
        type={type}
        value={value}
        required={required}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 min-h-12 w-full rounded-xl border border-input bg-background px-3.5 text-base outline-none transition-colors focus:border-primary"
      />
    </label>
  );
}
