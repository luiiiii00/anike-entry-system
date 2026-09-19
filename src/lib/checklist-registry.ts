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

import {
  BASE_SECTIONS,
  EVALUATION_SETUP_IDS,
  getActiveQuestionsBySetup,
  questionTimeframe,
  setupLabel,
  type EvaluationSetupId,
  type SectionId,
  type Timeframe,
} from "./checklist";

/** Tipos oficiales de reactivo del registro maestro. */
export type RegistryType =
  | "METADATA"
  | "SCORE"
  | "CONDITIONAL_SCORE"
  | "VALIDATION"
  | "SCORE_VALIDATION"
  | "AUTO"
  | "AUTO_VALIDATION"
  | "HARD";

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
  /** Condición de activación. `null` = siempre activo dentro de su setup. */
  condition: string | null;
  condition_type: RegistryConditionType;
  options: RegistryOption[];
  /** Peso interno dentro de su bloque (equiponderado en el motor actual). */
  internal_weight: number;
  core_target: { block: SectionId; weight: number; stage: "PRE_TRADE" | "POST_TRADE" };
  /** Comportamiento de score / validación / HARD (resumen). */
  behavior: string;
  score_behavior: string;
  validation_behavior: string;
  hard_behavior: string;
  timeframe: Timeframe | null;
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

/** Reactivos que alimentan una HARD rule del motor (ver `scoring.ts`). */
const HARD_TRIGGERS = new Set([
  "ctx_aligned",
  "h1_structure",
  "h1_struct",
  "h1_pattern_change_state",
  "h1_pattern_cont_state",
  "cf5_close",
  "cf5_diag_break",
  "cf_basis",
  "r_invalidation",
  "r_stop_logic",
  "r_sl_fibo_ok",
  "r_rr",
  "rc_room",
  "rc_rr2",
  "z_space",
  "m5_timing",
  "ex_conditions",
  "r_limit",
  "ds_why",
  "ds_revenge",
  "ds_rules",
  "ds_plan",
  "ds_motive",
]);

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

