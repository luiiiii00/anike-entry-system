/**
 * REGISTRO TÉCNICO MAESTRO — MATRIZ ANIKE EJEPIKA
 * ---------------------------------------------------------------------------
 * Tabula TODOS los reactivos de las 6 matrices (SETUP LIBRE + S01…S05) como
 * registros maestros con: setup_id, question_id, block_id, orden, tipo,
 * concepto semántico, texto definitivo, condición, opciones y factores,
 * internal_weight, destino CORE, comportamiento y referencia de fuente.
 *
 * REGLAS APLICADAS
 *  - Este módulo es SÓLO REGISTRO: no altera pesos CORE, fórmula, gates, HARD,
 *    umbral 80, estados ni la UI. El motor sigue calculando desde `scoring.ts`.
 *  - Los reactivos se derivan de la matriz ACTIVA (`checklist.ts`), por lo que
 *    no se duplican IDs ni se inventan preguntas nuevas.
 *  - Un reactivo puntuable sólo se marca COMPLETO cuando tiene exactamente los
 *    5 factores oficiales 1,00 / 0,75 / 0,50 / 0,25 / 0,00 en orden descendente.
 *    Si la fuente no permite determinar las 5 opciones, queda
 *    PENDIENTE_DE_FUENTE (nunca se inventa contenido).
 *  - METADATA / AUTO / VALIDATION / HARD no se fuerzan a 5 opciones puntuables.
 *  - Aislamiento absoluto: cada registro pertenece a un único setup_id.
 */
import { INTERNAL_WEIGHTS } from "./internal-weights";
import { EXECUTION_INVALIDATIONS } from "./scoring";

import {
  BASE_SECTIONS,
  EVALUATION_SETUP_IDS,
  getActiveQuestionsBySetup,
  isAnyTimeframeQuestion,
  questionRole,
  setupLabel,
  type EvaluationSetupId,
  type SectionId,
  type QuestionKind,
  type TimeframeRole,
} from "./checklist";

/**
 * Rol de temporalidad del reactivo en el registro:
 *  - GRANDE / INTERMEDIA / PEQUENA: rol declarado por la matriz.
 *  - "ANY": el reactivo funciona en cualquiera de las tres temporalidades (S03).
 *  - null: no aplica temporalidad.
 * La temporalidad concreta la aporta el estilo declarado en `co_style`.
 */
export type RegistryRole = TimeframeRole | "ANY" | null;

/** Tipos oficiales de reactivo del registro maestro. */
export type RegistryType =
  | "METADATA"
  | "SCORE"
  | "CONDITIONAL_SCORE"
  | "VALIDATION"
  | "SCORE_VALIDATION"
  | "AUTO"
  | "AUTO_VALIDATION";

export type RegistryStatus = "COMPLETO" | "PENDIENTE_DE_FUENTE";

/** Respaldo documental del registro. */
export type RegistrySourceStatus = "VERIFIED" | "NORMALIZED" | "PENDIENTE_DE_FUENTE";

/** Naturaleza de la condición de activación del reactivo. */
export type RegistryConditionType = "NONE" | "VARIANT" | "MODE";

/** Códigos oficiales/visibles de setup (S03 se denomina RUPTURA). */
export const SETUP_CODE: Record<EvaluationSetupId, string> = {
  FREE: "SETUP_LIBRE",
  REVERSION: "S01",
  CONTINUACION: "S02",
  RUPTURA_RETESTEO: "S03",
  ZONA_FIBONACCI: "S04",
  IMPULSO_PULLBACK: "S05",
};

export const SETUP_SEMANTIC_NAME: Record<EvaluationSetupId, string> = {
  FREE: "SETUP LIBRE",
  REVERSION: "REVERSIÓN",
  CONTINUACION: "CONTINUACIÓN",
  RUPTURA_RETESTEO: "RUPTURA",
  ZONA_FIBONACCI: "ZONA + FIBONACCI",
  IMPULSO_PULLBACK: "IMPULSO + PULLBACK",
};

export type RegistryOption = { value: string; label: string; factor: number };

