import { createFileRoute } from "@tanstack/react-router";
import { ContentProtection } from "@/components/ContentProtection";
import { ProtectionLog } from "@/components/ProtectionLog";

/**
 * Banco de pruebas de la capa de protección de contenido. No expone datos:
 * solo monta la protección y su registro para validaciones E2E manuales o
 * automatizadas (e2e/content-protection.py).
 */
export const Route = createFileRoute("/proteccion-test")({
  head: () => ({
    meta: [
      { title: "Prueba de protección de contenido — ANIKE EJEPIKA" },
      {
        name: "description",
        content:
          "Banco de pruebas de la capa anti-captura: cortina de privacidad, marca de agua y registro de eventos.",
      },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { property: "og:title", content: "Prueba de protección de contenido — ANIKE EJEPIKA" },
      {
        property: "og:description",
        content: "Verificación de la capa anti-captura y su registro de eventos.",
      },
    ],
  }),
  component: ProtectionTest,
});

function ProtectionTest() {
  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <ContentProtection />
      <main className="mx-auto w-full max-w-2xl">
        <h1 className="font-display text-2xl font-semibold">Prueba de protección</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Cambia de app o pestaña para ver la cortina, prueba Ctrl+P y escribe en el campo para
          comprobar que los formularios y el teclado siguen funcionando.
        </p>
        <label className="mt-6 block">
          <span className="label-mono">Campo de prueba</span>
          <input
            className="mt-1.5 min-h-11 w-full rounded-xl border border-input bg-surface px-3 text-base outline-none focus:border-primary"
            placeholder="Escribe aquí"
          />
        </label>
        <ProtectionLog />
      </main>
    </div>
  );
}
