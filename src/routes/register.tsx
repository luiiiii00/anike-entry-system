import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AuthField, AuthLayout, AuthSubmit } from "@/components/AuthLayout";
import {
  friendlyAuthError,
  validateEmail,
  validateName,
  validatePassword,
} from "@/lib/auth-errors";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/register")({
  head: () => ({
    meta: [
      { title: "Crear cuenta — ANIKE EJEPIKA Trading Entry System" },
      {
        name: "description",
        content: "Crea tu cuenta para evaluar tus entradas, medir el riesgo y registrar operaciones.",
      },
      { property: "og:title", content: "Crear cuenta — ANIKE EJEPIKA" },
      { property: "og:description", content: "Crea tu cuenta del Trading Entry System." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RegisterPage,
});

function RegisterPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (!loading && user) router.navigate({ to: "/dashboard", replace: true });
  }, [loading, user, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const error =
      validateName(name) ?? validateEmail(email) ?? validatePassword(password) ??
      (password !== confirm ? "Las contraseñas no coinciden." : null);
    if (error) {
      toast.error(error);
      return;
    }

    setBusy(true);
    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/dashboard`,
          data: { display_name: name.trim(), full_name: name.trim() },
        },
      });
      if (signUpError) throw signUpError;

      if (data.session) {
        toast.success("Cuenta creada. Bienvenido.");
        router.navigate({ to: "/dashboard", replace: true });
        return;
      }
      setSent(true);
    } catch (err) {
      toast.error(friendlyAuthError(err));
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <AuthLayout
        eyebrow="Confirma tu email"
        title="Revisa tu bandeja de entrada"
        description={`Enviamos un enlace de confirmación a ${email.trim()}. Al confirmarlo entrarás directamente a tu panel.`}
        footer={
          <Link to="/login" className="text-primary underline-offset-4 hover:underline">
            Volver al inicio de sesión
          </Link>
        }
      >
        <p className="mt-5 text-sm text-muted-foreground">
          Si no lo encuentras, revisa la carpeta de spam. El enlace expira por seguridad.
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      eyebrow="Crear cuenta"
      title="Empieza tu registro"
      description="Tus operaciones y evaluaciones serán privadas y solo tuyas."
      footer={
        <>
          ¿Ya tienes cuenta?{" "}
          <Link to="/login" className="text-primary underline-offset-4 hover:underline">
            Iniciar sesión
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="mt-6 space-y-3">
        <AuthField
          label="Nombre"
          value={name}
          onChange={setName}
          placeholder="Tu nombre"
          autoComplete="name"
          required
        />
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
          placeholder="Mínimo 8 caracteres, letras y números"
          autoComplete="new-password"
          required
        />
        <AuthField
          label="Confirmar contraseña"
          type="password"
          value={confirm}
          onChange={setConfirm}
          placeholder="Repite la contraseña"
          autoComplete="new-password"
          required
        />
        <AuthSubmit busy={busy}>CREAR CUENTA</AuthSubmit>
      </form>
    </AuthLayout>
  );
}
