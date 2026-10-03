import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, ChevronLeft, ChevronRight, Lock, Save, X } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { QuestionList } from "@/components/QuestionGroup";
import { ScoreDial } from "@/components/ScoreDial";
import { SizingStatus } from "@/components/SizingStatus";
import { TrafficLight } from "@/components/TrafficLight";
import {
  EVALUATION_SETUPS,
  FIBO_SL_RATIO,
  MARKETS,
  SECTIONS,
  SESSIONS,
  answersForSetup,
  pruneInactiveAnswers,
  evaluationBlocks,
  getActiveQuestionsBySetup,
  EVALUATION_SETUP_IDS,
  missingActiveAnswers,
  missingInBlock,
  setupLabel,
  SETUP_TIMEFRAME_NOTE,
  tradingStyleFromAnswers,
  type EvaluationBlock,
} from "@/lib/checklist";

import {
  evaluate,
  computeRisk,
  fiboProjection,
  FINAL_STATE_UI,
  type Answers,
  type RiskData,
} from "@/lib/scoring";

import { fetchEvaluation, fetchSettings, nextTradeNumber } from "@/lib/db";
import { saveEvaluationFn } from "@/lib/evaluations.functions";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/useAuth";
import { useChecklistCatalog } from "@/hooks/useChecklistCatalog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/nueva")({
  validateSearch: (search: Record<string, unknown>) => ({
    id: typeof search["id"] === "string" ? (search["id"] as string) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Nueva evaluación — ANIKE EJEPIKA" },
      {
        name: "description",
        content:
          "Terminal de validación de entrada: bloques secuenciales 00 → 08 con la matriz del setup elegido.",
      },
      { property: "og:title", content: "Nueva evaluación — ANIKE EJEPIKA" },
      {
        property: "og:description",
        content: "Valida tu entrada bloque por bloque antes de operar.",
      },
    ],
  }),
  component: NuevaEvaluacion,
});

type TradeInfo = {
  trade_no: number | null;
  trade_date: string;
  trade_time: string;
  asset: string;
  market: string;
  session: string;
  direction: string;
  setup: string;
  idea: string;
};

