import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AuthField, AuthLayout, AuthSubmit } from "@/components/AuthLayout";
import { friendlyAuthError, validatePassword } from "@/lib/auth-errors";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Nueva contraseña — ANIKE EJEPIKA" },
      { name: "description", content: "Define una contraseña nueva para tu cuenta." },
      { property: "og:title", content: "Nueva contraseña — ANIKE EJEPIKA" },
      { property: "og:description", content: "Define una contraseña nueva para tu cuenta." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResetPassword,
});

function ResetPassword() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) setReady(true);
    });
    supabase.auth.getSession().then(({ data: got }) => {
      if (got.session) setReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const error =
      validatePassword(password) ?? (password !== confirm ? "Las contraseñas no coinciden." : null);
    if (error) return toast.error(error);

    setBusy(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      toast.success("Contraseña actualizada.");
      router.navigate({ to: "/dashboard", replace: true });
    } catch (err) {
      toast.error(friendlyAuthError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      eyebrow="Seguridad"
      title="Nueva contraseña"
      description={
        ready
          ? "Define una contraseña nueva para tu cuenta."
          : "Abre esta página desde el enlace que te enviamos por email."
      }
      footer={
        <Link to="/login" className="text-primary underline-offset-4 hover:underline">
          Volver al inicio de sesión
        </Link>
      }
    >
      {ready && (
        <form onSubmit={submit} className="mt-6 space-y-3">
          <AuthField
            label="Nueva contraseña"
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
          <AuthSubmit busy={busy}>GUARDAR CONTRASEÑA</AuthSubmit>
        </form>
      )}
    </AuthLayout>
  );
}
