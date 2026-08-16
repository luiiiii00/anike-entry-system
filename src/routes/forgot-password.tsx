import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AuthField, AuthLayout, AuthSubmit } from "@/components/AuthLayout";
import { friendlyAuthError, validateEmail } from "@/lib/auth-errors";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({
    meta: [
      { title: "Recuperar contraseña — ANIKE EJEPIKA" },
      {
        name: "description",
        content: "Recibe un enlace seguro para restablecer la contraseña de tu cuenta.",
      },
      { property: "og:title", content: "Recuperar contraseña — ANIKE EJEPIKA" },
      { property: "og:description", content: "Restablece la contraseña de tu cuenta." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ForgotPassword,
});

function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const error = validateEmail(email);
    if (error) return toast.error(error);

    setBusy(true);
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (resetError) throw resetError;
      setSent(true);
    } catch (err) {
      toast.error(friendlyAuthError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      eyebrow="Recuperar acceso"
      title={sent ? "Enlace enviado" : "Restablecer contraseña"}
      description={
        sent
          ? "Si existe una cuenta con ese email, recibirás un enlace para crear una contraseña nueva."
          : "Te enviaremos un enlace seguro para crear una contraseña nueva."
      }
      footer={
        <Link to="/login" className="text-primary underline-offset-4 hover:underline">
          Volver al inicio de sesión
        </Link>
      }
    >
      {!sent && (
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
          <AuthSubmit busy={busy}>ENVIAR ENLACE</AuthSubmit>
        </form>
      )}
    </AuthLayout>
  );
}
