import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Calculator } from "lucide-react";
import { savePostTradeFn } from "@/lib/posttrade.functions";
import {
  CURRENCIES,
  MARKETS,
  RESULT_LABEL,
  SIZE_HINTS,
  calculatePostTrade,
  defaultContractSize,
  defaultDecimals,
  fmtMoney,
  fmtNumber,
  fmtPercent,
  fmtR,
  fmtRatio,
  validatePostTrade,
  type Currency,
  type Direction,
  type FeeMode,
  type MarketType,
  type PostTradeInput,
  type PostTradeResult,
} from "@/lib/posttrade";
import type { Evaluation } from "@/lib/db";
import { cn } from "@/lib/utils";

type Form = {
  marketType: MarketType;
  direction: Direction;
  symbol: string;
  entryDate: string;
  exitDate: string;
  entryPrice: string;
  exitPrice: string;
  quantity: string;
  lotSize: string;
  contractSize: string;
  leverage: string;
  margin: string;
  capital: string;
  stopLoss: string;
  takeProfit: string;
  feeMode: FeeMode;
  feeTotal: string;
  feeEntry: string;
  feeExit: string;
  feePercent: string;
  otherCosts: string;
  currency: Currency;
  decimals: string;
  ema50: string;
  ema50Close: string;
  maxFavorablePrice: string;
  maxAdversePrice: string;
};

const n = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));

function initialForm(e: Evaluation, capital: number, currency: string): Form {
  const saved = (e.post_trade_inputs ?? {}) as Partial<Record<keyof Form, unknown>>;
  const risk = (e.risk ?? {}) as Record<string, unknown>;
  const str = (v: unknown) =>
    v === null || v === undefined || v === "" ? "" : String(v);
  const market = (saved.marketType as MarketType) ?? (MARKETS as readonly string[]).includes(e.market ?? "")
    ? ((saved.marketType as MarketType) ?? (e.market as MarketType))
    : "CRYPTO";
  return {
    marketType: (saved.marketType as MarketType) ?? (market as MarketType) ?? "CRYPTO",
    direction: (saved.direction as Direction) ?? (e.direction === "SHORT" ? "SHORT" : "LONG"),
    symbol: str(saved.symbol ?? e.asset),
    entryDate: str(saved.entryDate ?? e.trade_date),
    exitDate: str(saved.exitDate),
    entryPrice: str(saved.entryPrice ?? risk["entry"]),
    exitPrice: str(saved.exitPrice),
    quantity: str(saved.quantity ?? risk["size"]),
    lotSize: str(saved.lotSize),
    contractSize: str(saved.contractSize),
    leverage: str(saved.leverage),
    margin: str(saved.margin),
    capital: str(saved.capital ?? capital),
    // Si no se registró un stop manual, se prefija el SL predeterminado por Fibonacci 0,75.
    stopLoss: str(saved.stopLoss ?? risk["stop"] ?? risk["slFibo"]),
    takeProfit: str(saved.takeProfit ?? risk["target"]),
    feeMode: (saved.feeMode as FeeMode) ?? "none",
    feeTotal: str(saved.feeTotal),
    feeEntry: str(saved.feeEntry),
    feeExit: str(saved.feeExit),
    feePercent: str(saved.feePercent),
    otherCosts: str(saved.otherCosts),
    currency: (saved.currency as Currency) ?? ((CURRENCIES as readonly string[]).includes(currency) ? (currency as Currency) : "USD"),
    decimals: str(saved.decimals),
    ema50: str(saved.ema50),
    ema50Close: str(saved.ema50Close),
    maxFavorablePrice: str(saved.maxFavorablePrice),
    maxAdversePrice: str(saved.maxAdversePrice),
  };
}

function toInput(f: Form): PostTradeInput {
  return {
    marketType: f.marketType,
    direction: f.direction,
    symbol: f.symbol.trim() || null,
    entryDate: f.entryDate || null,
    exitDate: f.exitDate || null,
    entryPrice: n(f.entryPrice),
    exitPrice: n(f.exitPrice),
    quantity: n(f.quantity),
    lotSize: n(f.lotSize),
    contractSize: n(f.contractSize),
    leverage: n(f.leverage),
    margin: n(f.margin),
    capital: n(f.capital),
    stopLoss: n(f.stopLoss),
    takeProfit: n(f.takeProfit),
    feeMode: f.feeMode,
    feeTotal: n(f.feeTotal),
    feeEntry: n(f.feeEntry),
    feeExit: n(f.feeExit),
    feePercent: n(f.feePercent),
    otherCosts: n(f.otherCosts),
    currency: f.currency,
    decimals: n(f.decimals),
    ema50: n(f.ema50),
    ema50Close: n(f.ema50Close),
    maxFavorablePrice: n(f.maxFavorablePrice),
    maxAdversePrice: n(f.maxAdversePrice),
  };
}