/** Conceptos semánticos declarados. Sin entrada se deriva del texto del reactivo. */
const CONCEPTS: Record<string, string> = {
  co_instrument: "Identificación del instrumento operado",
  co_conditions: "Idoneidad de las condiciones de mercado",
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
  z_relevance: "Relevancia de la zona en contexto 1D/1H",
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
  REVERSION: "ANIKE EJEPIKA — Matriz definitiva de setups, bloque S01 (R1–R13)",
  CONTINUACION: "ANIKE EJEPIKA — Matriz definitiva de setups, bloque S02 (C1–C12)",
  RUPTURA_RETESTEO: "ANIKE EJEPIKA — Matriz definitiva de setups, bloque S03 (RR1–RR12)",
  ZONA_FIBONACCI: "ANIKE EJEPIKA — Matriz definitiva de setups, bloque S04 (ZF1–ZF13)",
  IMPULSO_PULLBACK: "ANIKE EJEPIKA — Matriz definitiva de setups, bloque S05 (IP1–IP12)",
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

function typeOf(id: string, meta: boolean, factors: number[]): RegistryType {
  if (AUTO_QUESTIONS.has(id)) return "AUTO_VALIDATION";
  if (meta || isDescriptive(factors)) return "METADATA";
  const hard = HARD_TRIGGERS.has(id);
  const conditional = CONDITIONAL_TRIGGERS.has(id);
  if (hard && isOfficialScale(factors)) return "SCORE_VALIDATION";
  if (hard) return "HARD";
  if (conditional) return "VALIDATION";
  return "SCORE";
}

function behaviorOf(type: RegistryType, id: string, weight: number): string {
  const scoreNote = `Suma al bloque CORE (${weight} pts) mediante F_block; no altera pesos ni fórmula.`;
  switch (type) {
    case "METADATA":
      return "Descriptivo: no suma ni resta puntos, no valida ni bloquea.";
    case "AUTO":
      return "Calculado por el motor a partir de los datos de la operación; no es criterio subjetivo.";
    case "AUTO_VALIDATION":
      return "Valor calculado por el motor (R:R): valida el mínimo 1:2 y puede activar HARD `rr_below_2`.";
    case "HARD":
      return `Puede activar una HARD rule (${id}) → NO TRADE inmediato. ${scoreNote}`;
    case "SCORE_VALIDATION":
      return `Puntúa y además alimenta una HARD rule (${id}) → NO TRADE si se cumple la condición de bloqueo. ${scoreNote}`;
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
  if (type === "HARD" || type === "SCORE_VALIDATION")
    return `HARD: puede activar la regla crítica ${id} → NO TRADE inmediato.`;
  if (type === "AUTO_VALIDATION")
    return "HARD: R:R < 1:2 activa la regla crítica `rr_below_2` → NO TRADE.";
  return "NO_HARD: nunca bloquea por sí mismo.";
}

function conditionTypeOf(condition: string | null): RegistryConditionType {
  if (!condition) return "NONE";
  return /execution_mode/.test(condition) ? "MODE" : "VARIANT";
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
  >
> = [
  {
    setup_id: "RUPTURA_RETESTEO",
    question_id: "s03_break_variant",
    block_id: "estructura",
    type: "METADATA",
    concept: "Variante de ruptura declarada (MOMENTUM o THREE_BODY)",
    text: "¿Qué variante de ruptura se utilizará?",
    condition: null,
    source: "ANIKE EJEPIKA — S03 RUPTURA: variantes MOMENTUM / THREE_BODY",
    options: meta0([
      ["MOMENTUM", "MOMENTUM"],
      ["THREE_BODY", "THREE_BODY"],
    ]),
  },
  {
    setup_id: "RUPTURA_RETESTEO",
    question_id: "s03_momentum_quality",
    block_id: "confirmacion",
    type: "CONDITIONAL_SCORE",
    concept: "Calidad de la ruptura por momentum",
    text: "¿Qué tan fuerte y válida es la ruptura por momentum?",
    condition: "s03_break_variant = MOMENTUM",
    source: "ANIKE EJEPIKA — S03 RUPTURA, variante MOMENTUM",
    options: score5([
      ["excelente", "Impulso fuerte, cierre limpio y ruptura inequívoca"],
      ["fuerte", "Impulso claro y ruptura válida"],
      ["parcial", "Ruptura moderada"],
      ["debil", "Ruptura débil/dudosa"],
      ["ausente", "No existe ruptura válida por momentum"],
    ]),
  },
  {
    setup_id: "RUPTURA_RETESTEO",
    question_id: "s03_three_body_quality",
    block_id: "confirmacion",
    type: "CONDITIONAL_SCORE",
    concept: "Calidad de la ruptura de tres cuerpos",
    text: "¿Qué tan válida es la ruptura formada por tres cuerpos?",
    condition: "s03_break_variant = THREE_BODY",
    source: "ANIKE EJEPIKA — S03 RUPTURA, variante THREE_BODY",
    options: score5([
      ["excelente", "Secuencia completa, clara y con cierre válido"],
      ["fuerte", "Secuencia clara con pequeña imperfección"],
      ["parcial", "Secuencia parcialmente formada"],
      ["debil", "Secuencia débil/dudosa"],
      ["ausente", "No existe una ruptura válida de tres cuerpos"],
    ]),
  },
  {
    setup_id: "ZONA_FIBONACCI",
    question_id: "s04_execution_mode",
    block_id: "ejecucion",
    type: "METADATA",
    concept: "Modo de ejecución declarado (incluye GIRO)",
    text: "¿Qué modo de ejecución se utilizará?",
    condition: null,
    source: "ANIKE EJEPIKA — S04, execution_mode",
    options: meta0([
      ["GIRO", "GIRO"],
      ["CONTINUACION", "CONTINUACIÓN"],
      ["REACCION_EN_ZONA", "REACCIÓN EN ZONA"],
      ["RUPTURA_RETESTEO", "RUPTURA/RETESTEO"],
      ["OTRO", "OTRO MODO DECLARADO"],
    ]),
  },
  {
    setup_id: "ZONA_FIBONACCI",
    question_id: "s04_execution_direction_change",
    block_id: "confirmacion",
    type: "CONDITIONAL_SCORE",
    concept: "Cambio de dirección en la temporalidad de ejecución",
    text: "¿Qué tan clara es la confirmación del cambio de dirección en la temporalidad de ejecución?",
    condition: "s04_execution_mode = GIRO",
    source: "ANIKE EJEPIKA — S04, condición execution_mode = GIRO",
    options: score5([
      ["excelente", "Cambio de dirección claramente confirmado"],
      ["fuerte", "Cambio fuertemente confirmado"],
      ["parcial", "Cambio parcialmente confirmado"],
      ["debil", "Cambio débil/en desarrollo"],
      ["ausente", "No existe confirmación de cambio de dirección"],
    ]),
  },
  {
    setup_id: "ZONA_FIBONACCI",
    question_id: "s04_five_stage_sequence",
    block_id: "estructura",
    type: "VALIDATION",
    concept: "Secuencia de cinco etapas (validación, sin doble puntuación)",
    text: "¿Qué tan completa está la secuencia de cinco etapas exigida para S04?",
    condition: null,
    source: "ANIKE EJEPIKA — S04, secuencia de cinco etapas",
    options: score5([
      ["excelente", "Las cinco etapas están completas y en orden"],
      ["fuerte", "Cuatro etapas completas y la quinta en confirmación clara"],
      ["parcial", "Tres etapas completas"],
      ["debil", "Una o dos etapas completas"],
      ["ausente", "Secuencia ausente o inválida"],
    ]),
  },
  {
    setup_id: "IMPULSO_PULLBACK",
    question_id: "s05_pullback_type",
    block_id: "zona",
    type: "METADATA",
    concept: "Tipo de pullback",
    text: "¿Qué tipo de pullback presenta el precio?",
    condition: null,
    source: "ANIKE EJEPIKA — S05, tipo de pullback",
    options: meta0([
      ["superficial", "Pullback superficial"],
      ["moderado", "Pullback moderado"],
      ["profundo", "Pullback profundo"],
      ["complejo", "Pullback complejo"],
      ["no_clasificable", "Pullback no clasificable"],
    ]),
  },
  {
    setup_id: "IMPULSO_PULLBACK",
    question_id: "s05_deep_pullback",
    block_id: "estructura",
    type: "VALIDATION",
    concept: "Pullback profundo (validación, nunca HARD automático)",
    text: "¿El pullback profundo conserva la validez estructural del impulso?",
    condition: null,
    source: "ANIKE EJEPIKA — S05, pullback profundo",
    options: score5([
      ["excelente", "Conserva completamente la estructura y no amenaza la invalidación"],
      ["fuerte", "Conserva la estructura con margen reducido"],
      ["parcial", "Se acerca a la invalidación pero todavía conserva la tesis"],
      ["debil", "Está muy cerca de invalidar la estructura"],
      ["ausente", "Invalidó el impulso"],
    ]),
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
    concept: "R:R calculado por el motor",
    text: "Relación riesgo/beneficio (calculada automáticamente).",
    type: "AUTO_VALIDATION",
    behavior:
      "El motor calcula R:R desde entrada, stop y objetivo. Si R:R < 1:2 activa la HARD rule `rr_below_2` → NO TRADE. No es una pregunta subjetiva.",
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
    meta?: boolean;
    timeframe?: Timeframe;
    options: { v: string; label: string; pts: number }[];
    sectionId: SectionId;
  },
  order: number,
): RegistryRecord {
  const block = blockOf(q.sectionId);
  const factors = q.options.map((o) => o.pts);
  const type = typeOf(q.id, q.meta === true, factors);
  const weight = CORE_WEIGHTS[q.sectionId];
  const scorable = type !== "METADATA" && type !== "AUTO";
  const officialScale = isOfficialScale(factors);
  const pending = scorable && type !== "AUTO_VALIDATION" && !officialScale;
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
        .replace(/^[A-Z]+\d+\s·\s/, "")
        .replace(/[¿?:]/g, "")
        .trim(),
    text: q.label,
    condition: null,
    condition_type: "NONE",
    options: q.options.map((o) => ({ value: o.v, label: o.label, factor: o.pts })),
    internal_weight: scorable ? 1 : 0,
    core_target: {
      block: q.sectionId,
      weight,
      stage: block.postTrade ? "POST_TRADE" : "PRE_TRADE",
    },
    behavior: behaviorOf(type, q.id, weight),
    score_behavior: scoreBehaviorOf(type, weight),
    validation_behavior: validationBehaviorOf(type, q.id),
    hard_behavior: hardBehaviorOf(type, q.id),
    timeframe: q.timeframe ?? null,
    source: SOURCES[setupId] ?? null,
    active: true,
    status: pending ? "PENDIENTE_DE_FUENTE" : "COMPLETO",
    source_status: pending ? "PENDIENTE_DE_FUENTE" : "VERIFIED",
    pending_reason: pending
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
        timeframe: null,
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
        condition: rec.condition,
        condition_type: conditionTypeOf(rec.condition),
        options: rec.options,
        internal_weight: rec.type === "METADATA" ? 0 : 1,
        core_target: {
          block: rec.block_id,
          weight: CORE_WEIGHTS[rec.block_id],
          stage: block.postTrade ? "POST_TRADE" : "PRE_TRADE",
        },
        behavior: behaviorOf(rec.type, rec.question_id, CORE_WEIGHTS[rec.block_id]),
        score_behavior: scoreBehaviorOf(rec.type, CORE_WEIGHTS[rec.block_id]),
        validation_behavior: validationBehaviorOf(rec.type, rec.question_id),
        hard_behavior: hardBehaviorOf(rec.type, rec.question_id),
        timeframe: questionTimeframe(rec.question_id, rec.block_id) ?? null,
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
      if (prefix && r.question_id.startsWith(prefix) && r.setup_id !== setupId) {
        problems.push(`${key}: reactivo exclusivo de ${setupId} presente en ${r.setup_id}`);
      }
    }

    if (r.options.some((o) => /no aplica/i.test(o.label) || o.value === "na")) {
      problems.push(`${key}: contiene la opción prohibida "No aplica"`);
    }

    if (CORE_WEIGHTS[r.block_id] !== r.core_target.weight) {
      problems.push(`${key}: destino CORE inconsistente con el peso del bloque`);
    }

    if (r.condition !== null && !/^[a-z0-9_]+ (=|!=) [A-Z_]+$/.test(r.condition)) {
      problems.push(`${key}: condición con formato inválido: ${r.condition}`);
    }

    const scoring =
      r.type === "SCORE" ||
      r.type === "SCORE_VALIDATION" ||
      r.type === "CONDITIONAL_SCORE" ||
      r.type === "VALIDATION" ||
      r.type === "HARD";
    if (scoring && r.status === "COMPLETO") {
      const factors = r.options.map((o) => o.factor);
      if (!isOfficialScale(factors)) {
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
