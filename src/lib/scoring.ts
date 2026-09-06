import { FIBO_SL_RATIO, SECTIONS, type SectionId } from "./checklist";

export type Answers = Record<string, string>;

export type RiskData = {
  capital?: number;
  riskPct?: number;
  entry?: number;
  stop?: number;
  target?: number;
  /** Extremos del impulso para calcular los niveles de Fibonacci (0,38 / 0,50 / 0,618 / 0,75). */
  swingHigh?: number;
  swingLow?: number;
  /** SL predeterminado sugerido por Fibonacci 0,75 (nunca se ejecuta automáticamente). */
  slFibo?: number;
};

/** Exactitud del tamaño de posición: depende de la especificación del instrumento. */
export type SizingPrecision = "exact" | "orientative" | "unavailable";

export type RiskMetrics = {
  riskMoney: number | null;
  stopDistance: number | null;
  rr: number | null;
  positionSize: number | null;
  riskPctUsed: number | null;
  /** "exact" sólo cuando existen todos los datos del instrumento. */
  sizingPrecision: SizingPrecision;
  /** Unidad del tamaño calculado ("unidades", "lotes", "contratos"). */
  sizingUnit: string | null;
  /** Datos que faltan para un cálculo exacto. */
  sizingMissing: string[];
};

/** Mercados cuyo tamaño de posición requiere especificación del instrumento. */
const SPEC_REQUIRED = new Set(["FOREX", "FUTURES", "CFD", "INDICES"]);

/** Normaliza las etiquetas del formulario (español) a claves de mercado. */
export function normalizeMarket(market?: string | null): string | null {
  if (!market) return null;
  const m = market
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
  if (m.startsWith("CRYPTO")) return "CRYPTO";
  if (m.startsWith("FOREX")) return "FOREX";
  if (m.startsWith("FUTUR")) return "FUTURES";
  if (m.startsWith("INDIC")) return "INDICES";
  if (m.startsWith("CFD")) return "CFD";
  if (m.startsWith("ACCION") || m.startsWith("STOCK")) return "STOCKS";
  return m;
}

export function computeRisk(
  r: RiskData,
  direction?: string | null,
  spec?: {
    market?: string | null;
    /** Tamaño de contrato / lote del instrumento. */
    contractSize?: number | null;
    /** Valor por punto o por tick del instrumento. */
    pointValue?: number | null;
  },
): RiskMetrics {
  const capital = num(r.capital);
  const pct = num(r.riskPct);
  const entry = num(r.entry);
  const stop = num(r.stop);
  const target = num(r.target);

  const riskMoney =
    capital !== null && pct !== null && capital > 0 && pct > 0 ? (capital * pct) / 100 : null;

  // Distancias con signo cuando se conoce la dirección: un TP al lado equivocado
  // no puede producir un R/R positivo.
  const isShort = direction === "SHORT";
  const signed = (a: number, b: number) => (isShort ? b - a : a - b);
  const hasDir = direction === "LONG" || direction === "SHORT";

  const rawStopDistance =
    entry !== null && stop !== null ? (hasDir ? signed(entry, stop) : Math.abs(entry - stop)) : null;
  const rawRewardDistance =
    entry !== null && target !== null
      ? hasDir
        ? signed(target, entry)
        : Math.abs(target - entry)
      : null;

  const stopDistance = rawStopDistance === null ? null : Math.abs(rawStopDistance);
  const rr =
    rawStopDistance !== null && rawRewardDistance !== null && rawStopDistance > 0
      ? round(rawRewardDistance / rawStopDistance, 2)
      : null;

  // ---- Tamaño de posición: exacto sólo con especificación del instrumento ----
  const market = normalizeMarket(spec?.market);
  const contractSize = num(spec?.contractSize);
  const pointValue = num(spec?.pointValue);
  const needsSpec = market !== null && SPEC_REQUIRED.has(market);
  const spec_value =
    pointValue !== null && pointValue > 0
      ? pointValue
      : contractSize !== null && contractSize > 0
        ? contractSize
        : null;
  // Sin especificación se usa 1 como referencia: el resultado queda ORIENTATIVO.
  const perUnit = needsSpec ? (spec_value ?? 1) : 1;

  const missing: string[] = [];
  if (riskMoney === null) missing.push("capital y riesgo %");
  if (stopDistance === null || stopDistance <= 0) missing.push("entrada y stop loss válidos");
  if (needsSpec && spec_value === null) missing.push("tamaño de contrato o valor por punto");

  const denominator = stopDistance !== null && stopDistance > 0 ? stopDistance * perUnit : null;
  const rawSize =
    riskMoney !== null && denominator !== null && denominator > 0 ? riskMoney / denominator : null;
  const positionSize =
    rawSize !== null && Number.isFinite(rawSize) ? round(rawSize, needsSpec ? 2 : 4) : null;


  const sizingUnit = needsSpec ? (market === "FUTURES" ? "contratos" : "lotes") : "unidades";
  const sizingPrecision: SizingPrecision =
    positionSize === null
      ? "unavailable"
      : needsSpec && spec_value === null
        ? "orientative"
        : "exact";

  return {
    riskMoney: riskMoney === null ? null : round(riskMoney, 2),
    stopDistance: stopDistance === null ? null : round(stopDistance, 6),
    rr: rr === null || !Number.isFinite(rr) ? null : rr,
    positionSize,
    riskPctUsed: pct,
    sizingPrecision,
    sizingUnit: positionSize === null ? null : sizingUnit,
    sizingMissing: missing,
  };
}