export type RegistryRecord = {
  setup_id: EvaluationSetupId;
  /** Código oficial del setup (SETUP_LIBRE, S01…S05). */
  setup_code: string;
  /** Nombre semántico/visible del setup (S03 = RUPTURA). */
  setup_semantic_name: string;
  setup_label: string;
  question_id: string;
  block_id: SectionId;
  /** Código visible del bloque CORE (00…09). */
  block_code: string;
  block_title: string;
  order: number;
  type: RegistryType;
  /** Concepto semántico de la matriz (qué evalúa técnicamente el reactivo). */
  concept: string;
  /** Texto definitivo tal y como lo ve el trader. */
  text: string;
  /** Ayuda mostrada junto al reactivo (informativa). */
  hint: string | null;
  /** Condición de activación. `null` = siempre activo dentro de su setup. */
  condition: string | null;
  condition_type: RegistryConditionType;
  options: RegistryOption[];

  /** Peso interno oficial dentro de su bloque (remapeo OPCIÓN A, `internal-weights.ts`); 0 = metadata / validation-only. */
  internal_weight: number;
  core_target: { block: SectionId; weight: number; stage: "PRE_TRADE" | "POST_TRADE" };
  /** Comportamiento de score / validación / HARD (resumen). */
  behavior: string;
  score_behavior: string;
  validation_behavior: string;
  hard_behavior: string;
  /** Rol de temporalidad (GRANDE/INTERMEDIA/PEQUENA), "ANY" (S03) o null. */
  role: RegistryRole;
  /** Referencia de fuente cuando existe. */
  source: string | null;
  /** `true` cuando el reactivo está activo en la matriz vigente del setup. */
  active: boolean;
  status: RegistryStatus;
  source_status: RegistrySourceStatus;
  pending_reason: string | null;
};

/** Escala oficial de factores (orden descendente obligatorio). */
export const OFFICIAL_FACTORS = [1, 0.75, 0.5, 0.25, 0] as const;

/** Pesos CORE oficiales. Este registro NO los modifica. */
export const CORE_WEIGHTS: Record<SectionId, number> = {
  comercio: 5,
  contexto: 10,
  estructura: 25,
  zona: 10,
  confirmacion: 20,
  riesgo: 10,
  recorrido: 5,
  ejecucion: 5,
  disciplina: 5,
  resultados: 5,
};

export const PRE_TRADE_CORE_WEIGHT = 95;
export const POST_TRADE_CORE_WEIGHT = 5;

/**
 * V2: no existe HARD por reactivo. Sólo las invalidaciones de EJECUCIÓN
 * explícitas (venganza, FOMO, persecución del precio) producen NO TRADE; se
 * leen del motor (`EXECUTION_INVALIDATIONS` en `scoring.ts`).
 */
const EXECUTION_INVALIDATION_BY_ID = new Map<string, string[]>();
for (const r of EXECUTION_INVALIDATIONS) {
  const list = EXECUTION_INVALIDATION_BY_ID.get(r.questionId) ?? [];
  list.push(`${r.values.join("/")} → ${r.id}`);
  EXECUTION_INVALIDATION_BY_ID.set(r.questionId, list);
}

/** Reactivos que alimentan un aviso CONDICIONAL del motor (ver `scoring.ts`). */
const CONDITIONAL_TRIGGERS = new Set([
  "ctx_aligned",
  "h1_struct",
  "h1_pattern_change_state",
  "h1_pattern_cont_state",
  "h1_fibo_react",
  "h1_fibo_weak",
  "cf5_retest_ok",
  "cf5_retest",
  "cf5_rsi_extended",
  "cf5_rsi",
  "cf5_volume",
  "r_sl_fibo_ok",
  "ex_conditions",
]);

/** Reactivos cuyo valor real lo calcula el motor (AUTO), no el criterio subjetivo. */
const AUTO_QUESTIONS = new Set(["r_rr"]);

/**
 * Reactivos declarados como VALIDATION por contrato: puntúan y pueden dejar la
 * evaluación CONDICIONAL, pero NUNCA bloquean por sí mismos (NO_HARD).
 */
const DECLARED_VALIDATION_IDS = new Set(["s05_pullback_criteria", "s05_deep_pullback"]);

/** Fuente documental específica de un reactivo (prioridad sobre la del setup). */
const SOURCE_OVERRIDES: Record<string, string> = {
  s03_entry_mode: "ANIKE EJEPIKA — S03/S05 transcripción",
  s03_mini_confirmation: "ANIKE EJEPIKA — S03/S05 transcripción",
  s03_retest_on_level: "ANIKE EJEPIKA — S03/S05 transcripción",
  s03_retest_reaction: "ANIKE EJEPIKA — S03/S05 transcripción",
  s03_level_as_retest: "ANIKE EJEPIKA — S03/S05 transcripción",
  s03_confirm_direction: "ANIKE EJEPIKA — S03/S05 transcripción",
  s03_stop_invalidation: "ANIKE EJEPIKA — S03/S05 transcripción",
  s05_pullback_criteria: "ANIKE EJEPIKA — S03/S05 transcripción",
  s05_pullback_type: "ANIKE EJEPIKA — S03/S05 transcripción",
  s05_deep_pullback: "ANIKE EJEPIKA — S03/S05 transcripción",
  s05_pullback_zone: "ANIKE EJEPIKA — S03/S05 transcripción",
};

