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
    const inBlock = section.groups
      .flatMap((g) => g.questions)
      .filter((q) => q.meta !== true)
      .filter((q) => inScope(q.id));
    // VALIDATION pura: obligatoria para la completitud, pero NUNCA puntúa.
    for (const q of inBlock) {
      if (q.validationOnly !== true || section.postTrade) continue;
      const v = answers[q.id];
      if (v === undefined || v === "") missing.push(q.id);
    }
    const questions = inBlock.filter((q) => q.validationOnly !== true);
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
      if (!Number.isFinite(best) || best <= 0) continue;
      // Peso interno explícito (`w`) si la matriz lo define; si no, se preserva
      // el peso implícito histórico (puntos máximos de la pregunta).
      const w = typeof q.w === "number" && q.w > 0 ? q.w : best;
      max += w;
      if (opt && Number.isFinite(opt.pts)) got += clamp01(opt.pts / best) * w;
    }
    // Sin criterios evaluables el bloque no penaliza (F_block = 1).
    const f = max > 0 ? clamp01(got / max) : 1;
    const earned = f * weight;
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
  // Sin redondeo para decidir (sólo se corrige el ruido de coma flotante).
  const score = Number.isFinite(raw) ? Math.max(0, Math.min(100, round(raw, 9))) : 0;

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

/** Clasificación V2: coincide con el estado oficial (SETUP A+/A/B ya no decide nada). */
export type Classification = FinalState;
export type Light = "ok" | "warn" | "stop";
/** Estados oficiales del CORE. `DESCARTADA` sólo existe como dato histórico. */
export type FinalState = "BORRADOR" | "CONDICIONAL" | "APROBADA" | "NO TRADE";
/** Incluye el estado histórico para lectura de evaluaciones antiguas. */
export type FinalStateLegacy = FinalState | "DESCARTADA";

/**
 * CONTRATO V2 — ningún reactivo produce HARD ni NO TRADE. Un reactivo sólo puede
 * afectar factor, score, gate o condición pendiente. Estos chequeos marcan
 * CONDICIONES PENDIENTES (pendingConditions → CONDICIONAL), nunca NO TRADE.
 */
export const PENDING_CHECKS: {
  id: string;
  label: string;
  test: (a: Answers) => boolean;
}[] = [
  {
    id: "context_partial",
    label: "El contexto acompaña solo parcialmente la operación.",
    test: (a) => a["ctx_aligned"] === "parcial" || a["h1_struct"] === "parcial",
  },
  {
    id: "pattern_forming",
    label: "El patrón todavía está en formación: no se interpreta como señal.",
    test: (a) =>
      a["h1_pattern_change_state"] === "formacion" || a["h1_pattern_cont_state"] === "formacion",
  },
  {
    id: "fibo_doubt",
    label: "La reacción en Fibonacci es dudosa.",
    test: (a) => a["h1_fibo_react"] === "dudoso" || a["h1_fibo_weak"] === "dudoso",
  },
  {
    id: "retest_pending",
    label: "El retesteo no respeta con claridad la nueva estructura.",
    test: (a) => a["cf5_retest_ok"] === "dudoso" || a["cf5_retest"] === "no",
  },
  {
    id: "rsi_extended",
    label: "El movimiento ya está sobrecomprado/sobrevendido.",
    test: (a) => a["cf5_rsi_extended"] === "si" || a["cf5_rsi"] === "dudoso",
  },
  {
    id: "volume_weak",
    label: "El volumen no acompaña con claridad la ruptura.",
    test: (a) => a["cf5_volume"] === "no" || a["cf5_volume"] === "dudoso",
  },
  {
    id: "sl_review",
    label:
      "El nivel 0,75 es el SL predeterminado, pero la estructura requiere revisión antes de ejecutar.",
    test: (a) => a["r_sl_fibo_ok"] === "revision",
  },
  {
    id: "conditions_partial",
    label: "Las condiciones principales se cumplieron solo parcialmente.",
    test: (a) => a["ex_conditions"] === "parcial",
  },
];

export function checkPendingConditions(a: Answers): string[] {
  return PENDING_CHECKS.filter((r) => r.test(a)).map((r) => r.label);
}