export function PostTradeCalculator({
  evaluation,
  capital,
  currency,
}: {
  evaluation: Evaluation;
  capital: number;
  currency: string;
}) {
  const [form, setForm] = useState<Form>(() => initialForm(evaluation, capital, currency));
  const [advanced, setAdvanced] = useState(
    () => !!evaluation.calculated_at || !!evaluation.stop_loss,
  );
  const [result, setResult] = useState<PostTradeResult | null>(null);
  const queryClient = useQueryClient();
  const savePostTrade = useServerFn(savePostTradeFn);

  const set = <K extends keyof Form>(key: K, value: Form[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const errors = useMemo(() => validatePostTrade(toInput(form)), [form]);

  const save = useMutation({
    mutationFn: () =>
      savePostTrade({
        data: { evaluationId: evaluation.id, ...toInput(form) } as never,
      }),
    onSuccess: (res) => {
      setResult((res as { result: PostTradeResult }).result);
      toast.success("Resultado post-trade guardado");
      queryClient.invalidateQueries({ queryKey: ["evaluation", evaluation.id] });
      queryClient.invalidateQueries({ queryKey: ["evaluations"] });
    },
    onError: (e: Error) => toast.error(e.message || "No fue posible guardar el resultado"),
  });

  const calculate = () => {
    try {
      setResult(calculatePostTrade(toInput(form)));
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const hints = SIZE_HINTS[form.marketType];
  const decimals = n(form.decimals) ?? defaultDecimals(form.marketType);

  return (
    <section className="mt-6 space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="label-mono">POST-TRADE</p>
          <p className="font-display text-lg font-semibold">
            Convierte el resultado de tu operación en datos.
          </p>
        </div>
        <button
          onClick={() => setAdvanced((v) => !v)}
          className="min-h-10 rounded-xl border border-border bg-surface-2 px-3 text-xs tracking-wide"
        >
          {advanced ? "MODO SIMPLE" : "MODO AVANZADO"}
        </button>
      </div>

      <div className="panel grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Activo" value={form.symbol} onChange={(v) => set("symbol", v)} />
        <Select
          label="Tipo de mercado"
          value={form.marketType}
          options={MARKETS as readonly string[]}
          onChange={(v) => set("marketType", v as MarketType)}
        />
        <div>
          <span className="label-mono">Dirección</span>
          <div className="mt-1.5 flex gap-2">
            {(["LONG", "SHORT"] as Direction[]).map((d) => (
              <button
                key={d}
                onClick={() => set("direction", d)}
                className={cn(
                  "min-h-11 flex-1 rounded-xl border text-sm font-medium",
                  form.direction === d
                    ? d === "LONG"
                      ? "border-ok bg-ok-soft/40 text-ok"
                      : "border-stop bg-stop-soft/40 text-stop"
                    : "border-border bg-surface-2 text-muted-foreground",
                )}
              >
                {d}
              </button>
            ))}
          </div>
        </div>
        <Field label="Precio de entrada" value={form.entryPrice} onChange={(v) => set("entryPrice", v)} type="number" />
        <Field label="Precio de salida" value={form.exitPrice} onChange={(v) => set("exitPrice", v)} type="number" />
        <Field label={`Cantidad / unidades`} value={form.quantity} onChange={(v) => set("quantity", v)} type="number" hint={hints.quantity} />
        <Field label="Apalancamiento (x)" value={form.leverage} onChange={(v) => set("leverage", v)} type="number" hint="Se usa para margen, exposición y ROI. No multiplica el P&L." />
        <Select
          label="Moneda"
          value={form.currency}
          options={CURRENCIES as readonly string[]}
          onChange={(v) => set("currency", v as Currency)}
        />
        {advanced && (
          <>
            <Field label="Fecha de entrada" value={form.entryDate} onChange={(v) => set("entryDate", v)} type="date" />
            <Field label="Fecha de salida" value={form.exitDate} onChange={(v) => set("exitDate", v)} type="date" />
            <Field label="Lotaje" value={form.lotSize} onChange={(v) => set("lotSize", v)} type="number" hint={hints.lot} />
            <Field
              label="Tamaño de contrato"
              value={form.contractSize}
              onChange={(v) => set("contractSize", v)}
              type="number"
              hint={`Por defecto en ${form.marketType}: ${defaultContractSize(form.marketType)}`}
            />
            <Field label="Margen utilizado" value={form.margin} onChange={(v) => set("margin", v)} type="number" hint="Si lo introduces, no se recalcula." />
            <Field label="Capital disponible" value={form.capital} onChange={(v) => set("capital", v)} type="number" />
            <Field label="Stop Loss" value={form.stopLoss} onChange={(v) => set("stopLoss", v)} type="number" />
            <Field label="Take Profit" value={form.takeProfit} onChange={(v) => set("takeProfit", v)} type="number" />
            <Field label="Decimales de presentación" value={form.decimals} onChange={(v) => set("decimals", v)} type="number" hint={`Por defecto: ${defaultDecimals(form.marketType)}`} />
          </>
        )}
      </div>



      {/* Datos opcionales de analítica post-trade. Nunca afectan la aprobación de entrada. */}
      <div className="panel p-4">
        <p className="label-mono">DATOS PARA LA ANALÍTICA (OPCIONAL)</p>
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
          Si no los registras, la analítica mostrará “No disponible”. Nunca se estiman.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="EMA 50 en la entrada" value={form.ema50} onChange={(v) => set("ema50", v)} type="number" />
          <Field label="EMA 50 en el cierre" value={form.ema50Close} onChange={(v) => set("ema50Close", v)} type="number" />
          <Field
            label="Precio máximo favorable (MFE)"
            value={form.maxFavorablePrice}
            onChange={(v) => set("maxFavorablePrice", v)}
            type="number"
            hint="Mejor precio alcanzado a tu favor durante la operación."
          />
          <Field
            label="Precio máximo adverso (MAE)"
            value={form.maxAdversePrice}
            onChange={(v) => set("maxAdversePrice", v)}
            type="number"
            hint="Peor precio alcanzado en contra durante la operación."
          />
        </div>
      </div>

      <div className="panel p-4">
        <p className="label-mono">¿Incluir comisiones?</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {(
            [
              ["none", "No"],
              ["total", "Comisión total"],
              ["sides", "Entrada y salida"],
              ["percent", "Porcentaje"],
            ] as [FeeMode, string][]
          ).map(([mode, label]) => (
            <button
              key={mode}
              onClick={() => set("feeMode", mode)}
              className={cn(
                "min-h-10 rounded-xl border px-3 text-xs tracking-wide",
                form.feeMode === mode
                  ? "border-primary bg-primary/15"
                  : "border-border bg-surface-2 text-muted-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        {form.feeMode !== "none" && (
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {form.feeMode === "total" && (
              <Field label="Comisión total" value={form.feeTotal} onChange={(v) => set("feeTotal", v)} type="number" />
            )}
            {form.feeMode === "sides" && (
              <>
                <Field label="Comisión de entrada" value={form.feeEntry} onChange={(v) => set("feeEntry", v)} type="number" />
                <Field label="Comisión de salida" value={form.feeExit} onChange={(v) => set("feeExit", v)} type="number" />
              </>
            )}
            {form.feeMode === "percent" && (
              <Field label="Comisión %" value={form.feePercent} onChange={(v) => set("feePercent", v)} type="number" hint="Aplicada al volumen de entrada y de salida." />
            )}
            <Field label="Otros costos" value={form.otherCosts} onChange={(v) => set("otherCosts", v)} type="number" />
          </div>
        )}
      </div>

      {errors.length > 0 && (
        <div className="panel border-warn/40 p-4">
          <p className="label-mono text-warn">Revisa los datos</p>
          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
            {errors.map((e) => (
              <li key={e}>· {e}</li>
            ))}
          </ul>
        </div>
      )}

      <button
        onClick={calculate}
        disabled={errors.length > 0}
        className="inline-flex min-h-13 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold tracking-wide text-primary-foreground disabled:opacity-50"
      >
        <Calculator className="h-4 w-4" /> CALCULAR RESULTADO
      </button>

      {result && (
        <>
          <ResultCard result={result} decimals={decimals} score={evaluation.score} />
          <button
            onClick={() => save.mutate()}
            disabled={save.isPending}
            className="min-h-12 w-full rounded-xl border border-primary/50 bg-primary/10 text-sm font-semibold tracking-wide text-primary disabled:opacity-50"
          >
            {save.isPending ? "GUARDANDO…" : "GUARDAR EN EL JOURNAL"}
          </button>
        </>
      )}
    </section>
  );
}

function ResultCard({
  result: r,
  decimals,
  score,
}: {
  result: PostTradeResult;
  decimals: number;
  score: number | null;
}) {
  const tone =
    r.tradeResult === "WIN" ? "text-ok" : r.tradeResult === "LOSS" ? "text-stop" : "text-warn";
  const dot = r.tradeResult === "WIN" ? "🟢" : r.tradeResult === "LOSS" ? "🔴" : "🟡";
  return (
    <div className="panel p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="label-mono">RESULTADO POST-TRADE</p>
        <p className={cn("text-sm font-semibold", tone)}>
          {dot} {RESULT_LABEL[r.tradeResult]}
        </p>
      </div>
      <p className={cn("mt-2 font-display text-3xl font-semibold tabular-nums", tone)}>
        {fmtMoney(r.netPnl, r.currency, decimals)}
      </p>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Row label="Movimiento" value={fmtPercent(r.priceChangePercent)} />
        <Row label="P&L bruto" value={fmtMoney(r.grossPnl, r.currency, decimals)} />
        <Row label="Comisiones" value={fmtMoney(-Math.abs(r.fees), r.currency, decimals)} />
        <Row label="ROI sobre margen" value={fmtPercent(r.roiMargin)} tone={r.roiMargin} />
        <Row label="Valor nocional" value={fmtNumber(r.notionalValue, 2)} />
        <Row label="Margen utilizado" value={fmtMoney(Math.abs(r.margin ?? 0), r.currency, decimals)} />
        <Row label="Apalancamiento" value={`${r.leverage.toFixed(2)}x`} />
        <Row label="P&L sobre capital" value={fmtPercent(r.pnlPercentOnCapital)} tone={r.pnlPercentOnCapital} />
        <Row label="Cantidad" value={fmtNumber(r.quantity, 4)} />
        <Row label="Riesgo" value={r.riskAmount === null ? "—" : fmtMoney(Math.abs(r.riskAmount), r.currency, decimals)} />
        <Row label="Riesgo %" value={r.riskPercent === null ? "—" : fmtPercent(r.riskPercent)} />
        <Row label="R:R planificado" value={fmtRatio(r.plannedRr)} />
        <Row label="R:R realizado" value={fmtRatio(r.realizedRr)} tone={r.realizedRr} />
        <Row label="Resultado en R" value={fmtR(r.resultR)} tone={r.resultR} />
        <Row label="Entrada" value={fmtNumber(r.entryPrice, decimals)} />
        <Row label="Salida" value={fmtNumber(r.exitPrice, decimals)} />
      </div>
      {r.resultR === null && (
        <p className="mt-3 text-xs text-warn">R no disponible: falta Stop Loss.</p>
      )}
      {score !== null && r.resultR !== null && (
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          Score ANIKE {score}/100 frente a un resultado de {fmtR(r.resultR)}. Una operación
          ganadora no fue necesariamente una buena operación, y una perdedora no fue
          necesariamente una mala operación: lo que se mide aquí es la calidad del proceso.
        </p>
      )}
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: number | null }) {
  return (
    <div>
      <p className="label-mono">{label}</p>
      <p
        className={cn(
          "mt-1 font-mono text-sm tabular-nums",
          tone === null || tone === undefined ? "" : tone > 0 ? "text-ok" : tone < 0 ? "text-stop" : "",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function Select({
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
        className="mt-1.5 min-h-11 w-full rounded-xl border border-input bg-background px-3 text-base"
      >
        {options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  hint?: string;
}) {
  const isNumeric = type === "number";
  return (
    <label className="block">
      <span className="label-mono">{label}</span>
      <input
        type={isNumeric ? "text" : type}
        inputMode={isNumeric ? "decimal" : undefined}
        autoComplete="off"
        value={value}
        onChange={(e) => {
          if (!isNumeric) return onChange(e.target.value);
          // Permite decimales con punto o coma (teclados en español) y negativos.
          const cleaned = e.target.value.replace(/[^0-9.,-]/g, "");
          if (cleaned === "" || /^-?\d*[.,]?\d*$/.test(cleaned)) onChange(cleaned);
        }}
        className="mt-1.5 min-h-11 w-full rounded-xl border border-input bg-background px-3 text-base outline-none focus:border-primary"
      />
      {hint && <span className="mt-1 block text-[11px] leading-snug text-muted-foreground">{hint}</span>}
    </label>
  );

}