/** Reactivos cuyo wording proviene de la transcripción normalizada. */
const NORMALIZED_IDS = new Set(Object.keys(SOURCE_OVERRIDES));

/** Conceptos semánticos declarados. Sin entrada se deriva del texto del reactivo. */
const CONCEPTS: Record<string, string> = {
  co_instrument: "Identificación del instrumento operado",
  co_style: "Estilo de trading declarado (temporalidades de trabajo)",
  co_conditions: "Idoneidad de las condiciones de mercado",
  s03_entry_mode: "Modo de entrada declarado (mini confirmación o retesteo opcional)",
  s03_mini_confirmation: "Mini confirmación posterior a la ruptura (vela siguiente o tercera vela)",
  s03_level_as_retest: "Nivel roto como zona de referencia (protección del stop)",
  s03_stop_invalidation: "Stop Loss dentro del nivel roto, detrás de la invalidación",
  s05_pullback_criteria: "Criterio de validez del pullback frente a la última vela del impulso",
  ctx_direction: "Dirección predominante del contexto superior",
  ctx_swings: "Secuencia de máximos y mínimos",
  ctx_aligned: "Alineación operación ↔ contexto",
  ctx_levels: "Existencia de niveles relevantes",
  ctx_near_zone: "Proximidad a zona relevante",
  h1_structure: "Estructura vigente del precio",
  h1_struct: "Confirmación estructural de la dirección",
  h1_pattern_change: "Patrón de cambio identificado",
  h1_pattern_change_state: "Estado de confirmación del patrón de cambio",
  h1_pattern_cont: "Patrón de continuidad identificado",
  h1_pattern_cont_state: "Estado de confirmación del patrón de continuidad",
  h1_fibo: "Nivel Fibonacci oficial utilizado",
  h1_fibo_react: "Reacción del precio en Fibonacci",
  h1_fibo_weak: "Pérdida de fuerza durante el retroceso",
  h1_rsi_div: "Divergencia precio ↔ RSI",
  h1_rsi_div_fibo: "Confluencia divergencia ↔ Fibonacci",
  h1_macd: "Pérdida de fuerza del MACD en zona",
  z_type: "Tipo de zona testeada",
  z_relevance: "Relevancia de la zona en la temporalidad superior",
  z_reacted: "Reacción efectiva en la zona",
  z_space: "Espacio hasta la próxima zona",
  z_clear: "Claridad de la zona de entrada",
  z_mid: "Evitar entrada en mitad de rango",
  cf5_diag_break: "Ruptura de la diagonal",
  cf5_close: "Cierre de vela fuera de la diagonal",
  cf5_retest: "Existencia de retesteo",
  cf5_retest_ok: "Calidad del retesteo",
  cf5_macd: "Validación MACD tras la ruptura",
  cf5_macd_cross: "Cruce MACD con su línea de señal",
  cf5_rsi: "RSI permite entrada sin perseguir",
  cf5_rsi_extended: "Extensión sobrecomprada/sobrevendida",
  cf_price_action: "Acción del precio de la vela de confirmación",
  cf_signal: "Tipo de vela de señal",
  cf5_volume: "Volumen de acompañamiento",
  cf_basis: "Base técnica de la entrada",
  r_sl_fibo_ok: "Compatibilidad del SL 0,75 con la estructura",
  r_invalidation: "Punto de invalidación definido",
  r_stop_logic: "Lógica del stop",
  r_limit: "Riesgo dentro del límite",
  r_rr: "Relación riesgo/beneficio",
  r_loss_ok: "Aceptabilidad de la pérdida",
  rc_target: "Objetivo lógico del recorrido",
  rc_room: "Recorrido disponible hasta el objetivo",
  rc_rr2: "Recorrido compatible con R:R ≥ 1:2",
  ex_conditions: "Cumplimiento de condiciones previas",
  m5_timing: "Momento de la entrada respecto a la confirmación",
  ex_plan: "Ejecución conforme al plan",
  ex_respect: "Compromiso de no mover el plan",
  ds_why: "Motivo real de la entrada",
  ds_revenge: "Operación de revancha",
  ds_rules: "Modificación de reglas para justificar",
  ds_plan: "Respeto del plan",
  rs_result: "Resultado de la operación",
  rs_process: "Calidad del proceso",
};