/**
 * Señal informativa de disciplina (estadísticas / Journal). V2: NO decide el
 * estado ni produce NO TRADE.
 */
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

/** R:R mínimo global (contrato V2): 1.99 → NO TRADE, 2.00 → válido. */
export const MIN_RR = 2;
const RR_EPS = 1e-9;

export type GlobalInvalidationId =
  | "long_geometry"
  | "short_geometry"
  | "zero_risk_distance"
  | "rr_below_min"
  | "non_finite"
  | "risk_over_limit";

export const GLOBAL_INVALIDATION_LABEL: Record<GlobalInvalidationId, string> = {
  long_geometry: "LONG geométricamente inválido: debe cumplirse SL < Entrada < TP.",
  short_geometry: "SHORT geométricamente inválido: debe cumplirse TP < Entrada < SL.",
  zero_risk_distance: "Entrada igual al Stop Loss: la distancia de riesgo es 0.",
  rr_below_min: "La relación riesgo/beneficio es inferior a 1:2.",
  non_finite: "Un cálculo crítico produce un valor no finito (NaN / Infinity).",
  risk_over_limit: "El riesgo monetario supera el límite establecido.",
};

/** Dato fuente declarado (no vacío). */
function provided(v: unknown) {
  return v !== null && v !== undefined && v !== "";
}

/**
 * INVALIDACIONES GLOBALES OBJETIVAS (únicas causas de NO TRADE en V2).
 * Un dato que todavía no existe NO invalida: sólo se evalúa lo declarado.
 */
export function globalInvalidations(input: {
  risk: RiskData;
  direction?: string | null | undefined;
  maxRiskPct?: number;
}): GlobalInvalidationId[] {
  const out = new Set<GlobalInvalidationId>();
  const r = input.risk ?? {};
  const raw = [r.entry, r.stop, r.target, r.capital, r.riskPct];
  if (raw.some((v) => provided(v) && !Number.isFinite(Number(v)))) out.add("non_finite");

  const entry = num(r.entry);
  const stop = num(r.stop);
  const target = num(r.target);
  const dir = input.direction === "LONG" || input.direction === "SHORT" ? input.direction : null;

  if (entry !== null && stop !== null && entry === stop) out.add("zero_risk_distance");

  if (dir === "LONG") {
    if (entry !== null && stop !== null && stop >= entry) out.add("long_geometry");
    if (entry !== null && target !== null && entry >= target) out.add("long_geometry");
  }
  if (dir === "SHORT") {
    if (entry !== null && stop !== null && entry >= stop) out.add("short_geometry");
    if (entry !== null && target !== null && target >= entry) out.add("short_geometry");
  }

  const geometryOk =
    !out.has("zero_risk_distance") && !out.has("long_geometry") && !out.has("short_geometry");
  if (geometryOk && entry !== null && stop !== null && target !== null) {
    const risk =
      dir === "SHORT" ? stop - entry : dir === "LONG" ? entry - stop : Math.abs(entry - stop);
    const reward =
      dir === "SHORT" ? entry - target : dir === "LONG" ? target - entry : Math.abs(target - entry);
    if (risk > 0) {
      const rr = reward / risk;
      if (!Number.isFinite(rr)) out.add("non_finite");
      else if (rr < MIN_RR - RR_EPS) out.add("rr_below_min");
    }
  }

  const pct = num(r.riskPct);
  const max = Number(input.maxRiskPct);
  if (pct !== null && Number.isFinite(max) && pct > max + RR_EPS) out.add("risk_over_limit");

  return [...out];
}

export type GateResult = {
  id: SectionId;
  label: string;
  value: number;
  min: number;
  passed: boolean;
};

export type Decision = {
  /** Score INTERNO con decimales: el estado usa SIEMPRE éste. */
  score: number;
  /** Score VISIBLE (floor). Sólo para mostrar; nunca decide. */
  scoreVisible: number;
  breakdown: Breakdown;
  /** Clasificación V2 = estado final oficial. */
  classification: Classification;
  light: Light;
  message: string;
  /** Condiciones pendientes (textos). */
  warnings: string[];
  pendingConditions: boolean;
  /** Invalidaciones globales objetivas detectadas (textos). */
  globalInvalidations: string[];
  globalInvalidationIds: GlobalInvalidationId[];
  globalInvalidation: boolean;
  finalState: FinalState;
  /** Señal informativa de disciplina: NO decide el estado. */
  emotional: boolean;
  /** Alias de compatibilidad: true sólo con invalidación global. */
  blocked: boolean;
  complete: boolean;
  missing: string[];
  gates: GateResult[];
  gatesFailed: string[];
  gatesOk: boolean;
  metrics: RiskMetrics;
};

