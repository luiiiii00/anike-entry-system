import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Trash2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { AnikeAiPanel } from "@/components/AnikeAi";

import { ScoreDial } from "@/components/ScoreDial";
import { SizingStatus } from "@/components/SizingStatus";
import { computeRisk } from "@/lib/scoring";
import { TrafficLight } from "@/components/TrafficLight";
import { lightFor } from "@/components/TrafficLight";
import { deleteEvaluation, fetchEvaluation, fetchSettings, saveTradeReflection } from "@/lib/db";
import { PostTradeCalculator } from "@/components/PostTradeCalculator";
import { LEGACY_SECTIONS, SECTIONS } from "@/lib/checklist";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/trade/$id")({
  head: () => ({
    meta: [
      { title: "Detalle del trade — ANIKE EJEPIKA" },
      {
        name: "description",
        content: "Revisión completa de la evaluación: score, riesgo, decisión y resultado.",
      },
      { property: "og:title", content: "Detalle del trade — ANIKE EJEPIKA" },
      { property: "og:description", content: "Revisión completa de la evaluación y su resultado." },
    ],
  }),
  component: TradeDetail,
});

const REVIEW_FIELDS = [
  { id: "worked", label: "¿Qué funcionó?" },
  { id: "failed", label: "¿Qué falló?" },
  { id: "learned", label: "¿Qué aprendí?" },
  { id: "improve", label: "¿Qué haré diferente la próxima vez?" },
];

