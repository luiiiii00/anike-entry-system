import { useMemo, useState } from "react";
import { ChevronDown, Info as InfoIcon } from "lucide-react";
import {
  LEVERAGE_NOTE,
  analyzeLeverage,
  analyzePostTradeAll,
  finite,
  type PlannedRef,
  type RealRef,
  type Verdict,
} from "@/lib/posttrade-analytics";
import { CURRENCIES, fmtMoney, fmtNumber, fmtPercent, fmtR, type Currency } from "@/lib/posttrade";
import { computeRisk } from "@/lib/scoring";
import { SizingStatus } from "@/components/SizingStatus";
import type { Evaluation } from "@/lib/db";
import { cn } from "@/lib/utils";

/**
 * POST-TRADE ANALYTICS — analítica de operaciones cerradas.
 * Todos los valores financieros que se muestran provienen de los campos
 * calculados y guardados en servidor. El cliente sólo presenta y ofrece
 * calculadoras auxiliares (riesgo/lotaje y apalancamiento) que NO se persisten
 * y NO influyen en la aprobación de ninguna entrada.
 */

const toneClass = (v: Verdict) =>
  v === "ok" ? "text-ok" : v === "warn" ? "text-warn" : v === "bad" ? "text-stop" : "text-muted-foreground";

const borderClass = (v: Verdict) =>
  v === "ok"
    ? "border-ok/40"
    : v === "warn"
      ? "border-warn/40"
      : v === "bad"
        ? "border-stop/40"
        : "border-border";

const NA = "No disponible";

function plannedFrom(e: Evaluation): PlannedRef {
  const risk = (e.risk ?? {}) as Record<string, unknown>;
  return {
    entry: finite(risk["entry"]),
    stopLoss: finite(risk["stop"]) ?? finite(risk["slFibo"]),
    takeProfit: finite(risk["target"]),
    riskPct: finite(risk["riskPct"]),
    capital: finite(risk["capital"]),
  };
}

function realFrom(e: Evaluation, capital: number): RealRef {
  const saved = (e.post_trade_inputs ?? {}) as Record<string, unknown>;
  return {
    direction: e.direction === "SHORT" ? "SHORT" : e.direction === "LONG" ? "LONG" : null,
    entry: finite(e.entry_price),
    exit: finite(e.exit_price),
    stopLoss: finite(e.stop_loss),
    takeProfit: finite(e.take_profit),
    quantity: finite(e.quantity),
    netPnl: finite(e.net_pnl),
    grossPnl: finite(e.gross_pnl),
    fees: finite(e.fees),
    riskAmount: finite(e.risk_amount),
    riskPercent: finite(e.risk_percent),
    plannedRr: finite(e.planned_rr),
    resultR: finite(e.result_r),
    capital: finite(saved["capital"]) ?? finite(capital),
    leverage: finite(e.leverage),
    margin: finite(e.margin),
    notionalValue: finite(e.notional_value),
    ema50: finite(saved["ema50"]),
    maxFavorablePrice: finite(saved["maxFavorablePrice"]),
    followedPlan: e.followed_plan,
    emotionalStop: e.emotional_stop,
    hardRules: e.hard_rules,
  };
}

