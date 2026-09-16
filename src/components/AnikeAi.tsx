import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Bot, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { aiErrorMessage, fetchAiReviewsByType, fetchAiReviewsForEvaluation, type AiReview } from "@/lib/ai";
import { aiUsageFn, analyzeEvaluationFn, analyzeWeekFn } from "@/lib/ai.functions";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

type WeeklyPayload = {
  weekStart: string;
  total: number;
  winRate: number | null;
  avgR: number | null;
  avgScore: number | null;
  impulsive: number;
  offPlan: number;
  bestSetup: string | null;
  worstSetup: string | null;
  recurringRules: string[];
};

type Props =
  | { variant: "evaluation"; evaluationId: string; noTrade?: boolean }
  | { variant: "weekly"; getPayload: () => WeeklyPayload };

export function AnikeAiPanel(props: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const analyzeEvaluation = useServerFn(analyzeEvaluationFn);
  const analyzeWeek = useServerFn(analyzeWeekFn);
  const usage = useServerFn(aiUsageFn);
  const [open, setOpen] = useState(false);

  const usageQuery = useQuery({
    queryKey: ["ai-usage", user?.id],
    queryFn: () => usage({ data: undefined }),
    enabled: !!user,
  });

  const isEvaluation = props.variant === "evaluation";

  const reviewsQuery = useQuery({
    queryKey: isEvaluation
      ? ["ai-reviews", "evaluation", props.evaluationId]
      : ["ai-reviews", "weekly", user?.id],
    queryFn: () =>
      isEvaluation
        ? fetchAiReviewsForEvaluation(props.evaluationId)
        : fetchAiReviewsByType("WEEKLY_REVIEW"),
    enabled: !!user,
  });

  const analyze = useMutation({
    mutationFn: async () =>
      isEvaluation
        ? analyzeEvaluation({ data: { evaluationId: props.evaluationId } })
        : analyzeWeek({ data: props.getPayload() }),
    onSuccess: () => {
      setOpen(true);
      queryClient.invalidateQueries({ queryKey: ["ai-reviews"] });
      queryClient.invalidateQueries({ queryKey: ["ai-usage"] });
      toast.success("Análisis de ANIKE IA listo");
    },
    onError: (error) => toast.error(aiErrorMessage(error)),
  });

  const reviews = (reviewsQuery.data ?? []) as AiReview[];
  const latest = reviews[0];
  const previous = reviews.slice(1, 6);
  const remaining = usageQuery.data?.remaining ?? null;
  const limit = usageQuery.data?.limit ?? null;
  const noCredits = remaining !== null && remaining <= 0;


  return (
    <section className="panel mt-4 overflow-hidden">
      <div className="flex flex-wrap items-start gap-4 p-5">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-primary/40 bg-primary/10">
          <Bot className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-[190px] flex-1">
          <p className="font-display text-base font-semibold">🤖 ANIKE IA</p>
          <p className="text-xs text-muted-foreground">El mentor que te obliga a aprender de cada operación.</p>
          <p className="mt-2 text-sm text-muted-foreground">
            {isEvaluation && props.noTrade
              ? "¿Quieres entender por qué esta operación fue descartada?"
              : "Convierte cada operación en una oportunidad para aprender."}
          </p>
          {limit !== null && (
            <p className="label-mono mt-2">
              {noCredits
                ? "Has usado todos tus análisis de las últimas 24 horas."
                : `Análisis IA disponibles: ${remaining}/${limit} en las últimas 24 horas`}
            </p>
          )}

        </div>

        <div className="flex w-full flex-col gap-2 sm:w-auto">
          {latest && (
            <button
              onClick={() => setOpen((v) => !v)}
              className="min-h-11 rounded-xl border border-border bg-surface-2 px-4 text-sm font-medium"
            >
              {open ? "OCULTAR ANÁLISIS" : "VER ANÁLISIS"}
            </button>
          )}
          <button
            onClick={() => analyze.mutate()}
            disabled={analyze.isPending || noCredits}
            className={cn(
              "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold tracking-wide transition-transform active:scale-[0.98] disabled:opacity-40",
              latest
                ? "border border-primary/40 bg-primary/10 text-primary"
                : "bg-primary text-primary-foreground",
            )}
          >
            {analyze.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Analizando tu proceso...
              </>
            ) : latest ? (
              <>
                <RefreshCw className="h-4 w-4" /> ANALIZAR DE NUEVO
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                {isEvaluation
                  ? props.noTrade
                    ? "ANALIZAR CON ANIKE IA"
                    : "ANALIZAR CON IA"
                  : "ANALIZAR MI SEMANA"}
              </>
            )}
          </button>
        </div>
      </div>

      {analyze.isPending && (
        <div className="border-t border-border px-5 py-4">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
            <div className="h-full w-1/3 animate-pulse rounded-full bg-primary" />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Analizando tu proceso...</p>
        </div>
      )}

      {analyze.isError && !analyze.isPending && (
        <div className="border-t border-stop/30 bg-stop-soft/25 px-5 py-4">
          <p className="text-sm text-stop">{aiErrorMessage(analyze.error)}</p>
          <button
            onClick={() => analyze.mutate()}
            className="mt-2 text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            Volver a intentar
          </button>
        </div>
      )}

      {open && latest && !analyze.isPending && <AiReviewBody review={latest} />}

      {open && previous.length > 0 && !analyze.isPending && (
        <div className="border-t border-border p-5">
          <p className="label-mono">ANÁLISIS ANTERIORES</p>
          <div className="mt-2 space-y-2">
            {previous.map((r) => (
              <details key={r.id} className="rounded-xl border border-border bg-surface-2">
                <summary className="cursor-pointer px-4 py-3 text-sm">
                  {new Date(r.created_at).toLocaleString("es-PY")} · {r.review_type}
                </summary>
                <AiReviewBody review={r} />
              </details>
            ))}
          </div>
        </div>
      )}

    </section>
  );
}

