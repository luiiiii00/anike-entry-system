import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, BookOpen, CalendarRange, PlusCircle, Settings, BarChart3 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { TrafficLight, lightFor } from "@/components/TrafficLight";
import { fetchEvaluations, type Evaluation } from "@/lib/db";
import { computeStats } from "@/lib/stats";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — ANIKE EJEPIKA" },
      { name: "description", content: "Tus métricas de proceso, riesgo y disciplina en un panel." },
      { property: "og:title", content: "Dashboard — ANIKE EJEPIKA" },
      { property: "og:description", content: "Métricas de proceso, riesgo y disciplina." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { user } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ["evaluations", user?.id],
    queryFn: fetchEvaluations,
    enabled: !!user,
  });

  const list = data ?? [];
  const stats = computeStats(list);
  const last = list.find((e) => e.status === "completed");
  const drafts = list.filter((e) => e.status === "draft");

  return (
    <AppShell
      title="Dashboard"
      subtitle="Proceso, riesgo y disciplina sobre tus datos registrados."
      action={
        <Link
          to="/nueva"
          search={{ id: undefined }}
          className="hidden min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground sm:inline-flex"
        >
          <PlusCircle className="h-4 w-4" /> NUEVA EVALUACIÓN
        </Link>
      }
    >
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label="Evaluaciones" value={stats.total} />
        <Stat label="Setups aprobados" value={stats.approved} tone="ok" />
        <Stat label="Operaciones registradas" value={stats.registered} />
        <Stat label="NO TRADE" value={stats.noTrade} tone="stop" />
        <Stat label="Win rate" value={stats.winRate === null ? "—" : `${stats.winRate}%`} />
        <Stat label="Promedio de R" value={stats.avgR === null ? "—" : stats.avgR.toFixed(2)} />
        <Stat label="Score promedio" value={stats.avgScore === null ? "—" : stats.avgScore} />
      </div>

      <section className="mt-6">
        <p className="label-mono">Última evaluación</p>
        {isLoading ? (
          <div className="panel mt-3 h-32 animate-pulse" />
        ) : last ? (
          <div className="panel animate-rise mt-3 p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="font-display text-2xl font-semibold">{last.asset ?? "—"}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {last.direction ?? "—"} · {last.setup ?? "—"} · {last.trade_date}
                </p>
              </div>
              <div className="text-right">
                <p className="font-display text-3xl font-semibold tabular-nums">
                  {last.score ?? 0}
                  <span className="text-base text-muted-foreground"> / 100</span>
                </p>
                <p className="label-mono mt-1">{last.classification}</p>
              </div>
            </div>
            <div className="mt-4">
              <TrafficLight
                light={lightFor(last.classification)}
                classification={last.classification ?? "—"}
                message={
                  last.decision === "registrado"
                    ? `Resultado: ${last.result_r === null ? "operación abierta" : `${Number(last.result_r).toFixed(2)}R`}`
                    : "Decisión: NO TRADE"
                }
              />
            </div>
            <Link
              to="/trade/$id"
              params={{ id: last.id }}
              className="mt-4 inline-flex items-center gap-1.5 text-sm text-primary"
            >
              Ver detalle <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>
        ) : (
          <div className="panel mt-3 p-6 text-sm text-muted-foreground">
            Todavía no registraste evaluaciones. Empieza con una nueva evaluación para construir tu
            historial real.
          </div>
        )}
      </section>

      {drafts.length > 0 && (
        <section className="mt-6">
          <p className="label-mono">Borradores sin terminar</p>
          <div className="mt-3 space-y-2">
            {drafts.map((d) => (
              <DraftRow key={d.id} draft={d} />
            ))}
          </div>
        </section>
      )}

      <section className="mt-6 grid gap-3 sm:grid-cols-2">
        <Tile to="/nueva" icon={PlusCircle} title="+ NUEVA EVALUACIÓN" text="Checklist de 11 pasos" primary />
        <Tile to="/journal" icon={BookOpen} title="Journal" text="Historial y post-trade review" />
        <Tile to="/stats" icon={BarChart3} title="Estadísticas" text="Métricas e insights reales" />
        <Tile to="/weekly" icon={CalendarRange} title="Weekly Review" text="Cierre de la semana" />
        <Tile to="/perfil" icon={Settings} title="Configuración" text="Riesgo, R:R y preferencias" />
      </section>
    </AppShell>
  );
}

function DraftRow({ draft }: { draft: Evaluation }) {
  return (
    <Link
      to="/nueva"
      search={{ id: draft.id }}

      className="panel flex items-center justify-between gap-3 p-4 transition-colors hover:bg-surface-2"
    >
      <div>
        <p className="text-sm font-medium">{draft.asset || "Sin activo"}</p>
        <p className="text-xs text-muted-foreground">
          {draft.trade_date} · borrador guardado
        </p>
      </div>
      <span className="text-sm text-primary">Continuar</span>
    </Link>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: "ok" | "stop";
}) {
  return (
    <div className="panel animate-rise p-4">
      <p className="label-mono">{label}</p>
      <p
        className={
          "mt-2 font-display text-2xl font-semibold tabular-nums sm:text-3xl " +
          (tone === "ok" ? "text-ok" : tone === "stop" ? "text-stop" : "")
        }
      >
        {value}
      </p>
    </div>
  );
}

function Tile({
  to,
  icon: Icon,
  title,
  text,
  primary,
}: {
  to: string;
  icon: typeof PlusCircle;
  title: string;
  text: string;
  primary?: boolean;
}) {
  return (
    <Link
      to={to}
      className={
        "panel flex items-center gap-4 p-5 transition-transform active:scale-[0.99] " +
        (primary ? "border-primary/40 bg-primary/10" : "hover:bg-surface-2")
      }
    >
      <Icon className={"h-5 w-5 " + (primary ? "text-primary" : "text-muted-foreground")} />
      <div>
        <p className="font-display text-sm font-semibold tracking-wide">{title}</p>
        <p className="text-xs text-muted-foreground">{text}</p>
      </div>
    </Link>
  );
}