/** Referencias de fuente conocidas del material ANIKE EJEPIKA. */
const SOURCES: Record<string, string> = {
  FREE: "ANIKE EJEPIKA — Matriz original de evaluación (cuestionario base CORE)",
  REVERSION: "ANIKE EJEPIKA — PROMPT BOSS MAESTRO, matriz S01",
  CONTINUACION: "ANIKE EJEPIKA — PROMPT BOSS MAESTRO, matriz S02",
  RUPTURA_RETESTEO: "ANIKE EJEPIKA — PROMPT BOSS MAESTRO, matriz S03",
  ZONA_FIBONACCI: "ANIKE EJEPIKA — PROMPT BOSS MAESTRO, matriz S04",
  IMPULSO_PULLBACK: "ANIKE EJEPIKA — PROMPT BOSS MAESTRO, matriz S05",
};

function blockOf(sectionId: SectionId) {
  const section = BASE_SECTIONS.find((s) => s.id === sectionId);
  return {
    code: section?.step ?? "??",
    title: section?.title ?? sectionId,
    postTrade: section?.postTrade === true,
  };
}

function isOfficialScale(factors: number[]): boolean {
  return (
    factors.length === OFFICIAL_FACTORS.length &&
    factors.every((f, i) => Math.abs(f - OFFICIAL_FACTORS[i]!) < 1e-9)
  );
}

/** Todas las opciones con el mismo factor ⇒ el reactivo es descriptivo. */
function isDescriptive(factors: number[]): boolean {
  return factors.length > 0 && factors.every((f) => f === factors[0]);
}

/** Tipos declarados por la especificación maestra (S01–S05) → tipo de registro. */
const KIND_TO_TYPE: Record<QuestionKind, RegistryType> = {
  METADATA: "METADATA",
  SCORE: "SCORE",
  SCORE_VALIDATION: "SCORE_VALIDATION",
  SCORE_AUTO_VALIDATION: "SCORE_VALIDATION",
  CONDITIONAL_SCORE: "CONDITIONAL_SCORE",
  CONDITIONAL_VALIDATION: "VALIDATION",
  VALIDATION: "VALIDATION",
};

/** IP7: escala EXACTA de 4 niveles definida por la especificación maestra. */
export const EXACT_SPEC_SCALES: Record<string, number[]> = { S05_STR_04: [1, 0.75, 0.5, 0] };

function typeOf(id: string, meta: boolean, factors: number[], hasCondition = false): RegistryType {
  if (AUTO_QUESTIONS.has(id)) return "AUTO_VALIDATION";
  if (meta || isDescriptive(factors)) return "METADATA";
  const conditional = CONDITIONAL_TRIGGERS.has(id);
  if (hasCondition) return "CONDITIONAL_SCORE";
  if (conditional || DECLARED_VALIDATION_IDS.has(id)) return "VALIDATION";
  return "SCORE";
}

function specBehaviorOf(kind: QuestionKind, weight: number): string {
  const note = `Suma al bloque CORE (${weight} pts) mediante F_block; no altera pesos ni fórmula.`;
  switch (kind) {
    case "METADATA":
      return "Descriptivo: no suma ni resta puntos, no valida ni bloquea.";
    case "VALIDATION":
      return "Validación pura (Sí/No): no puntúa; si no se cumple deja la evaluación CONDICIONAL.";
    case "CONDITIONAL_VALIDATION":
      return "Validación pura (Sí/No) sólo cuando su condición está activa; no puntúa; si no se cumple deja la evaluación CONDICIONAL.";
    case "CONDITIONAL_SCORE":
      return `Puntúa sólo cuando su condición está activa. ${note}`;
    case "SCORE_VALIDATION":
      return `Puntúa y valida: con factor 0 deja la evaluación CONDICIONAL (no HARD). ${note}`;
    case "SCORE_AUTO_VALIDATION":
      return `Puntúa y valida; además el motor comprueba automáticamente el riesgo % contra el límite del plan (invalidación global `risk_over_limit`). ${note}`;
    default:
      return note;
  }
}

function behaviorOf(type: RegistryType, id: string, weight: number): string {
  const scoreNote = `Suma al bloque CORE (${weight} pts) mediante F_block; no altera pesos ni fórmula.`;
  switch (type) {
    case "METADATA":
      return "Descriptivo: no suma ni resta puntos, no valida ni bloquea.";
    case "AUTO":
      return "Calculado por el motor a partir de los datos de la operación; no es criterio subjetivo.";
    case "AUTO_VALIDATION":
      return "Valor calculado por el motor (R:R): validación global objetiva, sin puntos de score.";
    case "SCORE_VALIDATION":
      return `Puntúa y valida (${id}): con factor 0 deja la evaluación CONDICIONAL, nunca NO TRADE. ${scoreNote}`;
    case "VALIDATION":
      return `Puntúa y puede dejar la evaluación CONDICIONAL (no APROBADA). ${scoreNote}`;
    case "CONDITIONAL_SCORE":
      return `Puntúa sólo cuando su condición está activa; nunca puntúa en simultáneo con su variante alternativa. ${scoreNote}`;
    default:
      return scoreNote;
  }
}

