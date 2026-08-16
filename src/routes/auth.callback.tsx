import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Wordmark } from "@/components/brand";

export const Route = createFileRoute("/auth/callback")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Verificando acceso — ANIKE EJEPIKA" },
      { name: "description", content: "Confirmando tu sesión para entrar al sistema." },
      { property: "og:title", content: "Verificando acceso — ANIKE EJEPIKA" },
      { property: "og:description", content: "Confirmando tu sesión." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CallbackPage,
});

function CallbackPage() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    async function resolve() {
      // Espera a que el SDK termine de guardar la sesión del proveedor.
      for (let attempt = 0; attempt < 25; attempt += 1) {
        const { data } = await supabase.auth.getSession();
        if (cancelled) return;
        if (data.session) {
          router.navigate({ to: "/dashboard", replace: true });
          return;
        }
        await new Promise((r) => setTimeout(r, 200));
      }
      if (!cancelled) router.navigate({ to: "/login", replace: true });
    }

    void resolve();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div className="grid-noise flex min-h-screen flex-col items-center justify-center gap-6 px-5">
      <Wordmark />
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" />
      <p className="label-mono">Verificando acceso</p>
    </div>
  );
}