function TradeDetail() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: settings } = useQuery({
    queryKey: ["settings", user?.id],
    queryFn: () => fetchSettings(user!.id),
    enabled: !!user,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["evaluation", id],
    queryFn: () => fetchEvaluation(id),
    enabled: !!user,
  });

  const [followed, setFollowed] = useState("");
  const [review, setReview] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!data) return;
    setFollowed(data.followed_plan ?? "");
    setReview(data.review ?? {});
  }, [data]);

  const save = useMutation({
    mutationFn: () =>
      saveTradeReflection(id, {
        followed_plan: followed || null,
        review,
      }),
    onSuccess: () => {
      toast.success("Resultado guardado");
      queryClient.invalidateQueries({ queryKey: ["evaluation", id] });
      queryClient.invalidateQueries({ queryKey: ["evaluations"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: () => deleteEvaluation(id),
    onSuccess: () => {
      toast.success("Evaluación eliminada");
      queryClient.invalidateQueries({ queryKey: ["evaluations"] });
      router.navigate({ to: "/journal" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <AppShell title="Detalle del trade">
        <div className="panel h-64 animate-pulse" />
      </AppShell>
    );
  }

  if (!data) {
    return (
      <AppShell title="Detalle del trade">
        <div className="panel p-6">
          <p className="text-sm text-muted-foreground">
            Esta evaluación no existe o fue eliminada.
          </p>
          <Link to="/journal" className="mt-4 inline-flex text-sm text-primary">
            Volver al journal
          </Link>
        </div>
      </AppShell>
    );
  }

  const risk = data.risk ?? {};
  // Recalculado en la vista sólo para mostrar exactitud del lotaje (no se persiste).
  const riskMetrics = computeRisk(risk, data.direction, {
    market: data.market_type ?? data.market ?? null,
    contractSize: data.contract_size ?? null,
  });

  return (
    <AppShell
      title={data.asset ?? "Trade"}
      subtitle={`${data.trade_date} · ${data.direction ?? "—"} · ${data.setup ?? "—"}`}
      action={
        <Link
          to="/journal"
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-surface px-3 text-sm"
        >
          <ArrowLeft className="h-4 w-4" /> Journal
        </Link>
      }
    >
      <div className="panel flex flex-wrap items-center gap-6 p-5">
        <ScoreDial score={data.score ?? 0} light={lightFor(data.classification)} />
        <div className="space-y-2">
          <TrafficLight
            light={lightFor(data.classification)}
            classification={data.classification ?? "NO TRADE"}
            message={
              data.decision === "registrado" ? "Operación ejecutada." : "Operación descartada."
            }
          />
          <p className="text-sm text-muted-foreground">
            Decisión registrada: {data.decision === "registrado" ? "TRADE REGISTRADO" : "NO TRADE"}
          </p>
          {data.emotional_stop && (
            <p className="text-sm text-warn">Se activó el freno emocional en esta evaluación.</p>
          )}
        </div>
      </div>

      {data.hard_rules.length > 0 && (
        <div className="panel mt-4 border-stop/40 p-4">
          <p className="label-mono text-stop">Reglas duras activadas</p>
          <ul className="mt-2 space-y-1 text-sm">
            {data.hard_rules.map((r) => (
              <li key={r}>· {r}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="panel mt-4 grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
        <Info label="Entrada" value={risk.entry} />
        <Info label="Stop" value={risk.stop} />
        <Info label="Objetivo" value={risk.target} />
        <Info label="Riesgo %" value={risk.riskPct} />
        <Info label="Impulso — máximo" value={risk.swingHigh} />
        <Info label="Impulso — mínimo" value={risk.swingLow} />
        <Info label="SL Fibonacci 0,75" value={risk.slFibo} />
        <Info
          label={`Tamaño de posición${riskMetrics.sizingUnit ? ` (${riskMetrics.sizingUnit})` : ""}`}
          value={riskMetrics.positionSize}
        />
      </div>

      {/* Nunca puede confundirse un lotaje orientativo con uno ejecutable. */}
      <SizingStatus metrics={riskMetrics} className="mt-2 px-1" />

      {data.idea && (
        <div className="panel mt-4 p-4">
          <p className="label-mono">Idea de la operación</p>
          <p className="mt-2 text-sm leading-relaxed">{data.idea}</p>
        </div>
      )}

      <PostTradeCalculator
        evaluation={data}
        capital={Number(settings?.account_capital ?? 1000)}
        currency={settings?.currency ?? "USD"}
      />

      {/* POST-TRADE ANALYTICS: sólo lectura sobre lo ya registrado en servidor. */}
      <PostTradeAnalytics
        evaluation={data}
        capital={Number(settings?.account_capital ?? 1000)}
        currency={settings?.currency ?? "USD"}
      />


      <AnikeAiPanel
        variant="evaluation"
        evaluationId={id}
        noTrade={data.classification === "NO TRADE" || data.decision === "no_trade"}
      />

      <section className="mt-6">
        <p className="label-mono">Respuestas del checklist</p>
        <div className="mt-3 space-y-3">
          {[
            ...SECTIONS.map((s) => ({
              id: s.id,
              title: s.title,
              groups: s.groups,
            })),
            ...LEGACY_SECTIONS.map((s) => ({
              id: s.id,
              title: s.title,
              groups: [{ questions: s.questions }],
            })),
          ].map((s) => {
            const rows = s.groups
              .flatMap((g) => g.questions)
              .filter((q) => data.answers?.[q.id])
              .map((q) => {
                const raw = String(data.answers[q.id]);
                return {
                  label: q.label,
                  value: q.options.find((o) => o.v === raw)?.label ?? raw,
                };
              });
            if (rows.length === 0) return null;
            return (
              <div key={s.id} className="panel p-4">
                <p className="label-mono">{s.title}</p>
                <div className="mt-2 space-y-2">
                  {rows.map((r) => (
                    <div key={r.label} className="flex justify-between gap-4 text-sm">
                      <span className="text-muted-foreground">{r.label}</span>
                      <span className="font-medium">{r.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="mt-6 space-y-3">
        <p className="label-mono">REFLEXIÓN POST-TRADE</p>
        <div className="panel p-4">
          <p className="label-mono">¿Seguí mi plan?</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {["Sí, completamente", "Parcialmente", "No lo seguí"].map((o) => (
              <button
                key={o}
                onClick={() => setFollowed(o)}
                className={cn(
                  "min-h-11 rounded-xl border px-3 text-sm",
                  followed === o
                    ? "border-primary bg-primary/15"
                    : "border-border bg-surface-2 text-muted-foreground",
                )}
              >
                {o}
              </button>
            ))}
          </div>
        </div>
        {REVIEW_FIELDS.map((f) => (
          <div key={f.id} className="panel p-4">
            <label className="block">
              <span className="text-sm font-medium">{f.label}</span>
              <textarea
                rows={3}
                maxLength={1000}
                value={review[f.id] ?? ""}
                onChange={(e) => setReview((r) => ({ ...r, [f.id]: e.target.value }))}
                className="mt-2 w-full rounded-xl border border-input bg-background p-3 text-base outline-none focus:border-primary"
              />
            </label>
          </div>
        ))}
        <button
          onClick={() => save.mutate()}
          disabled={save.isPending}
          className="min-h-13 w-full rounded-xl bg-primary text-sm font-semibold tracking-wide text-primary-foreground disabled:opacity-50"
        >
          GUARDAR RESULTADO
        </button>
        <button
          onClick={() => remove.mutate()}
          disabled={remove.isPending}
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-stop/40 text-sm text-stop"
        >
          <Trash2 className="h-4 w-4" /> Eliminar evaluación
        </button>
      </section>
    </AppShell>
  );
}

function Info({ label, value }: { label: string; value: number | null | undefined }) {
  const empty = value === null || value === undefined || !Number.isFinite(Number(value));
  return (
    <div>
      <p className="label-mono">{label}</p>
      <p
        className={cn(
          "mt-1 font-mono text-base tabular-nums",
          empty && "text-xs text-muted-foreground",
        )}
      >
        {empty ? "No registrado" : value}
      </p>
    </div>
  );
}
