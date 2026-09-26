import {
  activeQuestionIds,
  failedValidations,
  FIBO_SL_RATIO,
  SECTIONS,
  type SectionId,
} from "./checklist";

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
  /** Especificación real del instrumento (la introduce el usuario; no se inventa). */
  contractSize?: number;
  /** Valor por punto / tick del instrumento (la introduce el usuario; no se inventa). */
  pointValue?: number;
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
    entry !== null && stop !== null
      ? hasDir
        ? signed(entry, stop)
        : Math.abs(entry - stop)
      : null;
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

  // ---- Tamaño de posición ---------------------------------------------------
  // EXACT       → hay datos fuente válidos y, en mercados con contrato, la
  //               especificación real del instrumento.
  // ORIENTATIVE → falta la especificación del instrumento (o el mercado no se
  //               declaró): el número es una referencia, NO un lotaje ejecutable.
  // UNAVAILABLE → no puede calcularse sin inventar datos.
  const market = normalizeMarket(spec?.market);
  const contractSize = num(spec?.contractSize);
  const pointValue = num(spec?.pointValue);
  const needsSpec = market !== null && SPEC_REQUIRED.has(market);
  const specValue =
    pointValue !== null && pointValue > 0
      ? pointValue
      : contractSize !== null && contractSize > 0
        ? contractSize
        : null;

  const missing: string[] = [];
  if (riskMoney === null) missing.push("capital y riesgo %");
  if (stopDistance === null || stopDistance <= 0) missing.push("entrada y stop loss válidos");
  if (market === null) missing.push("mercado del instrumento");
  else if (needsSpec && specValue === null)
    missing.push("tamaño de contrato o valor por punto/tick");

  // Sin especificación se usa 1 como referencia; el resultado NUNCA se etiqueta
  // como exacto en ese caso.
  const perUnit = needsSpec && specValue !== null ? specValue : 1;
  const denominator = stopDistance !== null && stopDistance > 0 ? stopDistance * perUnit : null;
  const rawSize =
    riskMoney !== null && denominator !== null && denominator > 0 ? riskMoney / denominator : null;
  const positionSize =
    rawSize !== null && Number.isFinite(rawSize) && rawSize > 0
      ? round(rawSize, needsSpec ? 2 : 4)
      : null;

  const sizingUnit = needsSpec ? (market === "FUTURES" ? "contratos" : "lotes") : "unidades";
  const sizingPrecision: SizingPrecision =
    positionSize === null
      ? "unavailable"
      : market === null || (needsSpec && specValue === null)
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
 * Texto único para presentar la exactitud del tamaño de posición. Toda vista que
 * muestre un lotaje DEBE usar esto: un valor ORIENTATIVO nunca puede parecer un
 * lotaje ejecutable.
 */