export function AiReviewBody({ review }: { review: AiReview }) {
  return (
    <div className="animate-fade space-y-4 border-t border-border p-5">
      <div>
        <p className="font-display text-lg font-semibold">ANÁLISIS ANIKE IA</p>
        <p className="label-mono mt-1">
          {new Date(review.created_at).toLocaleString("es-PY")} · {review.review_type}
        </p>
      </div>
      <Block title="🎯 MI LECTURA" text={review.summary} highlightKeyPoint />
      <Block title="🧩 POR QUÉ EL SISTEMA DECIDIÓ ESTO" text={review.why ?? ""} />
      <Block title="⚡ CONTRADICCIONES" text={review.contradictions ?? ""} />
      <Block title="✅ LO QUE HICISTE BIEN" text={review.what_worked} />
      <Block title="⚠️ LO QUE NO ME CONVENCE" text={review.what_failed} />
      <Block title="🧠 ¿QUÉ APRENDÍ?" text={review.what_learned} />
      <Block title="🎯 ¿QUÉ HARÉ DIFERENTE?" text={review.next_time} />
      <p className="text-[11px] text-muted-foreground">
        ANIKE IA es una herramienta educativa de revisión de procesos. No emite señales de compra o
        venta, no predice el mercado ni garantiza resultados.
      </p>
    </div>
  );
}


function Block({
  title,
  text,
  highlightKeyPoint = false,
}: {
  title: string;
  text: string;
  highlightKeyPoint?: boolean;
}) {
  if (!text) return null;
  const lines = text
    .split("\n")
    .map((l) => l.replace(/^[*#>]+\s*/, "").replace(/\*\*/g, "").trim())
    .filter(Boolean);

  return (
    <div className="rounded-xl border border-border bg-surface-2 p-4">
      <p className="label-mono">{title}</p>
      <div className="mt-2 space-y-1.5 text-sm leading-relaxed text-foreground/90">
        {lines.map((l, i) => {
          const isKey = highlightKeyPoint && /^🚨/.test(l);
          const isAlert = /^(🚨|OJO CON ESTO)/i.test(l) || /^-\s*🚨/.test(l);
          if (isKey) {
            return (
              <p
                key={i}
                className="mt-3 rounded-lg border border-primary/40 bg-primary/10 p-3 text-sm font-medium text-foreground"
              >
                {l}
              </p>
            );
          }
          return (
            <p
              key={i}
              className={cn(
                l.startsWith("- ") && "pl-3",
                isAlert && "font-medium text-stop",
              )}
            >
              {l.startsWith("- ") ? `• ${l.slice(2)}` : l}
            </p>
          );
        })}
      </div>
    </div>
  );
}