export function PostTradeAnalytics({
  evaluation,
  capital,
  currency,
}: {
  evaluation: Evaluation;
  capital: number;
  currency: string;
}) {
  const cur: Currency = (CURRENCIES as readonly string[]).includes(evaluation.currency ?? "")
    ? (evaluation.currency as Currency)
    : (CURRENCIES as readonly string[]).includes(currency)
      ? (currency as Currency)
      : "USD";

  const planned = useMemo(() => plannedFrom(evaluation), [evaluation]);
  const real = useMemo(() => realFrom(evaluation, capital), [evaluation, capital]);
  const a = useMemo(() => analyzePostTradeAll(planned, real), [planned, real]);

  const closed = !!evaluation.calculated_at && a.result.netPnl !== null;

  return (
    <section className="mt-8 space-y-3">
      <div>
        <p className="label-mono">POST-TRADE ANALYTICS</p>
        <p className="font-display text-lg font-semibold">
          Cerrar operación → analizar resultado
        </p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Analítica de una operación ya cerrada. Mide lo registrado; no predice resultados
          futuros ni modifica la evaluación de entrada.
        </p>
      </div>

      {!closed ? (
        <div className="panel p-4">
          <p className="text-sm text-muted-foreground">
            Registra el cierre de la operación arriba para ver la analítica completa.
          </p>
        </div>
      ) : (
        <>
          {/* MÓDULO 1 — Resumen del resultado */}
          <div className="panel p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="label-mono">RESULTADO</p>
              <span
                className={cn(
                  "text-sm font-semibold",
                  a.result.status === "GANANCIA"
                    ? "text-ok"
                    : a.result.status === "PÉRDIDA"
                      ? "text-stop"
                      : "text-warn",
                )}
              >
                {a.result.status ?? NA}
              </span>
            </div>
            <p
              className={cn(
                "mt-2 font-display text-4xl font-semibold tabular-nums",
                (a.result.resultR ?? 0) > 0
                  ? "text-ok"
                  : (a.result.resultR ?? 0) < 0
                    ? "text-stop"
                    : "text-warn",
              )}
            >
              {fmtR(a.result.resultR)}
            </p>
            <p className="mt-1 font-mono text-xl tabular-nums">{fmtMoney(a.result.netPnl, cur)}</p>
            <p className="text-xs text-muted-foreground">
              {a.result.percentOnCapital === null
                ? `% del capital: ${NA}`
                : `${fmtPercent(a.result.percentOnCapital)} del capital`}
            </p>

            {/* MÓDULO 6 — Scorecard */}
            <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {a.scorecard.map((s) => (
                <div key={s.area} className={cn("rounded-xl border bg-surface-2 p-3", borderClass(s.verdict))}>
                  <p className="label-mono">{s.area}</p>
                  <p className={cn("mt-1 text-sm font-medium", toneClass(s.verdict))}>{s.label}</p>
                </div>
              ))}
            </div>

            {/* MÓDULO 7 — Diagnóstico */}
            <div className={cn("mt-4 rounded-xl border bg-surface p-3", borderClass(a.diagnosis.verdict))}>
              <p className="label-mono">DIAGNÓSTICO POST-TRADE</p>
              <p className={cn("mt-1 text-sm leading-relaxed", toneClass(a.diagnosis.verdict))}>
                {a.diagnosis.text}
              </p>
            </div>
          </div>

          <Expandable title="Detalle del resultado" hint="Distancias, costes y R real.">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Cell label="Entry → SL" value={fmtNumber(a.result.stopDistance, 6)} />
              <Cell label="Entry → TP" value={fmtNumber(a.result.targetDistance, 6)} />
              <Cell label="Entry → Cierre" value={fmtNumber(a.result.closeDistance, 6)} />
              <Cell label="Riesgo planificado" value={fmtMoney(a.result.plannedRiskMoney, cur)} />
              <Cell label="Reward planificado" value={fmtMoney(a.result.plannedRewardMoney, cur)} />
              <Cell label="P/L bruto" value={fmtMoney(a.result.grossPnl, cur)} />
              <Cell label="Costes" value={fmtMoney(a.result.costs === null ? null : -Math.abs(a.result.costs), cur)} />
              <Cell label="P/L neto" value={fmtMoney(a.result.netPnl, cur)} />
              <Cell label="R real" value={fmtR(a.result.resultR)} />
              <Cell
                label="Riesgo realizado / planificado"
                value={
                  a.result.riskUsedPercentOfPlan === null
                    ? NA
                    : `${a.result.riskUsedPercentOfPlan.toFixed(1)}%`
                }
              />
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
              R real = P/L neto ÷ riesgo monetario planificado, sólo cuando el riesgo es mayor
              que cero. LONG: cierre − entrada. SHORT: entrada − cierre.
            </p>
          </Expandable>

          {/* MÓDULO 4 — Plan vs Real */}
          <Expandable title="Plan vs Real" hint="Desviaciones objetivas frente al plan.">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-border bg-surface-2 p-3">
                <p className="label-mono">PLANIFICADO</p>
                <Line label="Entrada" value={fmtNumber(planned.entry, 6)} />
                <Line label="Stop Loss" value={fmtNumber(planned.stopLoss, 6)} />
                <Line label="Take Profit" value={fmtNumber(planned.takeProfit, 6)} />
                <Line label="R:R planificado" value={fmtNumber(real.plannedRr, 2)} />
                <Line
                  label="Riesgo planificado"
                  value={planned.riskPct === null ? NA : `${planned.riskPct}%`}
                />
              </div>
              <div className="rounded-xl border border-border bg-surface-2 p-3">
                <p className="label-mono">REAL</p>
                <Line label="Entrada real" value={fmtNumber(real.entry, 6)} />
                <Line label="Precio de cierre" value={fmtNumber(real.exit, 6)} />
                <Line label="R obtenido" value={fmtR(a.result.resultR)} />
                <Line label="P/L neto" value={fmtMoney(a.result.netPnl, cur)} />
                <Line
                  label="Riesgo asumido"
                  value={real.riskPercent === null ? NA : `${Number(real.riskPercent).toFixed(2)}%`}
                />
              </div>
            </div>
            <div className="mt-3 space-y-2">
              {a.deviations.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {NA}: faltan datos del plan para comparar.
                </p>
              ) : (
                a.deviations.map((d) => (
                  <div key={d.kind} className={cn("rounded-xl border bg-surface p-3", borderClass(d.verdict))}>
                    <p className={cn("text-sm font-medium", toneClass(d.verdict))}>{d.label}</p>
                    <p className="text-xs text-muted-foreground">{d.detail}</p>
                  </div>
                ))
              )}
            </div>
          </Expandable>

          {/* MÓDULO 5 — EMA 50 */}
          <Expandable title="EMA 50 como objetivo dinámico" hint="Analítica histórica, no cambia el motor.">
            {a.ema50.ema50 === null ? (
              <p className="text-sm text-muted-foreground">
                {NA}: registra la EMA 50 del momento de la operación en el cierre para ver este
                análisis.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Cell label="EMA 50" value={fmtNumber(a.ema50.ema50, 6)} />
                <Cell label="Entry → EMA 50" value={fmtNumber(a.ema50.entryDistance, 6)} />
                <Cell label="TP inicial" value={fmtNumber(a.ema50.initialTarget, 6)} />
                <Cell label="Precio de cierre" value={fmtNumber(a.ema50.closePrice, 6)} />
                <Cell
                  label="¿Alcanzó EMA 50?"
                  value={
                    a.ema50.reachedBeforeClose === null
                      ? NA
                      : a.ema50.reachedBeforeClose
                        ? "Sí"
                        : "No"
                  }
                />
                <Cell
                  label="Recorrido capturado / potencial"
                  value={
                    a.ema50.capturedPercentOfPotential === null
                      ? NA
                      : `${a.ema50.capturedPercentOfPotential.toFixed(1)}%`
                  }
                />
              </div>
            )}
          </Expandable>
        </>
      )}

      {/* MÓDULO 2 — Riesgo y lotaje (auxiliar, no se persiste) */}
      <RiskSizingCard defaultCapital={capital} currency={cur} planned={planned} market={evaluation.market_type ?? evaluation.market ?? ""} direction={real.direction ?? "LONG"} />

      {/* MÓDULO 3 — Apalancamiento (auxiliar, educativo) */}
      <LeverageCard defaultCapital={capital} currency={cur} notional={real.notionalValue} leverage={real.leverage} />
    </section>
  );
}