/** Desglose explícito de comportamiento exigido por el contrato del registro. */
function scoreBehaviorOf(type: RegistryType, weight: number): string {
  if (type === "METADATA") return "NO_SCORE: descriptivo, no aporta puntos.";
  if (type === "AUTO" || type === "AUTO_VALIDATION")
    return "NO_SCORE: valor calculado por el motor, no puntúa como criterio subjetivo.";
  if (type === "CONDITIONAL_SCORE")
    return `SCORE_CONDICIONAL: puntúa al bloque CORE (${weight} pts) sólo cuando su condición está activa.`;
  return `SCORE: puntúa al bloque CORE (${weight} pts) mediante F_block; no altera pesos ni fórmula.`;
}

function validationBehaviorOf(type: RegistryType, id: string): string {
  if (type === "VALIDATION" || type === "SCORE_VALIDATION" || type === "AUTO_VALIDATION")
    return `VALIDA: puede dejar la evaluación CONDICIONAL (regla ${id}).`;
  return "NO_VALIDA: no genera aviso condicional.";
}

function hardBehaviorOf(type: RegistryType, id: string): string {
  const exec = EXECUTION_INVALIDATION_BY_ID.get(id);
  if (exec)
    return `NO_HARD · INVALIDACIÓN DE EJECUCIÓN: ${exec.join(", ")} → NO TRADE (excepción explícita; el resto de respuestas nunca bloquea).`;
  if (id === "auto_rr")
    return "NO_HARD · INVALIDACIÓN GLOBAL: R:R < 1.00 → `rr_below_min` → NO TRADE; R:R >= 1.00 válido sin puntos.";
  return "NO_HARD: nunca bloquea por sí mismo; factor 0 nunca implica NO TRADE.";
}

function conditionTypeOf(condition: string | null): RegistryConditionType {
  if (!condition) return "NONE";
  return /_mode\b/i.test(condition) ? "MODE" : "VARIANT";
}

const score5 = (opts: [string, string][]): RegistryOption[] =>
  opts.map(([value, label], i) => ({ value, label, factor: OFFICIAL_FACTORS[i]! }));

/** Opciones descriptivas: METADATA nunca puntúa (factor 0). */
const meta0 = (opts: [string, string][]): RegistryOption[] =>
  opts.map(([value, label]) => ({ value, label, factor: 0 }));

/**
 * Reactivos DECLARADOS del registro maestro (fuente cerrada por contrato). Se
 * registran con tipo, condición, opciones y destino CORE, pero NO se inyectan en
 * el cuestionario activo: no alteran motor, pesos, fórmula, gates ni UI.
 */
const DECLARED_RECORDS: Array<
  Pick<
    RegistryRecord,
    | "setup_id"
    | "question_id"
    | "block_id"
    | "type"
    | "concept"
    | "text"
    | "condition"
    | "source"
    | "options"
  > & { hint?: string }
> = [
  {
    setup_id: "RUPTURA_RETESTEO",
    question_id: "S03_PATH_RR",
    block_id: "recorrido",
    type: "AUTO",
    concept: "R:R del objetivo calculado por el motor",
    text: "R:R del objetivo calculado por el motor",
    condition: null,
    source: "ANIKE EJEPIKA — PROMPT BOSS MAESTRO, S03 Recorrido",
    options: [],
  },
];

/** Reactivos AUTO del motor (no son preguntas): quedan registrados como tales. */
const AUTO_RECORDS: Array<{
  question_id: string;
  block_id: SectionId;
  concept: string;
  text: string;
  type: RegistryType;
  behavior: string;
}> = [
  {
    question_id: "auto_rr",
    block_id: "riesgo",
    concept: "R:R calculado por el motor (METADATA)",
    text: "Relación riesgo/beneficio (calculada automáticamente).",
    type: "METADATA",
    behavior:
      "METADATA / validación global objetiva: el motor calcula R:R desde entrada, stop y objetivo y lo muestra. No aporta factor ni puntos (no existe escala R:R). R:R < 1.00 → `rr_below_min` → NO TRADE; R:R >= 1.00 → válido sin puntos. Geometría LONG/SHORT obligatoria; Entry = SL (riskDistance 0) → NO TRADE.",
  },
  {
    question_id: "auto_position_size",
    block_id: "riesgo",
    concept: "Tamaño de posición y riesgo monetario",
    text: "Tamaño de posición (calculado automáticamente: exacto / orientativo / no disponible).",
    type: "AUTO",
    behavior:
      "El motor calcula riesgo monetario y tamaño de posición. No suma al score; su exactitud se informa al usuario.",
  },
];