export function sizingStatus(m: Pick<RiskMetrics, "sizingPrecision" | "sizingMissing">): {
  label: string;
  tone: "ok" | "warn" | "none";
  note: string;
} {
  const missing = m.sizingMissing.filter(Boolean).join(", ");
  if (m.sizingPrecision === "exact") {
    return {
      label: "EXACTO",
      tone: "ok",
      note: "Tamaño de posición exacto con los datos introducidos.",
    };
  }
  if (m.sizingPrecision === "orientative") {
    return {
      label: "ORIENTATIVO — NO EJECUTABLE",
      tone: "warn",
      note: `Referencia únicamente: NO es un lotaje ejecutable. En Futuros, CFD e Índices el cálculo exacto requiere el valor por tick / punto y el tamaño de contrato real del instrumento${
        missing ? ` (falta: ${missing})` : ""
      }. Verifica el tamaño en tu bróker antes de operar.`,
    };
  }
  return {
    label: "NO DISPONIBLE",
    tone: "none",
    note: `No se puede calcular el tamaño sin inventar datos${missing ? `: falta ${missing}` : ""}.`,
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

export type Breakdown = Record<
  SectionId,
  {
    earned: number;
    weight: number;
    answered: number;
    total: number;
    /** F_block × 100: cumplimiento del bloque, usado por los gates obligatorios. */
    percent: number;
  }
>;

/**
 * Peso pre-trade del CORE: 100 − Resultados (5, POST-TRADE).
 * El 5 % de Resultados NUNCA se redistribuye: el score pre-trade se normaliza
 * sobre 95 y el bloque Resultados queda fuera del cálculo pre-trade.
 */
export const PRE_TRADE_WEIGHT = 95;

/** Gates obligatorios (mínimo de cumplimiento por bloque) para APROBADA. */
export const APPROVAL_GATES: { id: SectionId; label: string; min: number }[] = [
  { id: "estructura", label: "Estructura", min: 70 },
  { id: "zona", label: "Zona", min: 60 },
  { id: "confirmacion", label: "Confirmación", min: 60 },
  { id: "riesgo", label: "Riesgo", min: 80 },
  { id: "recorrido", label: "Recorrido", min: 60 },
];

/** Score interno mínimo (con decimales) para poder aprobar. */
export const APPROVAL_MIN_SCORE = 80;

export type ScoreResult = {
  /** Score INTERNO con decimales: única base de clasificación/estado. */
  score: number;
  /** Score VISIBLE: floor del interno (nunca se redondea al alza). */
  scoreVisible: number;
  breakdown: Breakdown;
  /** Todas las preguntas pre-trade activas están respondidas. */
  complete: boolean;
  /** IDs de preguntas pre-trade activas sin responder. */
  missing: string[];
};

/**
 * `activeIds` limita el cálculo a las preguntas del cuestionario ACTIVO (setup
 * seleccionado). Los pesos, la fórmula y los umbrales no cambian: sólo se dejan
 * de contar criterios que el setup no presenta. Sin `activeIds` se evalúa todo
 * (evaluaciones históricas sin setup).
 *
 * Fórmula CORE:
 *   F_block      = Σ(Factor_i × PesoInterno_i) / Σ(PesoInterno_i)
 *   Puntos_block = F_block × PesoCORE_block
 *   Score interno pre-trade = Σ Puntos_block(pre-trade) / 95 × 100
 */
export function computeScore(answers: Answers, activeIds?: Set<string>): ScoreResult {
  const breakdown = {} as Breakdown;
  const inScope = (id: string) => activeIds === undefined || activeIds.has(id);
  const missing: string[] = [];

  let preTradePoints = 0;

  for (const section of SECTIONS) {
    // Las preguntas de METADATA (patrón, nivel Fibonacci) son descriptivas: no
    // entran en el cálculo, no suman ni restan puntos.
    const questions = section.groups
      .flatMap((g) => g.questions)
      .filter((q) => q.meta !== true && q.validationOnly !== true)
      .filter((q) => inScope(q.id));
    const weight = section.weight;
    let got = 0;
    let max = 0;
    let answered = 0;
    for (const q of questions) {
      const value = answers[q.id];
      const opt =
        value === undefined || value === "" ? undefined : q.options.find((o) => o.v === value);
      if (opt !== undefined) answered += 1;
      else if (!section.postTrade) missing.push(q.id);
      // Compatibilidad histórica: una opción "No aplica" guardada no penaliza ni suma.
      if (opt?.na) continue;
      const best = Math.max(...q.options.filter((o) => !o.na).map((o) => o.pts));
      if (Number.isFinite(best)) max += best;
      if (opt && Number.isFinite(opt.pts)) got += opt.pts;
    }
    // Sin criterios evaluables el bloque no penaliza (F_block = 1).
    const f = max > 0 ? clamp01(got / max) : 1;
    const earned = round(f * weight, 4);
    breakdown[section.id] = {
      earned,
      weight,
      answered,
      total: questions.length,
      percent: round(f * 100, 2),
    };
    // El bloque Resultados (POST-TRADE) queda fuera del score pre-trade.
    if (!section.postTrade) preTradePoints += earned;
  }

  const raw = (preTradePoints / PRE_TRADE_WEIGHT) * 100;
  const score = Number.isFinite(raw) ? round(Math.max(0, Math.min(100, raw)), 2) : 0;

  return {
    score,
    scoreVisible: Math.floor(score),
    breakdown,
    complete: missing.length === 0,
    missing,
  };
}

function clamp01(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

export type Classification = "SETUP A+" | "SETUP A" | "SETUP B" | "NO TRADE";
export type Light = "ok" | "warn" | "stop";
/** Estados oficiales del CORE. `DESCARTADA` sólo existe como dato histórico. */
export type FinalState = "BORRADOR" | "CONDICIONAL" | "APROBADA" | "NO TRADE";
/** Incluye el estado histórico para lectura de evaluaciones antiguas. */
export type FinalStateLegacy = FinalState | "DESCARTADA";

export function classify(score: number): {
  classification: Classification;
  light: Light;
  message: string;
} {
  if (score >= 85)
    return {
      classification: "SETUP A+",
      light: "ok",
      message: "Entrada válida si cumple las reglas de riesgo.",
    };
  if (score >= 75) return { classification: "SETUP A", light: "ok", message: "Entrada permitida." };
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
      a["r_invalidation"] === "no" ||
      a["r_stop_logic"] === "por_poner" ||
      a["r_sl_fibo_ok"] === "no",
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
      (risk.riskPctUsed !== null &&
        risk.riskPctUsed !== undefined &&
        risk.riskPctUsed > maxRiskPct),
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
export const CONDITIONAL_CHECKS: {
  id: string;
  label: string;
  test: (ctx: HardRuleCtx) => boolean;
}[] = [
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
    label:
      "El nivel 0,75 es el SL predeterminado, pero la estructura requiere revisión antes de ejecutar.",
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

export type GateResult = {
  id: SectionId;
  label: string;
  value: number;
  min: number;
  passed: boolean;
};

export type Decision = {
  /** Score INTERNO con decimales: la clasificación y el estado usan SIEMPRE éste. */
  score: number;
  /** Score VISIBLE (floor). Sólo para mostrar; nunca decide. */
  scoreVisible: number;
  breakdown: Breakdown;
  classification: Classification;
  light: Light;
  message: string;
  hardRules: string[];
  warnings: string[];
  finalState: FinalState;
  emotional: boolean;
  blocked: boolean;
  /** Cuestionario activo completo (todas las preguntas pre-trade respondidas). */
  complete: boolean;
  /** Preguntas activas pendientes. */
  missing: string[];
  /** Gates obligatorios por bloque y su resultado. */
  gates: GateResult[];
  /** Gates que no se cumplen. */
  gatesFailed: string[];
  /** Métricas de riesgo recalculadas (incluye exactitud del lotaje). */
  metrics: RiskMetrics;
};

/**
 * Precedencia estricta del motor:
 *   VALIDACIÓN → HARD → COMPLETITUD → GATES/PENDIENTES → SCORE → ESTADO/DECISIÓN.
 * Un HARD produce NO TRADE de forma inmediata y no puede ser sobrescrito por un
 * score alto. Sin HARD, cualquier gate incumplido, pendiente o completitud
 * insuficiente deja la evaluación CONDICIONAL (nunca APROBADA).
 */
export function evaluate(input: {
  answers: Answers;
  risk: RiskData;
  maxRiskPct?: number;
  setup?: string | null;
  preferredSetups?: string[];
  direction?: string | null;
  /** Mercado y especificación del instrumento: determinan la exactitud del lotaje. */
  market?: string | null;
  contractSize?: number | null;
  pointValue?: number | null;
}): Decision {
  // El cuestionario activo lo define el setup oficial seleccionado (matriz explícita).
  const active = input.setup ? activeQuestionIds(input.setup, input.answers) : undefined;
  const { score, scoreVisible, breakdown, complete, missing } = computeScore(
    input.answers,
    active?.size ? active : undefined,
  );
  const metrics = computeRisk(input.risk, input.direction, {
    market: input.market ?? null,
    contractSize: input.contractSize ?? null,
    pointValue: input.pointValue ?? null,
  });

  const maxRiskPct = Number.isFinite(Number(input.maxRiskPct)) ? Number(input.maxRiskPct) : 1;
  const ctx: HardRuleCtx = {
    a: input.answers,
    risk: metrics,
    maxRiskPct,
    setup: input.setup,
    preferredSetups: input.preferredSetups ?? [],
  };
  const hardRules = checkHardRules(ctx);
  const warnings = checkConditional(ctx);
  // Validaciones del nuevo cuestionario (nunca HARD): dejan la evaluación CONDICIONAL.
  const failedVal = failedValidations(input.answers, active?.size ? active : undefined);
  if (failedVal.length > 0)
    warnings.push(`Validación del setup no cumplida: ${failedVal.join(", ")}.`);
  const emotional = isEmotional(input.answers);
  const blocked = hardRules.length > 0 || emotional;

  const gates: GateResult[] = APPROVAL_GATES.map((g) => {
    const value = breakdown[g.id]?.percent ?? 0;
    return { id: g.id, label: g.label, value, min: g.min, passed: value >= g.min };
  });
  const gatesFailed = gates.filter((g) => !g.passed).map((g) => `${g.label} < ${g.min}%`);

  const common = {
    score,
    scoreVisible,
    breakdown,
    hardRules,
    warnings,
    emotional,
    blocked,
    complete,
    missing,
    gates,
    gatesFailed,
    metrics,
  };

  // 1) HARD (o freno emocional): NO TRADE inmediato, sin importar el score.
  if (blocked) {
    return {
      ...common,
      classification: "NO TRADE",
      light: "stop",
      message: "No ejecutar.",
      finalState: "NO TRADE",
    };
  }

  const base = classify(score);

  // 2) COMPLETITUD → 3) GATES/PENDIENTES → 4) SCORE interno.
  const approved =
    complete && score >= APPROVAL_MIN_SCORE && gatesFailed.length === 0 && warnings.length === 0;

  return {
    ...common,
    ...base,
    finalState: approved ? "APROBADA" : "CONDICIONAL",
  };
}

export const FINAL_STATE_UI: Record<
  FinalStateLegacy,
  { dot: string; label: string; light: Light }
> = {
  BORRADOR: { dot: "⚪", label: "BORRADOR", light: "warn" },
  APROBADA: { dot: "🟢", label: "APROBADA", light: "ok" },
  CONDICIONAL: { dot: "🟡", label: "CONDICIONAL", light: "warn" },
  "NO TRADE": { dot: "🔴", label: "NO TRADE", light: "stop" },
  // Estado histórico: sólo lectura de evaluaciones antiguas.
  DESCARTADA: { dot: "🔴", label: "NO TRADE (histórico)", light: "stop" },
};

/** Estado oficial visible (BORRADOR/CONDICIONAL/APROBADA/NO TRADE). SETUP A+/A/B ya no se muestran. */
export function officialStateLabel(e: {
  status?: string | null;
  final_state?: string | null;
  classification?: string | null;
  decision?: string | null;
}): string {
  if (e.status === "draft") return "BORRADOR";
  if (e.classification === "NO TRADE" || e.decision === "no_trade") return "NO TRADE";
  if (e.final_state === "DESCARTADA") return "NO TRADE";
  if (e.final_state) return e.final_state;
  return "HISTÓRICO";
}
