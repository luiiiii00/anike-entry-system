import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { createJournalTrade, fetchEvaluations, type Evaluation } from "@/lib/db";
import { fetchAnalyzedEvaluationIds } from "@/lib/ai";

import { useAuth } from "@/hooks/useAuth";
import { SETUPS } from "@/lib/checklist";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/journal")({
  head: () => ({
    meta: [
      { title: "Trading Journal — ANIKE EJEPIKA" },
      { name: "description", content: "Historial completo de tus evaluaciones y operaciones." },
      { property: "og:title", content: "Trading Journal — ANIKE EJEPIKA" },
      { property: "og:description", content: "Historial de evaluaciones y operaciones." },
    ],
  }),
  component: Journal,
});

const STATES = ["Todos", "SETUP A+", "SETUP A", "SETUP B", "NO TRADE"] as const;

function Journal() {
  const { user } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ["evaluations", user?.id],
    queryFn: fetchEvaluations,
    enabled: !!user,
  });
  const { data: analyzed } = useQuery({
    queryKey: ["ai-reviews", "ids", user?.id],
    queryFn: fetchAnalyzedEvaluationIds,
    enabled: !!user,
  });


  const router = useRouter();
  const queryClient = useQueryClient();
  const register = useMutation({
    mutationFn: () => createJournalTrade(user!.id),
    onSuccess: (row) => {
      queryClient.invalidateQueries({ queryKey: ["evaluations"] });
      router.navigate({ to: "/trade/$id", params: { id: row.id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [asset, setAsset] = useState("");
  const [from, setFrom] = useState("");
  const [setup, setSetup] = useState("Todos");
  const [direction, setDirection] = useState("Todas");
  const [state, setState] = useState<string>("Todos");

  const rows = useMemo(() => {
    return (data ?? []).filter((e) => {
      if (asset && !(e.asset ?? "").toLowerCase().includes(asset.toLowerCase())) return false;
      if (from && e.trade_date < from) return false;
      if (setup !== "Todos" && e.setup !== setup) return false;
      if (direction !== "Todas" && e.direction !== direction) return false;
      if (state !== "Todos" && e.classification !== state) return false;
      return true;
    });
  }, [data, asset, from, setup, direction, state]);

  return (
    <AppShell
      title="Trading Journal"
      subtitle="Cada evaluación registrada, con su decisión y resultado."
      action={
        <button
          onClick={() => register.mutate()}
          disabled={register.isPending || !user}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          <Plus className="h-4 w-4" /> REGISTRAR OPERACIÓN
        </button>
      }
    >
      <div className="panel grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block">
          <span className="label-mono">Activo</span>
          <input
            value={asset}
            onChange={(e) => setAsset(e.target.value)}
            placeholder="BTCUSDT"
            className="mt-1.5 min-h-11 w-full rounded-xl border border-input bg-background px-3 text-base outline-none focus:border-primary"
          />
        </label>
        <label className="block">
          <span className="label-mono">Desde</span>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="mt-1.5 min-h-11 w-full rounded-xl border border-input bg-background px-3 text-base outline-none focus:border-primary"
          />
        </label>
        <label className="block">
          <span className="label-mono">Setup</span>
          <select
            value={setup}
            onChange={(e) => setSetup(e.target.value)}
            className="mt-1.5 min-h-11 w-full rounded-xl border border-input bg-background px-3 text-base"
          >
            {["Todos", ...SETUPS].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label-mono">Dirección</span>
          <select
            value={direction}
            onChange={(e) => setDirection(e.target.value)}
            className="mt-1.5 min-h-11 w-full rounded-xl border border-input bg-background px-3 text-base"
          >
            {["Todas", "LONG", "SHORT"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <div className="sm:col-span-2 lg:col-span-4">
          <span className="label-mono">Estado</span>
          <div className="mt-2 flex flex-wrap gap-2">
            {STATES.map((s) => (
              <button
                key={s}
                onClick={() => setState(s)}
                className={cn(
                  "min-h-10 rounded-xl border px-3 text-xs tracking-wide",
                  state === s
                    ? "border-primary bg-primary/15"
                    : "border-border bg-surface-2 text-muted-foreground",
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="panel mt-4 h-40 animate-pulse" />
      ) : rows.length === 0 ? (
        <div className="panel mt-4 p-6 text-sm text-muted-foreground">
          No hay registros con estos filtros.
        </div>
      ) : (
        <>
          <div className="mt-4 space-y-2 lg:hidden">
            {rows.map((e) => (
              <MobileCard key={e.id} e={e} analyzed={analyzed?.has(e.id) ?? false} />
            ))}
          </div>

          <div className="panel mt-4 hidden overflow-x-auto lg:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  {["Fecha", "Activo", "Dir", "Setup", "Score", "Riesgo", "R:R", "R", "$", "Disc.", "Estado", "ANIKE IA"].map(
                    (h) => (
                      <th key={h} className="label-mono px-3 py-3 font-normal">
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>

              <tbody>
                {rows.map((e) => (
                  <tr key={e.id} className="border-b border-border/60 last:border-0 hover:bg-surface-2">
                    <td className="px-3 py-3 font-mono text-xs">{e.trade_date}</td>
                    <td className="px-3 py-3">
                      <Link to="/trade/$id" params={{ id: e.id }} className="text-primary">
                        {e.asset ?? "—"}
                      </Link>
                    </td>
                    <td className={cn("px-3 py-3", e.direction === "SHORT" ? "text-stop" : "text-ok")}>
                      {e.direction ?? "—"}
                    </td>
                    <td className="px-3 py-3">{e.setup ?? "—"}</td>
                    <td className="px-3 py-3 font-mono tabular-nums">{e.score ?? "—"}</td>
                    <td className="px-3 py-3 font-mono">
                      {e.risk?.riskPct ? `${e.risk.riskPct}%` : "—"}
                    </td>
                    <td className="px-3 py-3 font-mono">{rrOf(e)}</td>
                    <td className={cn("px-3 py-3 font-mono", rTone(e.result_r))}>
                      {fix2(e.result_r)}
                    </td>
                    <td className={cn("px-3 py-3 font-mono", rTone(e.result_money))}>
                      {fix2(e.result_money)}
                    </td>

                    <td className="px-3 py-3">{e.emotional_stop ? "REVISAR" : "OK"}</td>
                    <td className="px-3 py-3">
                      <StateBadge e={e} />
                    </td>
                    <td className="px-3 py-3">
                      <Link
                        to="/trade/$id"
                        params={{ id: e.id }}
                        className="text-xs font-medium text-primary"
                      >
                        {analyzed?.has(e.id) ? "VER ANÁLISIS" : "ANALIZAR CON IA"}
                      </Link>
                    </td>
                  </tr>

                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </AppShell>
  );
}

function rrOf(e: Evaluation) {
  const r = e.risk ?? {};
  const entry = Number(r.entry);
  const stop = Number(r.stop);
  const target = Number(r.target);
  if (!entry || !stop || !target) return "—";
  const d = Math.abs(entry - stop);
  return d ? (Math.abs(target - entry) / d).toFixed(2) : "—";
}

function rTone(v: number | null) {
  if (v === null || v === undefined) return "";
  return v > 0 ? "text-ok" : v < 0 ? "text-stop" : "";
}

function StateBadge({ e }: { e: Evaluation }) {
  const isNoTrade = e.classification === "NO TRADE" || e.decision === "no_trade";
  const draft = e.status === "draft";
  return (
    <span
      className={cn(
        "rounded-lg px-2 py-1 text-[11px] font-medium",
        draft
          ? "bg-surface-2 text-muted-foreground"
          : isNoTrade
            ? "bg-stop-soft/50 text-stop"
            : e.classification === "SETUP B"
              ? "bg-warn-soft/50 text-warn"
              : "bg-ok-soft/50 text-ok",
      )}
    >
      {draft ? "BORRADOR" : (e.classification ?? "—")}
    </span>
  );
}

function MobileCard({ e, analyzed }: { e: Evaluation; analyzed: boolean }) {
  return (
    <Link
      to="/trade/$id"
      params={{ id: e.id }}
      className="panel block p-4 transition-colors active:bg-surface-2"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-display text-base font-semibold">{e.asset ?? "—"}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {e.trade_date} · {e.direction ?? "—"} · {e.setup ?? "—"}
          </p>
        </div>
        <div className="text-right">
          <p className="font-mono text-lg tabular-nums">{e.score ?? "—"}</p>
          <StateBadge e={e} />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span>R:R {rrOf(e)}</span>
        <span className={rTone(e.result_r)}>Resultado {fix2(e.result_r)}R</span>
        <span>{e.emotional_stop ? "Disciplina: REVISAR" : "Disciplina: OK"}</span>
        <span className="text-primary">🤖 {analyzed ? "VER ANÁLISIS" : "ANALIZAR CON IA"}</span>
      </div>

    </Link>
  );
}