function recordFromQuestion(
  setupId: EvaluationSetupId,
  q: {
    id: string;
    label: string;
    hint?: string;
    meta?: boolean;
    role?: TimeframeRole;
    anyTimeframe?: boolean;
    condition?: { questionId: string; value: string };
    kind?: QuestionKind;
    validationOnly?: boolean;
    pendingScale?: boolean;
    options: { v: string; label: string; pts: number }[];
    sectionId: SectionId;
  },
  order: number,
): RegistryRecord {
  const block = blockOf(q.sectionId);
  const factors = q.options.map((o) => o.pts);
  const condition = q.condition ? `${q.condition.questionId} = ${q.condition.value}` : null;
  const type = q.kind
    ? KIND_TO_TYPE[q.kind]
    : typeOf(q.id, q.meta === true, factors, condition !== null);
  const weight = CORE_WEIGHTS[q.sectionId];
  const scorable = type !== "METADATA" && type !== "AUTO" && q.validationOnly !== true;
  const exact = EXACT_SPEC_SCALES[q.id];
  const officialScale =
    isOfficialScale(factors) ||
    (exact !== undefined &&
      exact.length === factors.length &&
      exact.every((f, i) => f === factors[i]));
  const specPending = q.pendingScale === true;
  const pending = specPending || (scorable && type !== "AUTO_VALIDATION" && !officialScale);
  return {
    setup_id: setupId,
    setup_code: SETUP_CODE[setupId],
    setup_semantic_name: SETUP_SEMANTIC_NAME[setupId],
    setup_label: setupLabel(setupId),

    question_id: q.id,
    block_id: q.sectionId,
    block_code: block.code,
    block_title: block.title,
    order,
    type,
    concept:
      CONCEPTS[q.id] ??
      q.label
        .replace(/^[A-Z]+\d+[a-z]?\s·\s/, "")
        .replace(/[¿?:]/g, "")
        .trim(),
    text: q.label,
    hint: q.hint ?? null,
    condition,
    condition_type: conditionTypeOf(condition),
    options: q.options.map((o) => ({ value: o.v, label: o.label, factor: o.pts })),
    // Peso interno oficial (remapeo OPCIÓN A, % del componente fuente).
    internal_weight: scorable
      ? setupId !== "FREE" && INTERNAL_WEIGHTS[q.id]
        ? Math.round(INTERNAL_WEIGHTS[q.id]!.w * 10000) / 10000
        : 1
      : 0,
    core_target: {
      block: q.sectionId,
      weight,
      stage: block.postTrade ? "POST_TRADE" : "PRE_TRADE",
    },
    behavior: q.kind ? specBehaviorOf(q.kind, weight) : behaviorOf(type, q.id, weight),
    score_behavior: q.validationOnly
      ? "NO_SCORE: validación pura, no aporta puntos."
      : scoreBehaviorOf(type, weight),
    validation_behavior: q.kind
      ? /VALIDATION/.test(q.kind)
        ? "VALIDA: si no se cumple deja la evaluación CONDICIONAL (nunca NO TRADE)."
        : "NO_VALIDA: no genera aviso condicional."
      : validationBehaviorOf(type, q.id),
    hard_behavior: q.kind ? "NO_HARD: nunca bloquea por sí mismo." : hardBehaviorOf(type, q.id),
    role: q.anyTimeframe ? "ANY" : (q.role ?? null),
    source: SOURCE_OVERRIDES[q.id] ?? SOURCES[setupId] ?? null,
    active: true,
    status: pending ? "PENDIENTE_DE_FUENTE" : "COMPLETO",
    source_status: pending
      ? "PENDIENTE_DE_FUENTE"
      : NORMALIZED_IDS.has(q.id)
        ? "NORMALIZED"
        : "VERIFIED",
    pending_reason: specPending
      ? "La especificación maestra define el texto pero no las 5 opciones: se usa la escala genérica Claramente / Mayormente / Parcialmente / Débilmente / No hasta recibir la fuente."
      : pending
        ? `Escala histórica de ${factors.length} nivel(es) (${factors.join(" / ")}): falta fuente para expresarla con los 5 factores oficiales sin inventar contenido.`
        : null,
  };
}

