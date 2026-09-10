import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, Save, X } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { QuestionList } from "@/components/QuestionGroup";
import { ScoreDial } from "@/components/ScoreDial";
import { SizingStatus } from "@/components/SizingStatus";
import { TrafficLight } from "@/components/TrafficLight";
import { FIBO_SL_RATIO, MARKETS, SECTIONS, SESSIONS, SETUPS, WIZARD_STEPS } from "@/lib/checklist";
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
        content: "Checklist de 11 pasos para validar tu idea antes de entrar al mercado.",
      },
      { property: "og:title", content: "Nueva evaluación — ANIKE EJEPIKA" },
      { property: "og:description", content: "Checklist de 11 pasos antes de entrar al mercado." },
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
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [trade, setTrade] = useState<TradeInfo>({
    trade_no: null,
    trade_date: new Date().toISOString().slice(0, 10),
    trade_time: new Date().toTimeString().slice(0, 5),
    asset: "",
    market: MARKETS[0]!,
    session: SESSIONS[1]!,
    direction: "LONG",
    setup: SETUPS[0]!,
    idea: "",
  });
  const [answers, setAnswers] = useState<Answers>({});
  const [risk, setRisk] = useState<RiskData>({});

  const settings = settingsQuery.data;

  useEffect(() => {
    if (!settings) return;
    setTrade((t) => (t.trade_no === null ? t : t));
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
      setup: d.setup ?? SETUPS[0]!,
      idea: d.idea ?? "",
    });
    setAnswers(d.answers ?? {});
    setRisk(d.risk ?? {});
  }, [draftQuery.data]);

  const decision = useMemo(
    () =>
      evaluate({
        answers,
        risk,
        maxRiskPct: Number(settings?.max_risk_pct ?? 1),
        setup: trade.setup,
        preferredSetups: settings?.preferred_setups ?? [],
        direction: trade.direction,
        market: trade.market ?? null,
      }),
    [answers, risk, settings, trade.setup, trade.direction, trade.market],
  );
  const metrics = useMemo(
    () => computeRisk(risk, trade.direction, { market: trade.market ?? null }),
    [risk, trade.direction, trade.market],
  );

  const currentStep = WIZARD_STEPS[step]!;
  const section = SECTIONS.find((s) => s.id === currentStep.key);

  function setAnswer(qid: string, value: string) {
    setAnswers((prev) => ({ ...prev, [qid]: value }));
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
          setup: trade.setup,
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
    if (!trade.asset.trim()) {
      toast.error("Falta el activo. Vuelve al paso 00 Trade.");
      setStep(0);
      return;
    }
    if (
      decisionValue === "registrado" &&
      (decision.blocked || decision.finalState === "DESCARTADA")
    ) {
      toast.error("La operación está DESCARTADA por el sistema: no puede registrarse.");
      return;
    }
    const saved = await persist("completed", decisionValue);
    if (!saved) return;
    toast.success(decisionValue === "registrado" ? "Trade registrado" : "Marcado como NO TRADE");
    router.navigate({ to: "/trade/$id", params: { id: saved.id } });
  }

  const progress = ((step + 1) / WIZARD_STEPS.length) * 100;

  return (
    <AppShell
      title="Nueva evaluación"
      subtitle={`${currentStep.step} ${currentStep.title}`}
      action={
        <button
          onClick={exitAndContinue}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-surface px-3 text-sm"
        >
          <X className="h-4 w-4" /> Salir
        </button>
      }
    >
      <div className="sticky top-[92px] z-10 -mx-4 bg-background/90 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {WIZARD_STEPS.map((s, i) => (
            <button
              key={s.key}
              onClick={() => setStep(i)}
              className={cn(
                "shrink-0 rounded-lg px-2.5 py-1 font-mono text-[11px] tracking-widest transition-colors",
                i === step
                  ? "bg-primary/20 text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {s.step} {s.title.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 animate-fade">
        {currentStep.key === "trade" && <TradeStep trade={trade} setTrade={setTrade} />}

        {section && section.id !== "riesgo" && section.id !== "disciplina" && (
          <div className="space-y-6">
            {section.groups.map((g, i) => (
              <QuestionList
                key={i}
                groupTitle={g.title}
                questions={g.questions}
                answers={answers}
                onChange={setAnswer}
              />
            ))}
          </div>
        )}

        {section?.id === "riesgo" && (
          <div className="space-y-5">
            <RiskPanel
              risk={risk}
              setRisk={setRisk}
              currency={settings?.currency ?? "USD"}
              maxRiskPct={Number(settings?.max_risk_pct ?? 1)}
              minRR={Number(settings?.min_rr ?? 2)}
              direction={trade.direction}
              market={trade.market}
            />
            {section.groups.map((g, i) => (
              <QuestionList
                key={i}
                questions={g.questions}
                answers={answers}
                onChange={setAnswer}
              />
            ))}
          </div>
        )}

        {section?.id === "disciplina" && (
          <div className="space-y-5">
            <div className="panel border-warn/30 bg-warn-soft/25 p-4">
              <p className="label-mono">Filtro psicológico</p>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Responde con honestidad. Este filtro no juzga tu análisis: revisa el motivo real de
                la entrada.
              </p>
            </div>
            {section.groups.map((g, i) => (
              <QuestionList
                key={i}
                questions={g.questions}
                answers={answers}
                onChange={setAnswer}
              />
            ))}
            {decision.emotional && (
              <div className="panel animate-rise border-stop/50 bg-stop-soft/40 p-5">
                <div className="flex items-center gap-2 text-stop">
                  <AlertTriangle className="h-5 w-5" />
                  <p className="font-display text-lg font-semibold">EMOTIONAL STOP</p>
                </div>
                <p className="mt-2 text-sm text-foreground/90">
                  La operación presenta una señal de comportamiento impulsivo. Detén la ejecución y
                  vuelve a evaluar tu plan.
                </p>
              </div>
            )}
          </div>
        )}

        {currentStep.key === "resultado" && (
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
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
          className="inline-flex min-h-12 flex-1 items-center justify-center gap-1.5 rounded-xl border border-border bg-surface px-4 text-sm disabled:opacity-40 sm:flex-none"
        >
          <ChevronLeft className="h-4 w-4" /> Anterior
        </button>
        <button
          onClick={saveDraft}
          disabled={saving}
          className="inline-flex min-h-12 flex-1 items-center justify-center gap-1.5 rounded-xl border border-border bg-surface px-4 text-sm disabled:opacity-40 sm:flex-none"
        >
          <Save className="h-4 w-4" /> Guardar borrador
        </button>
        <button
          onClick={() => setStep((s) => Math.min(WIZARD_STEPS.length - 1, s + 1))}
          disabled={step === WIZARD_STEPS.length - 1}
          className="inline-flex min-h-12 flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-40 sm:flex-none"
        >
          Siguiente <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </AppShell>
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
        <p className="label-mono">Setup</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {SETUPS.map((s) => (
            <button
              key={s}
              onClick={() => set("setup", s)}
              className={cn(
                "min-h-11 rounded-xl border px-4 text-sm transition-all",
                trade.setup === s
                  ? "border-primary bg-primary/15"
                  : "border-border bg-surface-2 text-muted-foreground",
              )}
            >
              {s}
            </button>
          ))}
        </div>
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
}: {
  risk: RiskData;
  setRisk: (fn: (r: RiskData) => RiskData) => void;
  currency: string;
  maxRiskPct: number;
  minRR: number;
  direction?: string | undefined;
  market?: string | undefined;
}) {
  const m = computeRisk(risk, direction, { market: market ?? null });
  const set = (k: keyof RiskData, v: string) =>
    setRisk((r) => ({ ...r, [k]: v === "" ? undefined : Number(v) }));

  const overRisk = m.riskPctUsed !== null && m.riskPctUsed > maxRiskPct;
  const underRR = m.rr !== null && m.rr < minRR;

  const fibo = fiboProjection(risk, direction);

  return (
    <div className="panel p-4">
      <p className="label-mono">Calculadora de riesgo</p>
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
      </div>

      <div className="mt-5 rounded-xl border border-border bg-surface-2 p-3">
        <p className="label-mono">Fibonacci del impulso</p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Introduce los extremos del impulso. El nivel 0,75 es el Stop Loss PREDETERMINADO sugerido:
          nunca se envía ninguna orden.
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
                  setRisk((r) => (fibo.sl === null ? r : { ...r, slFibo: fibo.sl, stop: fibo.sl }))
                }
                className="mt-3 min-h-11 w-full rounded-xl border border-border bg-surface text-sm"
              >
                Usar 0,75 ({fibo.sl}) como Stop Loss
              </button>
            )}
          </>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
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

      {(overRisk || underRR) && (
        <div className="mt-3 space-y-1.5 text-xs">
          {overRisk && (
            <p className="text-stop">
              El riesgo ({m.riskPctUsed}%) supera tu límite configurado ({maxRiskPct}%).
            </p>
          )}
          {underRR && (
            <p className="text-warn">
              El R:R ({m.rr}) está por debajo de tu mínimo configurado ({minRR}). Por debajo de 1:2
              la operación queda descartada.
            </p>
          )}
        </div>
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
        <ScoreDial score={decision.score} light={decision.light} size={190} />
        <div className="w-full space-y-4">
          <div>
            <p className="font-display text-2xl font-semibold">{trade.asset || "—"}</p>
            <p className="text-sm text-muted-foreground">
              {trade.direction} · {trade.setup}
            </p>
          </div>
          <TrafficLight
            light={decision.light}
            classification={decision.classification}
            message={decision.message}
          />
        </div>
      </div>

      <div
        className={cn(
          "panel animate-rise p-5",
          decision.finalState === "APROBADA" && "border-ok/50 bg-ok-soft/25",
          decision.finalState === "CONDICIONAL" && "border-warn/50 bg-warn-soft/25",
          decision.finalState === "DESCARTADA" && "border-stop/50 bg-stop-soft/30",
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
              ? "Hay elementos sin resolver: espera confirmación antes de ejecutar."
              : "Existe al menos una condición crítica incumplida: la operación no debe ejecutarse."}
        </p>
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

      {decision.hardRules.length > 0 && (
        <div className="panel animate-rise border-stop/50 bg-stop-soft/35 p-5">
          <div className="flex items-center gap-2 text-stop">
            <AlertTriangle className="h-5 w-5" />
            <p className="font-display text-base font-semibold">HARD NO-TRADE RULE</p>
          </div>
          <p className="mt-2 text-sm">
            Tu score puede ser alto, pero una regla crítica fue incumplida. La operación queda
            bloqueada.
          </p>
          <ul className="mt-3 space-y-1.5 text-sm text-foreground/90">
            {decision.hardRules.map((r) => (
              <li key={r} className="flex gap-2">
                <span className="text-stop">•</span> {r}
              </li>
            ))}
          </ul>
        </div>
      )}

      {decision.emotional && (
        <div className="panel border-stop/50 bg-stop-soft/35 p-5">
          <p className="font-display text-base font-semibold text-stop">EMOTIONAL STOP</p>
          <p className="mt-2 text-sm">
            La operación presenta una señal de comportamiento impulsivo. Detén la ejecución y vuelve
            a evaluar tu plan.
          </p>
        </div>
      )}

      <div className="panel divide-y divide-border">
        <Row label="Score" value={`${decision.score} / 100`} />
        <Row label="Clasificación" value={decision.classification} />
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
            disabled={saving || decision.blocked || decision.finalState === "DESCARTADA"}
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
        {(decision.blocked || decision.finalState === "DESCARTADA") && (
          <p className="mt-3 text-xs text-stop">
            El registro como entrada aprobada está desactivado: la operación está DESCARTADA por
            reglas críticas, score insuficiente o señales impulsivas.
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