const STATE_UI_TEXT: Record<FinalState, { light: Light; message: string }> = {
  BORRADOR: { light: "warn", message: "Completa el cuestionario activo." },
  CONDICIONAL: { light: "warn", message: "Esperar: faltan condiciones, gates o score." },
  APROBADA: { light: "ok", message: "Entrada válida según el sistema." },
  "NO TRADE": { light: "stop", message: "No ejecutar: invalidación global objetiva." },
};

/** Máquina de estados V2 (contrato técnico maestro). */
export function resolveFinalState(x: {
  complete: boolean;
  globalInvalidation: boolean;
  scoreInternal: number;
  gatesOk: boolean;
  pendingConditions: boolean;
}): FinalState {
  if (!x.complete) return "BORRADOR";
  if (x.globalInvalidation) return "NO TRADE";
  if (x.scoreInternal < APPROVAL_MIN_SCORE || !x.gatesOk || x.pendingConditions)
    return "CONDICIONAL";
  return "APROBADA";
}

/**
 * Motor V2: DATOS FUENTE → COMPLETITUD → FACTORES → SCORE → GATES → PENDIENTES
 * → VALIDACIÓN GLOBAL OBJETIVA → ESTADO → CLASIFICACIÓN.
 */
export function evaluate(input: {
  answers: Answers;
  risk: RiskData;
  maxRiskPct?: number;
  setup?: string | null;
  preferredSetups?: string[];
  direction?: string | null;
  market?: string | null;
  contractSize?: number | null;
  pointValue?: number | null;
}): Decision {
  const answers = input.answers ?? {};
  const active = input.setup ? activeQuestionIds(input.setup, answers) : undefined;
  const { score, scoreVisible, breakdown, complete, missing } = computeScore(
    answers,
    active?.size ? active : undefined,
  );
  const metrics = computeRisk(input.risk ?? {}, input.direction, {
    market: input.market ?? null,
    contractSize: input.contractSize ?? null,
    pointValue: input.pointValue ?? null,
  });
  const maxRiskPct = Number.isFinite(Number(input.maxRiskPct)) ? Number(input.maxRiskPct) : 1;

  const gates: GateResult[] = APPROVAL_GATES.map((g) => {
    const value = breakdown[g.id]?.percent ?? 0;
    return { id: g.id, label: g.label, value, min: g.min, passed: value >= g.min };
  });
  const gatesFailed = gates.filter((g) => !g.passed).map((g) => `${g.label} < ${g.min}%`);

  const warnings = checkPendingConditions(answers);
  const failedVal = failedValidations(answers, active?.size ? active : undefined);
  if (failedVal.length > 0)
    warnings.push(`Validación del setup no cumplida: ${failedVal.join(", ")}.`);

  const invalidIds = globalInvalidations({
    risk: input.risk ?? {},
    direction: input.direction,
    maxRiskPct,
  });
  const globalInvalidation = invalidIds.length > 0;

  const finalState = resolveFinalState({
    complete,
    globalInvalidation,
    scoreInternal: score,
    gatesOk: gatesFailed.length === 0,
    pendingConditions: warnings.length > 0,
  });

  return {
    score,
    scoreVisible,
    breakdown,
    classification: finalState,
    ...STATE_UI_TEXT[finalState],
    warnings,
    pendingConditions: warnings.length > 0,
    globalInvalidations: invalidIds.map((id) => GLOBAL_INVALIDATION_LABEL[id]),
    globalInvalidationIds: invalidIds,
    globalInvalidation,
    finalState,
    emotional: isEmotional(answers),
    blocked: globalInvalidation,
    complete,
    missing,
    gates,
    gatesFailed,
    gatesOk: gatesFailed.length === 0,
    metrics,
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