/** Construye el registro maestro completo desde la matriz activa. */
export function buildRegistry(): RegistryRecord[] {
  const records: RegistryRecord[] = [];
  for (const setupId of EVALUATION_SETUP_IDS) {
    let order = 0;
    for (const q of getActiveQuestionsBySetup(setupId)) {
      order += 1;
      records.push(recordFromQuestion(setupId, q, order));
    }
    for (const auto of AUTO_RECORDS) {
      order += 1;
      const block = blockOf(auto.block_id);
      records.push({
        setup_id: setupId,
        setup_code: SETUP_CODE[setupId],
        setup_semantic_name: SETUP_SEMANTIC_NAME[setupId],
        setup_label: setupLabel(setupId),
        question_id: auto.question_id,
        block_id: auto.block_id,
        block_code: block.code,
        block_title: block.title,
        order,
        type: auto.type,
        concept: auto.concept,
        text: auto.text,
        hint: null,
        condition: null,
        condition_type: "NONE",
        options: [],
        internal_weight: 0,
        core_target: {
          block: auto.block_id,
          weight: CORE_WEIGHTS[auto.block_id],
          stage: "PRE_TRADE",
        },
        behavior: auto.behavior,
        score_behavior: scoreBehaviorOf(auto.type, CORE_WEIGHTS[auto.block_id]),
        validation_behavior: validationBehaviorOf(auto.type, auto.question_id),
        hard_behavior: hardBehaviorOf(auto.type, auto.question_id),
        role: null,
        source: "ANIKE EJEPIKA — motor CORE (cálculo automático)",
        active: true,
        status: "COMPLETO",
        source_status: "VERIFIED",
        pending_reason: null,
      });
    }
    for (const rec of DECLARED_RECORDS.filter((p) => p.setup_id === setupId)) {
      order += 1;
      const block = blockOf(rec.block_id);
      records.push({
        setup_id: setupId,
        setup_code: SETUP_CODE[setupId],
        setup_semantic_name: SETUP_SEMANTIC_NAME[setupId],
        setup_label: setupLabel(setupId),
        question_id: rec.question_id,
        block_id: rec.block_id,
        block_code: block.code,
        block_title: block.title,
        order,
        type: rec.type,
        concept: rec.concept,
        text: rec.text,
        hint: rec.hint ?? null,
        condition: rec.condition,
        condition_type: conditionTypeOf(rec.condition),
        options: rec.options,
        internal_weight: rec.type === "METADATA" || rec.type === "AUTO" ? 0 : 1,
        core_target: {
          block: rec.block_id,
          weight: CORE_WEIGHTS[rec.block_id],
          stage: block.postTrade ? "POST_TRADE" : "PRE_TRADE",
        },
        behavior: behaviorOf(rec.type, rec.question_id, CORE_WEIGHTS[rec.block_id]),
        score_behavior: scoreBehaviorOf(rec.type, CORE_WEIGHTS[rec.block_id]),
        validation_behavior: validationBehaviorOf(rec.type, rec.question_id),
        hard_behavior: hardBehaviorOf(rec.type, rec.question_id),
        role: isAnyTimeframeQuestion(rec.question_id)
          ? "ANY"
          : (questionRole(rec.question_id, rec.block_id) ?? null),
        source: rec.source,
        active: false,
        status: "COMPLETO",
        source_status: "NORMALIZED",
        pending_reason: null,
      });
    }
  }
  return records;
}

/** Registro maestro (derivado de la matriz activa en el momento de la llamada). */
export function registryBySetup(): Record<EvaluationSetupId, RegistryRecord[]> {
  const all = buildRegistry();
  return Object.fromEntries(
    EVALUATION_SETUP_IDS.map((s) => [s, all.filter((r) => r.setup_id === s)]),
  ) as Record<EvaluationSetupId, RegistryRecord[]>;
}

export type RegistrySummary = {
  total: number;
  complete: number;
  pending: number;
  pendingIds: { setup_id: EvaluationSetupId; question_id: string; reason: string }[];
  byType: Record<RegistryType, number>;
  bySourceStatus: Record<RegistrySourceStatus, number>;
  active: number;
  declared: number;
};

export function registrySummary(records = buildRegistry()): RegistrySummary {
  const byType = {} as Record<RegistryType, number>;
  for (const r of records) byType[r.type] = (byType[r.type] ?? 0) + 1;
  const bySourceStatus: Record<RegistrySourceStatus, number> = {
    VERIFIED: 0,
    NORMALIZED: 0,
    PENDIENTE_DE_FUENTE: 0,
  };
  for (const r of records) bySourceStatus[r.source_status] += 1;
  const pending = records.filter((r) => r.status === "PENDIENTE_DE_FUENTE");
  return {
    total: records.length,
    complete: records.length - pending.length,
    pending: pending.length,
    pendingIds: pending.map((r) => ({
      setup_id: r.setup_id,
      question_id: r.question_id,
      reason: r.pending_reason ?? "",
    })),
    byType,
    bySourceStatus,
    active: records.filter((r) => r.active).length,
    declared: records.filter((r) => !r.active).length,
  };
}