/* ------------------------------ MÓDULO 2 UI ------------------------------- */

function RiskSizingCard({
  defaultCapital,
  currency,
  planned,
  market,
  direction,
}: {
  defaultCapital: number;
  currency: Currency;
  planned: PlannedRef;
  market: string;
  direction: string;
}) {
  const [capital, setCapital] = useState(String(defaultCapital ?? ""));
  const [riskPct, setRiskPct] = useState(planned.riskPct === null ? "1" : String(planned.riskPct));
  const [entry, setEntry] = useState(planned.entry === null ? "" : String(planned.entry));
  const [stop, setStop] = useState(planned.stopLoss === null ? "" : String(planned.stopLoss));
  const [mkt, setMkt] = useState(market);
  const [spec, setSpec] = useState("");

  const m = useMemo(
    () =>
      computeRisk(
        {
          capital: finite(capital) ?? undefined,
          riskPct: finite(riskPct) ?? undefined,
          entry: finite(entry) ?? undefined,
          stop: finite(stop) ?? undefined,
        } as never,
        direction,
        { market: mkt || null, contractSize: finite(spec) },
      ),
    [capital, riskPct, entry, stop, mkt, spec, direction],
  );

  return (
    <Expandable title="Riesgo y lotaje" hint="Calcula tu riesgo y el tamaño de posición." defaultOpen>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <NumField label="Capital" value={capital} onChange={setCapital} />
        <NumField label="Riesgo %" value={riskPct} onChange={setRiskPct} />
        <NumField label="Entrada" value={entry} onChange={setEntry} />
        <NumField label="Stop Loss" value={stop} onChange={setStop} />
        <label className="block">
          <span className="label-mono">Mercado / instrumento</span>
          <select
            value={mkt}
            onChange={(e) => setMkt(e.target.value)}
            className="mt-1.5 min-h-11 w-full rounded-xl border border-input bg-background px-3 text-base"
          >
            <option value="">Sin declarar</option>
            {["CRYPTO", "FOREX", "CFD", "FUTURES", "INDICES"].map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </label>
        <NumField
          label="Tamaño de contrato / valor por punto"
          value={spec}
          onChange={setSpec}
          hint="Sólo si tu bróker lo especifica. Nunca se inventa."
        />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Cell label="Tu riesgo planificado" value={m.riskPctUsed === null ? NA : `${m.riskPctUsed}%`} />
        <Cell label="Pérdida máxima estimada" value={fmtMoney(m.riskMoney, currency)} />
        <Cell label="Distancia del SL" value={fmtNumber(m.stopDistance, 6)} />
        <Cell
          label={`Lotaje recomendado${m.sizingUnit ? ` (${m.sizingUnit})` : ""}`}
          value={m.positionSize === null ? NA : fmtNumber(m.positionSize, 4)}
        />
      </div>
      <div className="mt-3">
        <p className="label-mono">Precisión del cálculo</p>
        <SizingStatus metrics={m} className="mt-1" />
      </div>
    </Expandable>
  );
}

/* ------------------------------ MÓDULO 3 UI ------------------------------- */

function LeverageCard({
  defaultCapital,
  currency,
  notional,
  leverage,
}: {
  defaultCapital: number;
  currency: Currency;
  notional: number | null | undefined;
  leverage: number | null | undefined;
}) {
  const [capital, setCapital] = useState(String(defaultCapital ?? ""));
  const [position, setPosition] = useState(notional ? String(notional) : "");
  const [lev, setLev] = useState(leverage ? String(leverage) : "");

  const l = useMemo(
    () =>
      analyzeLeverage({
        capital: finite(capital),
        notional: finite(position),
        leverage: finite(lev),
      }),
    [capital, position, lev],
  );

  return (
    <Expandable title="Apalancamiento y margen" hint="Cómo el apalancamiento afecta al margen.">
      <div className="grid gap-3 sm:grid-cols-3">
        <NumField label="Capital" value={capital} onChange={setCapital} />
        <NumField label="Tamaño de posición (exposición)" value={position} onChange={setPosition} />
        <NumField label="Apalancamiento (x)" value={lev} onChange={setLev} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Cell label="Capital" value={fmtMoney(l.capital, currency)} />
        <Cell label="Tamaño de posición" value={fmtMoney(l.notional, currency)} />
        <Cell label="Apalancamiento" value={l.leverage === null ? NA : `${l.leverage}x`} />
        <Cell label="Margen estimado" value={fmtMoney(l.margin, currency)} />
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">{LEVERAGE_NOTE}</p>
    </Expandable>
  );
}

/* --------------------------------- Átomos -------------------------------- */

function Expandable({
  title,
  hint,
  children,
  defaultOpen = false,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="panel overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-13 w-full items-center justify-between gap-3 px-4 text-left"
      >
        <span>
          <span className="block text-sm font-semibold">{title}</span>
          {hint && <span className="block text-[11px] text-muted-foreground">{hint}</span>}
        </span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", open && "rotate-180")} />
      </button>
      {open && <div className="border-t border-border p-4">{children}</div>}
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="label-mono">{label}</p>
      <p className="mt-1 font-mono text-sm tabular-nums">{value}</p>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="mt-2 flex items-baseline justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono tabular-nums">{value}</span>
    </div>
  );
}

function NumField({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="label-mono">{label}</span>
      <input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={value}
        onChange={(e) => {
          const cleaned = e.target.value.replace(/[^0-9.,-]/g, "").replace(",", ".");
          if (cleaned === "" || /^-?\d*\.?\d*$/.test(cleaned)) onChange(cleaned);
        }}
        className="mt-1.5 min-h-11 w-full rounded-xl border border-input bg-background px-3 text-base outline-none focus:border-primary"
      />
      {hint && (
        <span className="mt-1 flex items-start gap-1 text-[11px] leading-snug text-muted-foreground">
          <InfoIcon className="mt-0.5 h-3 w-3 shrink-0" /> {hint}
        </span>
      )}
    </label>
  );
}
