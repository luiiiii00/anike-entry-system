import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AppShell } from "@/components/AppShell";
import { fetchEvaluations } from "@/lib/db";
import {
  buildInsights,
  computeStats,
  equityCurve,
  longVsShort,
  rDistribution,
  byAsset,
  scoreVsResult,
  setupDistribution,
} from "@/lib/stats";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/_authenticated/stats")({
  head: () => ({
    meta: [
      { title: "Estadísticas — ANIKE EJEPIKA" },
      {
        name: "description",
        content: "Métricas calculadas sobre tus operaciones registradas: R, score y disciplina.",
      },
      { property: "og:title", content: "Estadísticas — ANIKE EJEPIKA" },
      { property: "og:description", content: "Métricas calculadas sobre tus datos registrados." },
    ],
  }),
  component: StatsPage,
});

const COLORS = ["var(--ok)", "var(--warn)", "var(--accent)", "var(--stop)", "var(--muted-foreground)"];

function StatsPage() {
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: ["evaluations", user?.id],
    queryFn: fetchEvaluations,
    enabled: !!user,
  });
  const list = data ?? [];
  const stats = computeStats(list);
  const curve = equityCurve(list);
  const dist = setupDistribution(list);
  const svr = scoreVsResult(list);
  const ls = longVsShort(list);
  const insights = buildInsights(list, stats);
  const rDist = rDistribution(list);
  const assets = byAsset(list).slice(0, 8);

  return (
    <AppShell title="Estadísticas" subtitle="Calculadas únicamente con tus operaciones registradas.">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Cell2 label="Evaluaciones finalizadas" value={stats.total} />
        <Cell2 label="Setups aprobados (evaluación)" value={stats.approved} />
        <Cell2 label="Condicionales (no ejecutadas)" value={stats.conditional} />
        <Cell2 label="Operaciones registradas" value={stats.registered} />
        <Cell2 label="Operaciones cerradas" value={stats.closed} />
        <Cell2 label="Win rate" value={stats.winRate === null ? "—" : `${stats.winRate}%`} />
        <Cell2 label="Promedio R" value={stats.avgR === null ? "—" : stats.avgR.toFixed(2)} />
        <Cell2 label="R acumulado" value={stats.totalR.toFixed(2)} />
        <Cell2 label="Score promedio" value={stats.avgScore ?? "—"} />
        <Cell2 label="Impulsivas" value={stats.impulsive} />
        <Cell2 label="Fuera del plan" value={stats.offPlan} />
        <Cell2 label="Ganadoras" value={stats.wins} />
        <Cell2 label="Perdedoras" value={stats.losses} />
        <Cell2 label="Break even" value={stats.breakEven} />
        <Cell2 label="P&L acumulado" value={stats.netPnl.toFixed(2)} />
        <Cell2 label="ROI promedio" value={stats.avgRoi === null ? "—" : `${stats.avgRoi}%`} />
        <Cell2 label="Resultado promedio" value={stats.avgMoney === null ? "—" : stats.avgMoney.toFixed(2)} />
        <Cell2 label="Mejor R" value={stats.bestR === null ? "—" : stats.bestR.toFixed(2)} />
        <Cell2 label="Peor R" value={stats.worstR === null ? "—" : stats.worstR.toFixed(2)} />
        <Cell2 label="Mejor operación" value={stats.bestTrade === null ? "—" : stats.bestTrade.toFixed(2)} />
        <Cell2 label="Peor operación" value={stats.worstTrade === null ? "—" : stats.worstTrade.toFixed(2)} />
      </div>

      <section className="mt-6 space-y-4">
        <Panel title="Resultado acumulado en R">
          {curve.length > 1 ? (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={curve}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="name" stroke="var(--muted-foreground)" fontSize={11} />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} />
                <Tooltip contentStyle={TOOLTIP} />
                <Area dataKey="r" stroke="var(--ok)" fill="var(--ok-soft)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <Empty />
          )}
        </Panel>

        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Distribución por setup">
            {dist.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={dist} dataKey="value" nameKey="name" innerRadius={45} outerRadius={80}>
                    {dist.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={TOOLTIP} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <Empty />
            )}
          </Panel>

          <Panel title="Score vs resultado">
            {svr.length > 1 ? (
              <ResponsiveContainer width="100%" height={220}>
                <ScatterChart>
                  <CartesianGrid stroke="var(--border)" />
                  <XAxis dataKey="score" name="Score" stroke="var(--muted-foreground)" fontSize={11} />
                  <YAxis dataKey="r" name="R" stroke="var(--muted-foreground)" fontSize={11} />
                  <Tooltip contentStyle={TOOLTIP} />
                  <Scatter data={svr} fill="var(--accent)" />
                </ScatterChart>
              </ResponsiveContainer>
            ) : (
              <Empty />
            )}
          </Panel>
        </div>

        <Panel title="Distribución de resultados en R">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={rDist}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="name" stroke="var(--muted-foreground)" fontSize={10} />
              <YAxis stroke="var(--muted-foreground)" fontSize={11} allowDecimals={false} />
              <Tooltip contentStyle={TOOLTIP} />
              <Bar dataKey="value" name="Operaciones" fill="var(--accent)" radius={6} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        {assets.length > 0 && (
          <Panel title="Resultados por activo (R)">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={assets}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="name" stroke="var(--muted-foreground)" fontSize={10} />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} />
                <Tooltip contentStyle={TOOLTIP} />
                <Bar dataKey="r" name="R" fill="var(--ok)" radius={6} />
              </BarChart>
            </ResponsiveContainer>
          </Panel>
        )}

        <Panel title="LONG vs SHORT">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={ls}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="name" stroke="var(--muted-foreground)" fontSize={11} />
              <YAxis stroke="var(--muted-foreground)" fontSize={11} />
              <Tooltip contentStyle={TOOLTIP} />
              <Bar dataKey="trades" name="Operaciones" fill="var(--accent)" radius={6} />
              <Bar dataKey="r" name="R" fill="var(--ok)" radius={6} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      </section>

      <section className="mt-6">
        <p className="label-mono">Lo que tus operaciones están mostrando</p>
        <div className="mt-3 space-y-2">
          {insights.map((i) => (
            <div key={i} className="panel p-4 text-sm leading-relaxed">
              {i}
            </div>
          ))}
        </div>
      </section>
    </AppShell>
  );
}

const TOOLTIP = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: "12px",
  color: "var(--foreground)",
  fontSize: 12,
} as const;

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="panel p-4">
      <p className="label-mono">{title}</p>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function Empty() {
  return (
    <p className="py-10 text-center text-sm text-muted-foreground">
      Aún no hay suficientes datos registrados para este gráfico.
    </p>
  );
}

function Cell2({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="panel p-4">
      <p className="label-mono">{label}</p>
      <p className="mt-2 font-display text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}