/** Integridad del registro. Los tests exigen lista vacía. */
export function registryIssues(records = buildRegistry()): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  const setupPrefix: Record<EvaluationSetupId, string> = {
    FREE: "",
    REVERSION: "s01_",
    CONTINUACION: "s02_",
    RUPTURA_RETESTEO: "s03_",
    ZONA_FIBONACCI: "s04_",
    IMPULSO_PULLBACK: "s05_",
  };
  for (const r of records) {
    const key = `${r.setup_id}::${r.question_id}`;
    if (seen.has(key)) problems.push(`ID duplicado en el registro: ${key}`);
    seen.add(key);

    // Aislamiento: ningún setup puede heredar reactivos exclusivos de otro.
    for (const [setupId, prefix] of Object.entries(setupPrefix)) {
      if (prefix && r.question_id.toLowerCase().startsWith(prefix) && r.setup_id !== setupId) {
        problems.push(`${key}: reactivo exclusivo de ${setupId} presente en ${r.setup_id}`);
      }
    }

    if (r.options.some((o) => /no aplica/i.test(o.label) || o.value === "na")) {
      problems.push(`${key}: contiene la opción prohibida "No aplica"`);
    }

    if (CORE_WEIGHTS[r.block_id] !== r.core_target.weight) {
      problems.push(`${key}: destino CORE inconsistente con el peso del bloque`);
    }

    if (r.condition !== null && !/^[A-Za-z0-9_]+ (=|!=) ([A-Z_]+|\*)$/.test(r.condition)) {
      problems.push(`${key}: condición con formato inválido: ${r.condition}`);
    }
    if ((r.condition === null) !== (r.condition_type === "NONE")) {
      problems.push(`${key}: condition_type incoherente con la condición declarada`);
    }
    if (r.block_id === "resultados" && r.core_target.stage !== "POST_TRADE") {
      problems.push(`${key}: Resultados debe ser post-trade`);
    }
    if (r.block_id !== "resultados" && r.core_target.stage !== "PRE_TRADE") {
      problems.push(`${key}: sólo Resultados puede ser post-trade`);
    }
    if (/(^|_)rr$/.test(r.question_id) && (r.type !== "METADATA" || r.internal_weight !== 0)) {
      problems.push(`${key}: R:R debe registrarse como METADATA sin peso de score`);
    }
    if (
      r.question_id === "s05_deep_pullback" &&
      r.hard_behavior.startsWith("HARD")
    ) {
      problems.push(`${key}: el pullback profundo no puede bloquear automáticamente`);
    }

    const scoring =
      r.type === "SCORE" ||
      r.type === "SCORE_VALIDATION" ||
      r.type === "CONDITIONAL_SCORE" ||
      r.type === "VALIDATION";
    if (scoring && r.status === "COMPLETO" && r.internal_weight > 0) {
      const factors = r.options.map((o) => o.factor);
      const exact = EXACT_SPEC_SCALES[r.question_id];
      const exactOk = exact !== undefined && exact.join() === factors.join();
      if (!isOfficialScale(factors) && !exactOk) {
        problems.push(`${key}: reactivo puntuable COMPLETO sin los 5 factores oficiales`);
      }
      for (let i = 1; i < factors.length; i += 1) {
        if (factors[i]! >= factors[i - 1]!) {
          problems.push(`${key}: factores no están en orden descendente`);
          break;
        }
      }
    }
    if (!scoring && r.options.length === 0 && r.internal_weight !== 0) {
      problems.push(`${key}: reactivo no puntuable con internal_weight distinto de 0`);
    }
  }

  const preTrade = (Object.keys(CORE_WEIGHTS) as SectionId[])
    .filter((id) => id !== "resultados")
    .reduce((acc, id) => acc + CORE_WEIGHTS[id], 0);
  if (preTrade !== PRE_TRADE_CORE_WEIGHT)
    problems.push(`Peso pre-trade CORE incorrecto: ${preTrade}`);
  if (CORE_WEIGHTS["resultados"] !== POST_TRADE_CORE_WEIGHT)
    problems.push("Peso post-trade CORE incorrecto");

  return [...new Set(problems)];
}
