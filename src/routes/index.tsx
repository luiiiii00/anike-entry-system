import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, ShieldCheck, Target, Gauge } from "lucide-react";
import { Wordmark } from "@/components/brand";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ANIKE EJEPIKA — Trading Entry System" },
      {
        name: "description",
        content:
          "Sistema de evaluación de entradas: valida tu idea, controla el riesgo y mantén la disciplina antes de operar.",
      },
      { property: "og:title", content: "ANIKE EJEPIKA — Trading Entry System" },
      {
        property: "og:description",
        content:
          "Antes de entrar al mercado, valida tu idea. Checklist estructurado, score 0-100 y control de riesgo.",
      },
    ],
  }),
  component: Welcome,
});

function Welcome() {
  return (
    <div className="grid-noise flex min-h-screen flex-col">
      <header className="px-5 py-6 sm:px-8">
        <Wordmark />
      </header>

      <main className="flex flex-1 flex-col justify-center px-5 pb-16 sm:px-8">
        <div className="mx-auto w-full max-w-3xl">
          <p className="label-mono animate-fade">Trading Entry System</p>
          <h1 className="animate-rise mt-3 font-display text-4xl font-semibold leading-[1.05] sm:text-6xl">
            ANIKE EJEPIKA
          </h1>
          <p className="animate-rise mt-5 max-w-xl text-lg text-muted-foreground sm:text-xl">
            “Antes de entrar al mercado, valida tu idea.”
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link
              to="/login"
              className="inline-flex min-h-13 items-center justify-center gap-2 rounded-xl bg-primary px-6 text-sm font-semibold tracking-wide text-primary-foreground shadow-glow-ok transition-transform active:scale-[0.98]"
            >
              INICIAR SESIÓN <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/register"
              className="inline-flex min-h-13 items-center justify-center rounded-xl border border-border bg-surface px-6 text-sm font-semibold tracking-wide transition-colors hover:bg-surface-2"
            >
              CREAR CUENTA
            </Link>
          </div>


          <p className="mt-6 max-w-lg text-sm text-muted-foreground">
            Una herramienta para estructurar tu análisis, controlar el riesgo y mantener la
            disciplina.
          </p>

          <div className="mt-12 grid gap-4 sm:grid-cols-3">
            {[
              {
                icon: Gauge,
                title: "Score 0–100",
                text: "Diez bloques del checklist original ponderados en un único resultado.",
              },
              {
                icon: ShieldCheck,
                title: "Reglas críticas",
                text: "Ocho condiciones que bloquean la operación por encima del score.",
              },
              {
                icon: Target,
                title: "Riesgo medido",
                text: "Calculadora de R:R, tamaño de posición y riesgo monetario.",
              },
            ].map(({ icon: Icon, title, text }) => (
              <div key={title} className="panel animate-rise p-5">
                <Icon className="h-5 w-5 text-primary" />
                <p className="mt-3 font-display text-base font-semibold">{title}</p>
                <p className="mt-1.5 text-sm text-muted-foreground">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </main>

      <footer className="border-t border-border px-5 py-6 text-xs leading-relaxed text-muted-foreground sm:px-8">
        ANIKE EJEPIKA no predice el mercado, no promete resultados y no ofrece asesoramiento
        financiero. Es un sistema de proceso, registro y control de riesgo.
      </footer>
    </div>
  );
}