/**
 * Niveles de retroceso de Fibonacci a partir del impulso declarado.
 * `sl` corresponde al nivel 0,75: es un valor PREDETERMINADO/SUGERIDO, nunca una orden.
 */
export function fiboProjection(
  r: RiskData,
  direction: string | null | undefined,
): { levels: { ratio: number; price: number }[]; sl: number | null } {
  const high = num(r.swingHigh);
  const low = num(r.swingLow);
  if (high === null || low === null || high === low) return { levels: [], sl: null };
  const top = Math.max(high, low);
  const bottom = Math.min(high, low);
  const range = top - bottom;
  const isLong = direction !== "SHORT";
  const at = (ratio: number) => round(isLong ? top - range * ratio : bottom + range * ratio, 6);
  const levels = [0.38, 0.5, 0.618, FIBO_SL_RATIO].map((ratio) => ({ ratio, price: at(ratio) }));
  return { levels, sl: at(FIBO_SL_RATIO) };
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function round(n: number, d: number) {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}

export type Breakdown = Record<SectionId, { earned: number; weight: number; answered: number; total: number }>;

export function computeScore(answers: Answers): { score: number; breakdown: Breakdown } {
  const breakdown = {} as Breakdown;

  // Los bloques post-trade (Resultados) solo entran en el cálculo cuando ya se respondieron:
  // antes de tener resultado el peso se redistribuye para que el máximo siga siendo 100.
  const active = SECTIONS.filter((section) => {
    if (!section.postTrade) return true;
    return section.groups
      .flatMap((g) => g.questions)
      .some((q) => answers[q.id] !== undefined && answers[q.id] !== "");
  });
  const activeWeight = active.reduce((sum, s) => sum + s.weight, 0);
  const factor = activeWeight > 0 ? 100 / activeWeight : 1;

  let total = 0;

  for (const section of SECTIONS) {
    const questions = section.groups.flatMap((g) => g.questions);
    const isActive = active.includes(section);
    const weight = round(section.weight * (isActive ? factor : 0), 2);
    let got = 0;
    let max = 0;
    let answered = 0;
    for (const q of questions) {
      const value = answers[q.id];
      const opt = value === undefined ? undefined : q.options.find((o) => o.v === value);
      if (value !== undefined) answered += 1;
      // "No aplica": criterio no evaluable — se excluye del cálculo (no penaliza ni suma).
      if (opt?.na) continue;
      const best = Math.max(...q.options.filter((o) => !o.na).map((o) => o.pts));
      max += best;
      if (opt) got += opt.pts;
    }
    // Si todos los criterios de la sección quedaron como "No aplica", la sección no penaliza.
    const earned = max > 0 ? round((got / max) * weight, 2) : weight;
    breakdown[section.id] = { earned, weight, answered, total: questions.length };
    total += earned;
  }

  return { score: Math.max(0, Math.min(100, Math.round(total))), breakdown };
}

export type Classification = "SETUP A+" | "SETUP A" | "SETUP B" | "NO TRADE";
export type Light = "ok" | "warn" | "stop";
export type FinalState = "APROBADA" | "CONDICIONAL" | "DESCARTADA";

export function classify(score: number): { classification: Classification; light: Light; message: string } {
  if (score >= 85)
    return {
      classification: "SETUP A+",
      light: "ok",
      message: "Entrada válida si cumple las reglas de riesgo.",
    };
  if (score >= 75)
    return { classification: "SETUP A", light: "ok", message: "Entrada permitida." };
  if (score >= 65)
    return { classification: "SETUP B", light: "warn", message: "Esperar confirmación adicional." };
  return { classification: "NO TRADE", light: "stop", message: "No ejecutar." };
}

export const HARD_RULES: { id: string; label: string; test: (ctx: HardRuleCtx) => boolean }[] = [
  {
    id: "context_conflict",
    label: "El contexto no es compatible con la operación.",
    test: ({ a }) => a["ctx_aligned"] === "no",
  },
  {
    id: "structure_invalid",
    label: "La estructura está invalidada o no definida.",
    test: ({ a }) =>
      a["h1_structure"] === "no_definida" ||
      a["h1_struct"] === "no" ||
      a["h1_pattern_change_state"] === "invalidado" ||
      a["h1_pattern_cont_state"] === "invalidado",
  },
  {
    id: "break_without_close",
    label: "Ruptura sin cierre de vela de 5M fuera de la diagonal.",
    test: ({ a }) => a["cf5_close"] === "no",
  },
  {
    id: "missing_confirmation",
    label: "Falta una confirmación esencial en 5M.",
    test: ({ a }) => a["cf5_diag_break"] === "no" || a["cf_basis"] === "intuicion",
  },
  {
    id: "no_invalidation",
    label: "El Stop Loss no es correcto: no existe un punto claro de invalidación.",
    test: ({ a }) =>
      a["r_invalidation"] === "no" || a["r_stop_logic"] === "por_poner" || a["r_sl_fibo_ok"] === "no",
  },
  {
    id: "rr_below_2",
    label: "La relación riesgo/beneficio es inferior a 1:2.",
    test: ({ a, risk }) =>
      a["r_rr"] === "menor_1" ||
      a["r_rr"] === "1_1" ||
      a["r_rr"] === "1_15" ||
      (risk.rr !== null && risk.rr < 2),
  },
  {
    id: "no_room",
    label: "El recorrido hasta el objetivo es insuficiente.",
    test: ({ a }) => a["rc_room"] === "no" || a["rc_rr2"] === "no" || a["z_space"] === "no",
  },
  {
    id: "before_confirmation",
    label: "La entrada fue anticipada: se ejecutó antes de la confirmación.",
    test: ({ a }) => a["m5_timing"] === "antes" || a["ex_conditions"] === "no",
  },
  {
    id: "risk_over_limit",
    label: "El riesgo supera el límite establecido.",
    test: ({ a, risk, maxRiskPct }) =>
      a["r_limit"] === "no" ||
      (risk.riskPctUsed !== null && risk.riskPctUsed !== undefined && risk.riskPctUsed > maxRiskPct),
  },
  {
    id: "discipline",
    label: "Incumplimiento grave de disciplina.",
    test: ({ a }) =>
      a["ds_why"] === "impulso" ||
      a["ds_revenge"] === "si" ||
      a["ds_rules"] === "si" ||
      a["ds_plan"] === "forzando" ||
      a["ds_motive"] === "fomo" ||
      a["ds_motive"] === "revancha",
  },
  {
    id: "off_plan",
    label: "El setup no pertenece al plan operativo.",
    test: ({ setup, preferredSetups }) =>
      preferredSetups.length > 0 && !!setup && !preferredSetups.includes(setup),
  },
];

/** Elementos que dejan la operación CONDICIONAL sin descartarla. */
export const CONDITIONAL_CHECKS: { id: string; label: string; test: (ctx: HardRuleCtx) => boolean }[] = [
  {
    id: "context_partial",
    label: "El contexto acompaña solo parcialmente la operación.",
    test: ({ a }) => a["ctx_aligned"] === "parcial" || a["h1_struct"] === "parcial",
  },
  {
    id: "pattern_forming",
    label: "El patrón todavía está en formación: no se interpreta como señal.",
    test: ({ a }) =>
      a["h1_pattern_change_state"] === "formacion" || a["h1_pattern_cont_state"] === "formacion",
  },
  {
    id: "fibo_doubt",
    label: "La reacción en Fibonacci es dudosa.",
    test: ({ a }) => a["h1_fibo_react"] === "dudoso" || a["h1_fibo_weak"] === "dudoso",
  },
  {
    id: "retest_pending",
    label: "El retesteo no respeta con claridad la nueva estructura.",
    test: ({ a }) => a["cf5_retest_ok"] === "dudoso" || a["cf5_retest"] === "no",
  },
  {
    id: "rsi_extended",
    label: "El movimiento ya está sobrecomprado/sobrevendido.",
    test: ({ a }) => a["cf5_rsi_extended"] === "si" || a["cf5_rsi"] === "dudoso",
  },
  {
    id: "volume_weak",
    label: "El volumen no acompaña con claridad la ruptura.",
    test: ({ a }) => a["cf5_volume"] === "no" || a["cf5_volume"] === "dudoso",
  },
  {
    id: "sl_review",
    label: "El nivel 0,75 es el SL predeterminado, pero la estructura requiere revisión antes de ejecutar.",
    test: ({ a }) => a["r_sl_fibo_ok"] === "revision",
  },
  {
    id: "conditions_partial",
    label: "Las condiciones principales se cumplieron solo parcialmente.",
    test: ({ a }) => a["ex_conditions"] === "parcial",
  },
];

export type HardRuleCtx = {
  a: Answers;
  risk: RiskMetrics;
  maxRiskPct: number;
  setup?: string | null | undefined;
  preferredSetups: string[];
};

export function checkHardRules(ctx: HardRuleCtx) {
  return HARD_RULES.filter((r) => r.test(ctx)).map((r) => r.label);
}

export function checkConditional(ctx: HardRuleCtx) {
  return CONDITIONAL_CHECKS.filter((r) => r.test(ctx)).map((r) => r.label);
}

export function isEmotional(a: Answers) {
  return (
    a["ds_why"] === "impulso" ||
    a["ds_revenge"] === "si" ||
    a["ds_rules"] === "si" ||
    a["ds_plan"] === "forzando" ||
    a["ds_motive"] === "fomo" ||
    a["ds_motive"] === "revancha" ||
    a["ds_motive"] === "aburrimiento"
  );
}

export type Decision = {
  score: number;
  breakdown: Breakdown;
  classification: Classification;
  light: Light;
  message: string;
  hardRules: string[];
  warnings: string[];
  finalState: FinalState;
  emotional: boolean;
  blocked: boolean;
};

export function evaluate(input: {
  answers: Answers;
  risk: RiskData;
  maxRiskPct: number;
  setup?: string | null;
  preferredSetups?: string[];
  direction?: string | null;
}): Decision {
  const { score, breakdown } = computeScore(input.answers);
  const metrics = computeRisk(input.risk, input.direction);
  const ctx: HardRuleCtx = {
    a: input.answers,
    risk: metrics,
    maxRiskPct: input.maxRiskPct,
    setup: input.setup,
    preferredSetups: input.preferredSetups ?? [],
  };
  const hardRules = checkHardRules(ctx);
  const warnings = checkConditional(ctx);
  const emotional = isEmotional(input.answers);
  const blocked = hardRules.length > 0 || emotional;
  const base = classify(score);

  // El score no es el único mecanismo de decisión: una condición crítica descarta la operación.
  const finalState: FinalState = blocked
    ? "DESCARTADA"
    : score < 65
      ? "DESCARTADA"
      : warnings.length > 0 || score < 75
        ? "CONDICIONAL"
        : "APROBADA";

  if (blocked) {
    return {
      score,
      breakdown,
      classification: "NO TRADE",
      light: "stop",
      message: "No ejecutar.",
      hardRules,
      warnings,
      finalState,
      emotional,
      blocked,
    };
  }

  return { score, breakdown, ...base, hardRules, warnings, finalState, emotional, blocked };
}

export const FINAL_STATE_UI: Record<FinalState, { dot: string; label: string; light: Light }> = {
  APROBADA: { dot: "🟢", label: "APROBADA", light: "ok" },
  CONDICIONAL: { dot: "🟡", label: "CONDICIONAL", light: "warn" },
  DESCARTADA: { dot: "🔴", label: "DESCARTADA", light: "stop" },
};