function NuevaEvaluacion() {
  const { id } = Route.useSearch();
  const router = useRouter();
  const queryClient = useQueryClient();
  const saveEvaluationServer = useServerFn(saveEvaluationFn);
  const { user } = useAuth();

  const settingsQuery = useQuery({
    queryKey: ["settings", user?.id],
    queryFn: () => fetchSettings(user!.id),
    enabled: !!user,
  });
  const draftQuery = useQuery({
    queryKey: ["evaluation", id],
    queryFn: () => fetchEvaluation(id!),
    enabled: !!id,
  });

  const [evalId, setEvalId] = useState<string | undefined>(id);
  /** 0 = selección de setup · 1..n = bloques 00–08 · n+1 = decisión. */
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [blockError, setBlockError] = useState<string | null>(null);
  const [trade, setTrade] = useState<TradeInfo>({
    trade_no: null,
    trade_date: new Date().toISOString().slice(0, 10),
    trade_time: new Date().toTimeString().slice(0, 5),
    asset: "",
    market: MARKETS[0]!,
    session: SESSIONS[1]!,
    direction: "LONG",
    setup: "",
    idea: "",
  });
  const [answers, setAnswers] = useState<Answers>({});
  const [risk, setRisk] = useState<RiskData>({});
  // Versión publicada del cuestionario (editor de administración).
  const catalog = useChecklistCatalog();

  const settings = settingsQuery.data;

  useEffect(() => {
    if (!settings) return;
    setRisk((r) =>
      r.capital === undefined
        ? {
            ...r,
            capital: Number(settings.account_capital),
            riskPct: Number(settings.max_risk_pct),
          }
        : r,
    );
  }, [settings]);

  useEffect(() => {
    if (!id && user) {
      nextTradeNumber(user.id)
        .then((n) => setTrade((t) => ({ ...t, trade_no: n })))
        .catch(() => undefined);
    }
  }, [id, user]);

  useEffect(() => {
    const d = draftQuery.data;
    if (!d) return;
    setEvalId(d.id);
    setTrade({
      trade_no: d.trade_no,
      trade_date: d.trade_date,
      trade_time: d.trade_time ?? "",
      asset: d.asset ?? "",
      market: d.market ?? MARKETS[0]!,
      session: d.session ?? SESSIONS[1]!,
      direction: d.direction ?? "LONG",
      setup: d.setup ?? "",
      idea: d.idea ?? "",
    });
    // Al reabrir una evaluación se reconstruye el cuestionario desde el setup guardado.
    // Sin setup reconocido (histórico) se muestran las respuestas tal como se guardaron.
    const loaded = (d.answers ?? {}) as Answers;
    setAnswers(
      getActiveQuestionsBySetup(d.setup).length > 0 ? answersForSetup(loaded, d.setup) : loaded,
    );
    setRisk(d.risk ?? {});
  }, [draftQuery.data]);

  const decision = useMemo(() => {
    // `stamp` cambia cuando se carga la versión publicada del cuestionario.
    void catalog.stamp;
    return evaluate({
      answers,
      risk,
      maxRiskPct: Number(settings?.max_risk_pct ?? 1),
      // Borradores históricos con setup no oficial: vista previa global hasta que
      // se elija un setup oficial (el servidor rechaza guardar un setup inválido).
      setup: (EVALUATION_SETUP_IDS as readonly string[]).includes(trade.setup ?? "")
        ? trade.setup
        : null,
      preferredSetups: settings?.preferred_setups ?? [],
      direction: trade.direction,
      market: trade.market ?? null,
    });
  }, [answers, risk, settings, trade.setup, trade.direction, trade.market, catalog.stamp]);

  const metrics = useMemo(
    () => computeRisk(risk, trade.direction, { market: trade.market ?? null }),
    [risk, trade.direction, trade.market],
  );

  // Bloques secuenciales de la matriz activa: 00 Comercio → 08 Disciplina.
  // `answers` resuelve las preguntas condicionales (modo de entrada, variantes).
  const blocks = useMemo<EvaluationBlock[]>(() => {
    void catalog.stamp;
    return evaluationBlocks(trade.setup, answers);
  }, [trade.setup, answers, catalog.stamp]);

  // Estilo declarado en el bloque 00: resuelve la temporalidad de cada rol.
  const tradingStyle = tradingStyleFromAnswers(answers);

  const lastStep = blocks.length + 1;
  const currentBlock = step >= 1 && step <= blocks.length ? blocks[step - 1] : undefined;

  function setAnswer(qid: string, value: string) {
    setBlockError(null);
    // Cambiar una metadata condicional limpia las respuestas incompatibles.
    setAnswers((prev) => pruneInactiveAnswers({ ...prev, [qid]: value }, trade.setup));
  }

  function goTo(next: number) {
    setBlockError(null);
    setStep(next);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /** No se puede avanzar mientras el bloque actual esté incompleto. */
  function goNext() {
    if (step === 0) {
      if (!trade.setup) {
        toast.error("Selecciona un tipo de evaluación para comenzar.");
        return;
      }
      goTo(1);
      return;
    }
    if (currentBlock) {
      if (currentBlock.id === "comercio" && !trade.asset.trim()) {
        setBlockError("Falta el activo de la operación.");
        return;
      }
      if (missingInBlock(answers, trade.setup, currentBlock.id).length > 0) {
        setBlockError("Completa todas las preguntas antes de continuar.");
        return;
      }
    }
    goTo(Math.min(lastStep, step + 1));
  }

  function selectSetup(nextSetup: string) {
    if (nextSetup === trade.setup) return;
    const hasAnswers = Object.keys(answers).length > 0;
    if (
      hasAnswers &&
      typeof window !== "undefined" &&
      !window.confirm(
        "Cambiar el tipo de evaluación carga otra matriz de preguntas. Las respuestas que no pertenezcan a la nueva matriz se descartarán. ¿Continuar?",
      )
    ) {
      return;
    }
    setTrade((t) => ({ ...t, setup: nextSetup }));
    // Cambiar de setup reconstruye el cuestionario: las respuestas del setup
    // anterior no contaminan la nueva matriz.
    setAnswers((prev) => answersForSetup(prev, nextSetup));
    setBlockError(null);
    setStep(0);
  }

  async function persist(status: "draft" | "completed", decisionValue?: string) {
    if (!user) return null;
    setSaving(true);
    try {
      // El servidor recalcula score, clasificación, estado final y decisión efectiva:
      // el navegador sólo envía los datos fuente.
      const saved = await saveEvaluationServer({
        data: {
          ...(evalId ? { id: evalId } : {}),
          tradeDate: trade.trade_date,
          tradeTime: trade.trade_time || null,
          asset: trade.asset || null,
          market: trade.market,
          session: trade.session,
          direction: (trade.direction as "LONG" | "SHORT" | null) ?? null,
          setup: trade.setup || null,

          idea: trade.idea || null,
          answers,
          risk: risk as Record<string, number>,
          status,
          ...(decisionValue ? { decision: decisionValue as "registrado" | "no_trade" } : {}),
        },
      });
      setEvalId(saved.id);
      setTrade((t) => ({ ...t, trade_no: saved.trade_no }));
      queryClient.invalidateQueries({ queryKey: ["evaluations"] });
      return saved;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No fue posible guardar");
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function saveDraft() {
    const saved = await persist("draft");
    if (saved) toast.success("Borrador guardado");
    return saved;
  }

  async function exitAndContinue() {
    const saved = await saveDraft();
    if (saved) router.navigate({ to: "/dashboard" });
  }

  async function finish(decisionValue: "registrado" | "no_trade") {
    if (!trade.setup) {
      toast.error("Selecciona el tipo de evaluación antes de finalizar.");
      goTo(0);
      return;
    }
    if (!trade.asset.trim()) {
      toast.error("Falta el activo. Vuelve al bloque 00 Comercio.");
      goTo(1);
      return;
    }

    // Toda pregunta de la matriz activa es obligatoria: no hay "No aplica".
    const missing = missingActiveAnswers(answers, trade.setup);
    if (missing.length > 0) {
      const first = missing[0]!;
      toast.error(`Faltan ${missing.length} respuestas obligatorias del cuestionario.`);
      const index = blocks.findIndex((b) => b.questions.some((q) => q.id === first));
      if (index >= 0) goTo(index + 1);
      return;
    }

    // El servidor es la autoridad: aquí sólo se evita un envío que ya se sabe inválido.
    if (decisionValue === "registrado" && decision.finalState !== "APROBADA") {
      toast.error(
        decision.finalState === "CONDICIONAL"
          ? "La operación es CONDICIONAL: no cumple los gates obligatorios y no puede registrarse."
          : "La operación es NO TRADE por el sistema: no puede registrarse.",
      );
      return;
    }
    const saved = await persist("completed", decisionValue);
    if (!saved) return;
    toast.success(decisionValue === "registrado" ? "Trade registrado" : "Marcado como NO TRADE");
    router.navigate({ to: "/trade/$id", params: { id: saved.id } });
  }

  const completedBlocks = blocks.filter(
    (b) => missingInBlock(answers, trade.setup, b.id).length === 0,
  ).length;
  const progress =
    blocks.length === 0
      ? 0
      : step === 0
        ? 0
        : Math.round((Math.min(completedBlocks, blocks.length) / blocks.length) * 100);

  if (!catalog.ready) {
    return (
      <AppShell title="Nueva evaluación" subtitle="Preparando cuestionario">
        <p className="text-sm text-muted-foreground">Cargando cuestionario...</p>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Evaluación"
      subtitle={
        step === 0
          ? "Selecciona el tipo de evaluación"
          : currentBlock
            ? `${currentBlock.step} — ${currentBlock.title.toUpperCase()}`
            : "Decisión CORE"
      }
      action={
        <button
          onClick={exitAndContinue}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-surface px-3 text-sm"
        >
          <X className="h-4 w-4" /> Salir
        </button>
      }
    >
      {step > 0 && (
        <div className="sticky top-[92px] z-10 -mx-4 border-b border-border/60 bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-display text-sm font-semibold tracking-wide text-primary">
              {setupLabel(trade.setup)}
            </p>
            <p className="font-mono text-[11px] tabular-nums text-muted-foreground">
              {progress}% · {completedBlocks}/{blocks.length} bloques
            </p>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {blocks.map((b, i) => {
              const done = missingInBlock(answers, trade.setup, b.id).length === 0;
              const active = step === i + 1;
              const reachable = i + 1 <= step || done;
              return (
                <button
                  key={b.id}
                  onClick={() => (reachable ? goTo(i + 1) : undefined)}
                  disabled={!reachable}
                  className={cn(
                    "shrink-0 rounded-lg border px-2 py-1 font-mono text-[11px] tracking-widest transition-colors",
                    active
                      ? "border-primary/60 bg-primary/15 text-primary"
                      : done
                        ? "border-ok/40 bg-ok-soft/25 text-ok"
                        : "border-border text-muted-foreground",
                    !reachable && "opacity-45",
                  )}
                >
                  {done && !active ? "✓" : active ? "●" : "○"} {b.step}
                </button>
              );
            })}
            <button
              onClick={() => (completedBlocks === blocks.length ? goTo(lastStep) : undefined)}
              disabled={completedBlocks !== blocks.length}
              className={cn(
                "shrink-0 rounded-lg border px-2 py-1 font-mono text-[11px] tracking-widest",
                step === lastStep
                  ? "border-primary/60 bg-primary/15 text-primary"
                  : "border-border text-muted-foreground",
                completedBlocks !== blocks.length && "opacity-45",
              )}
            >
              ◆ DECISIÓN
            </button>
          </div>
        </div>
      )}

      <div className="mt-5 animate-fade">
        {step === 0 && <SetupStep selected={trade.setup} onSelect={selectSetup} />}

        {currentBlock && (
          <div className="space-y-4">
            {/* Bloques anteriores: cerrados, accesibles para modificar respuestas. */}
            {blocks.slice(0, step - 1).map((b, i) => (
              <button
                key={b.id}
                onClick={() => goTo(i + 1)}
                className="flex w-full items-center gap-3 rounded-xl border border-border bg-surface-2/60 px-4 py-3 text-left"
              >
                <Check className="h-4 w-4 text-ok" />
                <span className="font-mono text-xs tracking-widest text-muted-foreground">
                  {b.step}
                </span>
                <span className="text-sm text-foreground/80">{b.title}</span>
                <span className="ml-auto text-[11px] text-muted-foreground">Modificar</span>
              </button>
            ))}

            <section className="panel border-primary/25 p-4 sm:p-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-lg bg-primary/15 px-2 py-1 font-mono text-xs tracking-widest text-primary">
                  {currentBlock.step}
                </span>
                <h2 className="font-display text-lg font-semibold tracking-wide">
                  {currentBlock.title.toUpperCase()}
                </h2>
                <span className="ml-auto font-mono text-[11px] text-muted-foreground">
                  {currentBlock.questions.length -
                    missingInBlock(answers, trade.setup, currentBlock.id).length}
                  /{currentBlock.questions.length}
                </span>
              </div>

              {SETUP_TIMEFRAME_NOTE[trade.setup] && (
                <p className="mt-2 text-[11px] text-muted-foreground">
                  {SETUP_TIMEFRAME_NOTE[trade.setup]}
                </p>
              )}

              <div className="mt-4 space-y-5">
                {currentBlock.id === "comercio" && <TradeStep trade={trade} setTrade={setTrade} />}

                {currentBlock.id === "riesgo" && (
                  <RiskPanel
                    risk={risk}
                    setRisk={setRisk}
                    currency={settings?.currency ?? "USD"}
                    maxRiskPct={Number(settings?.max_risk_pct ?? 1)}
                    minRR={Number(settings?.min_rr ?? 2)}
                    direction={trade.direction}
                    market={trade.market}
                    setup={trade.setup}
                  />
                )}

                {currentBlock.id === "disciplina" && (
                  <div className="panel border-warn/30 bg-warn-soft/25 p-4">
                    <p className="label-mono">Filtro psicológico</p>
                    <p className="mt-1.5 text-sm text-muted-foreground">
                      Responde con honestidad. Este filtro no juzga tu análisis: revisa el motivo
                      real de la entrada.
                    </p>
                  </div>
                )}

                {currentBlock.groups.map((g, i) => (
                  <QuestionList
                    key={i}
                    groupTitle={g.title}
                    questions={g.questions}
                    answers={answers}
                    onChange={setAnswer}
                    style={tradingStyle}
                  />
                ))}

                {currentBlock.id === "disciplina" && decision.emotional && (
                  <div className="panel animate-rise border-stop/50 bg-stop-soft/40 p-5">
                    <div className="flex items-center gap-2 text-stop">
                      <AlertTriangle className="h-5 w-5" />
                      <p className="font-display text-lg font-semibold">EMOTIONAL STOP</p>
                    </div>
                    <p className="mt-2 text-sm text-foreground/90">
                      La operación presenta una señal de comportamiento impulsivo. Detén la
                      ejecución y vuelve a evaluar tu plan.
                    </p>
                  </div>
                )}
              </div>

              {blockError && (
                <p className="mt-4 flex items-center gap-2 text-xs text-warn">
                  <Lock className="h-3.5 w-3.5" /> {blockError}
                </p>
              )}
            </section>

            {/* Bloques siguientes: bloqueados hasta completar el actual. */}
            {blocks.slice(step).map((b) => (
              <div
                key={b.id}
                className="flex items-center gap-3 rounded-xl border border-dashed border-border/70 px-4 py-3 opacity-55"
              >
                <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="font-mono text-xs tracking-widest text-muted-foreground">
                  {b.step}
                </span>
                <span className="text-sm text-muted-foreground">{b.title}</span>
              </div>
            ))}
          </div>
        )}

        {step === lastStep && blocks.length > 0 && (
          <ResultStep
            decision={decision}
            metrics={metrics}
            trade={trade}
            answers={answers}
            currency={settings?.currency ?? "USD"}
            onRegister={() => finish("registrado")}
            onNoTrade={() => finish("no_trade")}
            saving={saving}
          />
        )}
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-2">
        <button
          onClick={() => goTo(Math.max(0, step - 1))}
          disabled={step === 0}
          className="inline-flex min-h-12 flex-1 items-center justify-center gap-1.5 rounded-xl border border-border bg-surface px-4 text-sm disabled:opacity-40 sm:flex-none"
        >
          <ChevronLeft className="h-4 w-4" /> Atrás
        </button>
        <button
          onClick={saveDraft}
          disabled={saving}
          className="inline-flex min-h-12 flex-1 items-center justify-center gap-1.5 rounded-xl border border-border bg-surface px-4 text-sm disabled:opacity-40 sm:flex-none"
        >
          <Save className="h-4 w-4" /> Guardar borrador
        </button>
        <button
          onClick={goNext}
          disabled={step === lastStep || !trade.setup}
          className="inline-flex min-h-12 flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-40 sm:flex-none"
        >
          Siguiente <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </AppShell>
  );
}

/**
 * Selección del tipo de evaluación: SETUP LIBRE (matriz original ANIKE EJEPIKA)
 * o uno de los 5 setups oficiales. Cada opción carga exclusivamente su matriz.
 */
function SetupStep({ selected, onSelect }: { selected: string; onSelect: (id: string) => void }) {
  return (
    <div className="space-y-4">
      <div className="panel p-4">
        <p className="font-display text-lg font-semibold tracking-wide">TIPO DE EVALUACIÓN</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Elige una única opción. Cada una carga exclusivamente su propia matriz de preguntas. El
          CORE ANIKE EJEPIKA es el mismo en todos los casos: no cambian pesos, gates ni reglas.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {EVALUATION_SETUPS.map((s) => {
          const on = selected === s.id;
          const total = getActiveQuestionsBySetup(s.id).length;
          return (
            <button
              key={s.id}
              onClick={() => onSelect(s.id)}
              aria-pressed={on}
              className={cn(
                "panel min-h-24 p-4 text-left transition-all",
                on
                  ? "border-primary bg-primary/10 ring-1 ring-primary/40"
                  : "border-border bg-surface-2 hover:border-primary/40",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className={cn("label-mono", on && "text-primary")}>{s.code}</span>
                {on && <span className="label-mono text-primary">SELECCIONADO</span>}
              </div>
              <p className="mt-1.5 font-display text-base font-semibold">{s.name}</p>
              <p className="mt-1 text-xs text-muted-foreground">{s.description}</p>
              <p className="mt-2 font-mono text-[11px] text-muted-foreground">
                {total} preguntas en esta matriz
              </p>
            </button>
          );
        })}
      </div>

      {!selected && (
        <p className="text-xs text-warn">Debes seleccionar un tipo de evaluación para continuar.</p>
      )}
    </div>
  );
}

function TradeStep({
  trade,
  setTrade,
}: {
  trade: TradeInfo;
  setTrade: (fn: (t: TradeInfo) => TradeInfo) => void;
}) {
  const set = <K extends keyof TradeInfo>(k: K, v: TradeInfo[K]) =>
    setTrade((t) => ({ ...t, [k]: v }));

  return (
    <div className="space-y-4">
      <div className="panel grid gap-4 p-4 sm:grid-cols-2">
        <div>
          <p className="label-mono">Trade # (provisional)</p>
          <p className="mt-2 font-mono text-sm tabular-nums text-muted-foreground">
            {trade.trade_no ?? "—"} · lo asigna el sistema al guardar
          </p>
        </div>
        <TextField
          label="Activo"
          value={trade.asset}
          onChange={(v) => set("asset", v)}
          placeholder="BTCUSDT"
        />
        <TextField
          label="Fecha"
          value={trade.trade_date}
          onChange={(v) => set("trade_date", v)}
          type="date"
        />
        <TextField
          label="Hora"
          value={trade.trade_time}
          onChange={(v) => set("trade_time", v)}
          type="time"
        />
        <SelectField
          label="Mercado"
          value={trade.market}
          options={MARKETS}
          onChange={(v) => set("market", v)}
        />
        <SelectField
          label="Sesión"
          value={trade.session}
          options={SESSIONS}
          onChange={(v) => set("session", v)}
        />
      </div>

      <div className="panel p-4">
        <p className="label-mono">Dirección</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {["LONG", "SHORT"].map((d) => (
            <button
              key={d}
              onClick={() => set("direction", d)}
              className={cn(
                "min-h-12 rounded-xl border text-sm font-semibold tracking-wide transition-all",
                trade.direction === d
                  ? d === "LONG"
                    ? "border-ok/60 bg-ok-soft/40 text-ok"
                    : "border-stop/60 bg-stop-soft/40 text-stop"
                  : "border-border bg-surface-2 text-muted-foreground",
              )}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      <div className="panel p-4">
        <p className="label-mono">Setup seleccionado</p>
        <p className="mt-2 text-sm font-semibold text-primary">{setupLabel(trade.setup)}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Se elige en el paso S. Los patrones individuales son criterios de la evaluación, no
          setups.
        </p>
      </div>

      <div className="panel p-4">
        <label className="block">
          <span className="label-mono">Descripción de la idea en una frase</span>
          <textarea
            value={trade.idea}
            onChange={(e) => set("idea", e.target.value)}
            rows={3}
            maxLength={280}
            placeholder="Ruptura del rango asiático con retesteo y continuación."
            className="mt-2 w-full rounded-xl border border-input bg-background p-3 text-base outline-none focus:border-primary"
          />
        </label>
      </div>
    </div>
  );
}

export function RiskPanel({
  risk,
  setRisk,
  currency,
  maxRiskPct,
  minRR,
  direction,
  market,
  setup,
}: {
  risk: RiskData;
  setRisk: (fn: (r: RiskData) => RiskData) => void;
  currency: string;
  maxRiskPct: number;
  minRR: number;
  direction?: string | undefined;
  market?: string | undefined;
  /** Fibonacci sólo es relevante en S04 (ZONA + FIBONACCI) y en la matriz original (SETUP LIBRE). */
  setup?: string | null | undefined;
}) {
  const m = computeRisk(risk, direction, {
    market: market ?? null,
    contractSize: risk.contractSize ?? null,
    pointValue: risk.pointValue ?? null,
  });
  const set = (k: keyof RiskData, v: string) =>
    setRisk((r) => ({ ...r, [k]: v === "" ? undefined : Number(v) }));

  const overRisk = m.riskPctUsed !== null && m.riskPctUsed > maxRiskPct;
  const underRR = m.rr !== null && m.rr < minRR;

  // Fibonacci es irrelevante en S01, S02, S03 y S05: sólo se muestra en S04 y SETUP LIBRE.
  const fiboRelevant = setup === "ZONA_FIBONACCI" || setup === "FREE" || !setup;
  const fibo = fiboProjection(risk, direction);
  // Divergencia entre el SL manual y el nivel 0,75: sólo se avisa, no se corrige.
  const slDivergence =
    fiboRelevant && fibo.sl !== null && risk.stop !== undefined && Number.isFinite(risk.stop)
      ? Math.abs(Number(risk.stop) - fibo.sl)
      : null;
  const slDiverges = slDivergence !== null && slDivergence > 0;

  return (
    <div className="panel p-4">
      <p className="label-mono">Calculadora de riesgo</p>
      <p className="label-mono mt-4 text-primary">1 · DATOS QUE INTRODUCES</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <TextField
          label={`Capital de cuenta (${currency})`}
          value={str(risk.capital)}
          onChange={(v) => set("capital", v)}
          type="number"
        />
        <TextField
          label="Riesgo máximo por operación %"
          value={str(risk.riskPct)}
          onChange={(v) => set("riskPct", v)}
          type="number"
        />
        <TextField
          label="Entrada"
          value={str(risk.entry)}
          onChange={(v) => set("entry", v)}
          type="number"
        />
        <TextField
          label="Stop"
          value={str(risk.stop)}
          onChange={(v) => set("stop", v)}
          type="number"
        />
        <TextField
          label="Objetivo"
          value={str(risk.target)}
          onChange={(v) => set("target", v)}
          type="number"
        />
        <TextField
          label="Tamaño de contrato del instrumento (opcional)"
          value={str(risk.contractSize)}
          onChange={(v) => set("contractSize", v)}
          type="number"
        />
        <TextField
          label="Valor por punto / tick (opcional)"
          value={str(risk.pointValue)}
          onChange={(v) => set("pointValue", v)}
          type="number"
        />
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        El tamaño de contrato y el valor por punto los tomamos sólo de lo que escribas: nunca
        inventamos la especificación de un instrumento.
      </p>

      {fiboRelevant && (
        <div className="mt-5 rounded-xl border border-border bg-surface-2 p-3">
          <p className="label-mono">Fibonacci del impulso</p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Introduce los extremos del impulso. El nivel 0,75 es el Stop Loss PREDETERMINADO
            sugerido: nunca se envía ninguna orden.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <TextField
              label="Máximo del impulso"
              value={str(risk.swingHigh)}
              onChange={(v) => set("swingHigh", v)}
              type="number"
            />
            <TextField
              label="Mínimo del impulso"
              value={str(risk.swingLow)}
              onChange={(v) => set("swingLow", v)}
              type="number"
            />
          </div>
          {fibo.levels.length > 0 && (
            <>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {fibo.levels.map((l) => (
                  <div
                    key={l.ratio}
                    className={cn(
                      "rounded-lg border p-2.5",
                      l.ratio === FIBO_SL_RATIO
                        ? "border-stop/50 bg-stop-soft/25"
                        : "border-border bg-surface",
                    )}
                  >
                    <p className="label-mono">
                      {l.ratio === FIBO_SL_RATIO ? "0,75 · SL" : String(l.ratio).replace(".", ",")}
                    </p>
                    <p className="mt-1 font-mono text-sm tabular-nums">{l.price}</p>
                  </div>
                ))}
              </div>
              {fibo.sl !== null && (
                <button
                  type="button"
                  onClick={() =>
                    setRisk((r) =>
                      fibo.sl === null ? r : { ...r, slFibo: fibo.sl, stop: fibo.sl },
                    )
                  }
                  className="mt-3 min-h-11 w-full rounded-xl border border-border bg-surface text-sm"
                >
                  Usar 0,75 ({fibo.sl}) como Stop Loss
                </button>
              )}
            </>
          )}
        </div>
      )}

      <p className="label-mono mt-6 text-primary">2 · CÁLCULOS</p>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Metric label={`Riesgo (${currency})`} value={m.riskMoney} />
        <Metric label="Distancia al stop" value={m.stopDistance} digits={5} />
        <Metric label="R:R" value={m.rr} tone={underRR ? "stop" : m.rr ? "ok" : "none"} />
        <Metric
          label={`Tamaño de posición${m.sizingUnit ? ` (${m.sizingUnit})` : ""}${
            m.sizingPrecision === "orientative" ? " · ORIENTATIVO" : ""
          }`}
          value={m.positionSize}
          digits={4}
          tone={m.sizingPrecision === "orientative" ? "warn" : "none"}
        />
      </div>

      <SizingStatus metrics={m} className="mt-2" />

      {(overRisk || underRR || slDiverges) && (
        <>
          <p className="label-mono mt-6 text-warn">3 · ADVERTENCIAS</p>
          <div className="mt-2 space-y-1.5 text-xs">
            {overRisk && (
              <p className="text-stop">
                El riesgo ({m.riskPctUsed}%) supera tu límite configurado ({maxRiskPct}%).
              </p>
            )}
            {underRR && (
              <p className="text-warn">
                El R:R ({m.rr}) está por debajo de tu mínimo configurado ({minRR}). Por debajo de
                1:1 la operación queda descartada.
              </p>
            )}
            {slDiverges && (
              <p className="text-warn">
                Tu Stop ({risk.stop}) no coincide con el nivel 0,75 de Fibonacci ({fibo.sl}):
                diferencia de {slDivergence}. Revisa cuál de los dos representa tu invalidación
                real.
              </p>
            )}
          </div>
        </>
      )}

      {m.sizingMissing.length > 0 && (
        <>
          <p className="label-mono mt-6">4 · QUÉ FALTA PARA UN CÁLCULO EXACTO</p>
          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
            {m.sizingMissing.map((x) => (
              <li key={x}>• {x}</li>
            ))}
          </ul>
        </>
      )}

      <p className="mt-3 text-[11px] text-muted-foreground">
        Los cálculos usan únicamente los valores que introduces. La herramienta no consulta precios
        reales ni se conecta a brokers.
      </p>
    </div>
  );
}

function str(v: number | undefined) {
  return v === undefined || v === null ? "" : String(v);
}

function Metric({
  label,
  value,
  tone,
  digits = 2,
}: {
  label: string;
  value: number | null;
  tone?: "ok" | "stop" | "warn" | "none";
  digits?: number;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface-2 p-3">
      <p className="label-mono">{label}</p>
      <p
        className={cn(
          "mt-1 font-mono text-base tabular-nums",
          tone === "ok" && "text-ok",
          tone === "warn" && "text-warn",
          tone === "stop" && "text-stop",
        )}
      >
        {value === null || value === undefined || !Number.isFinite(value)
          ? "—"
          : value.toFixed(digits)}
      </p>
    </div>
  );
}

function ResultStep({
  decision,
  metrics,
  trade,
  answers,
  currency,
  onRegister,
  onNoTrade,
  saving,
}: {
  decision: ReturnType<typeof evaluate>;
  metrics: ReturnType<typeof computeRisk>;
  trade: TradeInfo;
  answers: Answers;
  currency: string;
  onRegister: () => void;
  onNoTrade: () => void;
  saving: boolean;
}) {
  // Busca la etiqueta de una respuesta por id en TODA la checklist:
  // evita depender de la posición de la pregunta dentro del bloque.
  const labelOfAnswer = (qid: string) => {
    const value = answers[qid];
    if (value === undefined || value === "") return null;
    const q = SECTIONS.flatMap((s) => s.groups.flatMap((g) => g.questions)).find(
      (x) => x.id === qid,
    );
    return q?.options.find((o) => o.v === value)?.label ?? value;
  };
  const confirmation =
    labelOfAnswer("cf_signal") ??
    labelOfAnswer("cf5_diag_break") ??
    labelOfAnswer("cf_price_action");

  return (
    <div className="space-y-5">
      <p className="label-mono">Análisis completado</p>
      <div className="panel flex flex-col items-center gap-6 p-6 sm:flex-row sm:items-start">
        <ScoreDial score={decision.scoreVisible} light={decision.light} size={190} />
        <div className="w-full space-y-4">
          <div>
            <p className="font-display text-2xl font-semibold">{trade.asset || "—"}</p>
            <p className="text-sm text-muted-foreground">
              {trade.direction} · {trade.setup}
            </p>
          </div>
          <TrafficLight
            light={decision.light}
            classification={FINAL_STATE_UI[decision.finalState].label}
            message={decision.message}
          />
        </div>
      </div>

      <div
        className={cn(
          "panel animate-rise p-5",
          decision.finalState === "APROBADA" && "border-ok/50 bg-ok-soft/25",
          decision.finalState === "CONDICIONAL" && "border-warn/50 bg-warn-soft/25",
          decision.finalState === "NO TRADE" && "border-stop/50 bg-stop-soft/30",
        )}
      >
        <p className="font-display text-xl font-semibold">
          {FINAL_STATE_UI[decision.finalState].dot} OPERACIÓN{" "}
          {FINAL_STATE_UI[decision.finalState].label}
        </p>
        <p className="mt-2 text-sm text-foreground/90">
          {decision.finalState === "APROBADA"
            ? "Todos los criterios críticos se cumplen. La decisión de ejecutar sigue siendo tuya."
            : decision.finalState === "CONDICIONAL"
              ? "Hay elementos sin resolver: no puede registrarse como operación ANIKE EJEPIKA."
              : "Existe al menos una condición crítica incumplida: la operación no debe ejecutarse."}
        </p>
        {decision.gatesFailed.length > 0 && (
          <ul className="mt-3 space-y-1.5 text-sm text-foreground/90">
            {decision.gatesFailed.map((g) => (
              <li key={g} className="flex gap-2">
                <span className="text-warn">•</span> Gate obligatorio no alcanzado: {g}
              </li>
            ))}
          </ul>
        )}
        {decision.warnings.length > 0 && (
          <ul className="mt-3 space-y-1.5 text-sm text-foreground/90">
            {decision.warnings.map((w) => (
              <li key={w} className="flex gap-2">
                <span className="text-warn">•</span> {w}
              </li>
            ))}
          </ul>
        )}
      </div>

      {decision.globalInvalidations.length > 0 && (
        <div className="panel animate-rise border-stop/50 bg-stop-soft/35 p-5">
          <div className="flex items-center gap-2 text-stop">
            <AlertTriangle className="h-5 w-5" />
            <p className="font-display text-base font-semibold">INVALIDACIÓN GLOBAL — NO TRADE</p>
          </div>
          <p className="mt-2 text-sm">
            Tu score puede ser alto, pero los datos de la operación son objetivamente inválidos.
          </p>
          <ul className="mt-3 space-y-1.5 text-sm text-foreground/90">
            {decision.globalInvalidations.map((r) => (
              <li key={r} className="flex gap-2">
                <span className="text-stop">•</span> {r}
              </li>
            ))}
          </ul>
        </div>
      )}

      {decision.emotional && (
        <div className="panel border-stop/50 bg-stop-soft/35 p-5">
          <p className="font-display text-base font-semibold text-stop">DISCIPLINA: REVISAR</p>
          <p className="mt-2 text-sm">
            La operación presenta una señal de comportamiento impulsivo. Revisa tu plan antes de
            ejecutar.
          </p>
        </div>
      )}

      <div className="panel divide-y divide-border">
        {/* Score visible = floor del interno; la decisión usa el interno con decimales. */}
        <Row label="Score" value={`${decision.scoreVisible} / 100`} />
        <Row
          label="Estado final"
          value={`${FINAL_STATE_UI[decision.finalState].dot} ${FINAL_STATE_UI[decision.finalState].label}`}
        />

        <Row
          label="Riesgo"
          value={metrics.riskPctUsed === null ? "—" : `${metrics.riskPctUsed.toFixed(2)}%`}
        />
        <Row
          label={`Riesgo (${currency})`}
          value={metrics.riskMoney === null ? "—" : metrics.riskMoney.toFixed(2)}
        />
        <Row label="R:R" value={metrics.rr === null ? "—" : metrics.rr.toFixed(2)} />
        <Row
          label={`Tamaño de posición${metrics.sizingUnit ? ` (${metrics.sizingUnit})` : ""}`}
          value={
            metrics.positionSize === null
              ? "—"
              : `${metrics.positionSize}${metrics.sizingPrecision === "orientative" ? " · ORIENTATIVO" : ""}`
          }
        />

        <Row label="Confirmación" value={confirmation ?? "No registrado"} />
        <Row label="Disciplina" value={decision.emotional ? "REVISAR" : "OK"} />
      </div>

      {/* La exactitud del lotaje queda visible justo antes de decidir el registro. */}
      <SizingStatus metrics={metrics} className="px-1" />

      {decision.classification === "NO TRADE" && (
        <div className="panel border-primary/30 bg-primary/5 p-5">
          <p className="font-display text-base font-semibold">🤖 ANALIZAR CON ANIKE IA</p>
          <p className="mt-1 text-sm text-muted-foreground">
            ¿Quieres entender por qué esta operación fue descartada?
          </p>
          <button
            onClick={onNoTrade}
            disabled={saving}
            className="mt-4 min-h-12 w-full rounded-xl border border-primary/40 bg-primary/10 text-sm font-semibold tracking-wide text-primary disabled:opacity-50"
          >
            ANALIZAR CON IA
          </button>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Guardamos la evaluación como NO TRADE y ANIKE IA la revisará contigo. La IA no emite
            señales de compra o venta.
          </p>
        </div>
      )}

      <div className="panel p-5">
        <p className="font-display text-base font-semibold">¿Ejecutar esta operación?</p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <button
            onClick={onRegister}
            disabled={saving || decision.finalState !== "APROBADA"}
            className="min-h-13 rounded-xl bg-primary text-sm font-semibold tracking-wide text-primary-foreground transition-transform active:scale-[0.98] disabled:opacity-40"
          >
            REGISTRAR TRADE
          </button>
          <button
            onClick={onNoTrade}
            disabled={saving}
            className="min-h-13 rounded-xl border border-stop/50 bg-stop-soft/30 text-sm font-semibold tracking-wide text-stop"
          >
            NO TRADE
          </button>
        </div>
        {decision.finalState !== "APROBADA" && (
          <p className="mt-3 text-xs text-stop">
            El registro como entrada ANIKE EJEPIKA está desactivado: sólo una evaluación APROBADA
            (completa, sin reglas críticas, score ≥ 80 y todos los gates obligatorios cumplidos)
            puede registrarse.
          </p>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-5 py-3">
      <span className="label-mono">{label}</span>
      <span className="font-mono text-sm">{value}</span>
    </div>
  );
}

export function TextField({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="label-mono">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        inputMode={type === "number" ? "decimal" : undefined}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 min-h-12 w-full rounded-xl border border-input bg-background px-3.5 text-base outline-none focus:border-primary"
      />
    </label>
  );
}

export function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="label-mono">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 min-h-12 w-full rounded-xl border border-input bg-background px-3 text-base outline-none focus:border-primary"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}
