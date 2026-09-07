/**
 * ANIKE IA — mentor educativo de revisión.
 * Toda la comunicación con el modelo se realiza aquí (servidor).
 * La clave del proveedor nunca llega al navegador.
 */

import { SECTIONS } from "./checklist";
import {
  FINAL_STATE_UI,
  checkConditional,
  computeRisk,
  type FinalState,
  type RiskData,
} from "./scoring";

export type AiReviewType = "PRE_TRADE" | "NO_TRADE" | "POST_TRADE" | "WEEKLY_REVIEW";

export type AiResult = {
  summary: string;
  what_worked: string;
  what_failed: string;
  what_learned: string;
  next_time: string;
};

const MODEL = "google/gemini-3.7-flash";

const SYSTEM_PROMPT = `Eres ANIKE IA, el mentor de trading del sistema ANIKE EJEPIKA.

QUIÉN ERES
No eres un bot de señales ni un generador de informes. Eres un mentor objetivo que ayuda al trader a entender sus propias decisiones. Tu misión es AYUDARLO A PENSAR, no decidir por él.

REGLAS ABSOLUTAS
- Nunca das señales ni instrucciones operativas: nada de "compra", "vende", "abre long/short", "entra", "pon el stop aquí", "tu objetivo debería ser X".
- Nunca predices el mercado ni prometes resultados.
- Nunca contradices la decisión del sistema. Si el sistema dijo NO TRADE, explicas por qué se descartó; jamás insinúas que podría entrarse igual.
- Nunca inventas. Solo usas los datos que recibes. No asumes tendencia, volumen, estructura, soportes, resistencias, noticias, contexto macro ni indicadores que no aparezcan en los datos. Si falta un dato dices "no tengo ese dato" o "no puedo evaluarlo con la información disponible".
- No diagnosticas personalidad ni haces afirmaciones psicológicas clínicas.

PERSONALIDAD Y TONO
Humano, directo, objetivo, exigente, analítico, constructivo y claro. Seguro, pero sin arrogancia. Hablas como un mentor que conoce el proceso, no como un manual, un informe financiero, un robot ni un texto académico.
- Escribe natural: en lugar de "se identifican oportunidades de mejora", di "acá tienes algo para trabajar". En lugar de "se recomienda mantener una adecuada gestión del riesgo", di "el riesgo está controlado, no tocaría eso; tu problema está en otro lugar".
- Puedes usar expresiones naturales con MODERACIÓN (nunca como muletillas): "ojo con esto", "acá está el problema", "esta parte me gusta", "el problema no está en la dirección, está en la ejecución", "no necesitas hacer más, necesitas esperar", "el mercado no te debe una entrada".
- NO felicitas automáticamente. Prohibido "excelente análisis", "muy buen trabajo", "sigue así" si los datos no lo justifican. Si fue malo, lo dices. Si fue mediocre: "hay una buena idea detrás, pero todavía no está suficientemente limpia".
- Exigente sin humillar. Jamás "fue absurdo", "una tontería", "no sabes operar", "error estúpido". En su lugar: "este fue el punto más débil", "acá tu proceso perdió calidad", "este es el comportamiento que deberías corregir".

PRINCIPIO CENTRAL — separa siempre CALIDAD DEL PROCESO de RESULTADO
Una operación ganadora puede haber sido una mala decisión y una perdedora puede haber sido una ejecución excelente. Si el resultado es bueno y el proceso débil, no dejas que el resultado justifique la entrada. Si el resultado es malo y el proceso sólido, lo dices con claridad: es una pérdida que forma parte de un proceso válido. Refuerzas la mentalidad de proceso sin repetir frases hechas en cada análisis.

CÓMO ANALIZAS
- El score se INTERPRETA, no se repite. Explica qué significa ese nivel y hacia dónde se fueron los puntos que faltan. Alto: evaluación fuerte, pero mira dónde están los puntos perdidos. Medio (aprox. 60-75): zona donde hay que ser especialmente disciplinado. Bajo: no significa que el mercado irá en contra, significa que su propia evaluación encontró demasiadas condiciones que no cumplen su plan.
- Usa el puntaje por sección para nombrar DÓNDE perdió puntos y ordénalos por peso. Si puedes, señala el único punto que revisarías antes de ejecutar. No repitas toda la evaluación: encuentra lo importante.
- Busca CONTRADICCIONES dentro de la evaluación (contexto a favor + entrada contra tendencia, buena estructura + mala ubicación, buen setup + R:R insuficiente, score alto + regla crítica incumplida, buen análisis + ejecución impulsiva, plan correcto + entrada anticipada). Cuando encuentres una, ábrela con "OJO CON ESTO" y explícala.
- Si hay una REGLA CRÍTICA incumplida, destácala con "🚨 REGLA CRÍTICA" y explica que pesa más que el resto de la puntuación: un score alto no la puede tapar.
- Personaliza con los números reales del trader (riesgo usado vs. su mínimo, R:R, R, P&L, ROI). Nada de frases intercambiables.
- No repitas lo que el trader ya respondió; agrega valor sobre eso ("el contexto está a favor, pero por sí solo no justifica la entrada"). Cada párrafo debe aportar algo nuevo.
- Si recibes historial de operaciones, busca patrones y prioriza: fortaleza, debilidad recurrente y comportamiento asociado a mejores resultados. Con pocas muestras no afirmes: usa "con las operaciones disponibles", "hay una tendencia inicial", "necesitamos más operaciones para confirmarlo".

CÓMO ESCRIBES CADA CAMPO (markdown breve, sin repetir los títulos de sección)
- summary → TU LECTURA: 2 a 4 frases sobre la calidad general del proceso, interpretando el score y la coherencia entre proceso y resultado. Cierra SIEMPRE con una última línea que empiece exactamente con "🚨 EL PUNTO CLAVE:" y contenga UNA sola cosa que el trader debería recordar.
- what_worked → máximo 3 puntos en viñetas con "- ", explicando específicamente por qué cada uno estuvo bien. Si no hubo nada sólido, dilo sin adornos.
- what_failed → máximo 3 puntos en viñetas con "- ", priorizados por importancia, distinguiendo error crítico, debilidad y elemento que necesitaba confirmación. Si detectas una contradicción o una regla crítica, va aquí y primero.
- what_learned → la enseñanza concreta que deja esta operación, en 1 o 2 frases.
- next_time → 1 a 3 acciones concretas en viñetas con "- ", derivadas de lo que falló.

LONGITUD: entre 250 y 450 palabras en total. Si el caso es simple, 100-250. Solo si hay muchos conflictos importantes, hasta 500. No escribas ensayos.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: {
      type: "string",
      description:
        "TU LECTURA: 2-4 frases interpretando el score y la calidad del proceso, cerrando con una línea que empiece con '🚨 EL PUNTO CLAVE:'.",
    },
    what_worked: { type: "string", description: "Máximo 3 viñetas con lo que estuvo bien y por qué." },
    what_failed: {
      type: "string",
      description:
        "Máximo 3 viñetas priorizadas con lo que no convence: contradicciones, reglas críticas, debilidades.",
    },
    what_learned: { type: "string", description: "Enseñanza concreta de esta operación." },
    next_time: { type: "string", description: "1 a 3 acciones concretas en viñetas." },
  },
  required: ["summary", "what_worked", "what_failed", "what_learned", "next_time"],
} as const;

export class AiUnavailableError extends Error {
  constructor(message = "ai_unavailable") {
    super(message);
  }
}

export async function runAnikeAi(userPrompt: string): Promise<AiResult> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new AiUnavailableError("ai_not_configured");

  let res: Response;
  try {
    res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "X-Lovable-AIG-SDK": "fetch",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.85,
        response_format: {
          type: "json_schema",
          json_schema: { name: "anike_review", strict: true, schema: SCHEMA },
        },
      }),
    });
  } catch {
    throw new AiUnavailableError();
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 429) throw new AiUnavailableError("ai_rate_limited");
    if (res.status === 402) throw new AiUnavailableError("ai_no_credits");
    console.error("[anike-ia] gateway error", res.status, body.slice(0, 500));
    throw new AiUnavailableError();
  }

  const json = (await res.json().catch(() => null)) as
    | { choices?: { message?: { content?: string } }[] }
    | null;
  const content = json?.choices?.[0]?.message?.content;
  if (!content) throw new AiUnavailableError();

  let parsed: Partial<AiResult>;
  try {
    parsed = JSON.parse(content) as Partial<AiResult>;
  } catch {
    throw new AiUnavailableError();
  }

  return {
    summary: (parsed.summary ?? "").trim(),
    what_worked: (parsed.what_worked ?? "").trim(),
    what_failed: (parsed.what_failed ?? "").trim(),
    what_learned: (parsed.what_learned ?? "").trim(),
    next_time: (parsed.next_time ?? "").trim(),
  };
}

/* ------------------------------ Prompts ------------------------------ */

type EvalRow = {
  asset: string | null;
  direction: string | null;
  setup: string | null;
  score: number | null;
  classification: string | null;
  idea: string | null;
  hard_rules: string[] | null;
  emotional_stop: boolean | null;
  decision: string | null;
  result_r: number | null;
  followed_plan: string | null;
  answers: Record<string, unknown> | null;
  risk: Record<string, unknown> | null;
  breakdown: Record<string, { earned?: number; weight?: number }> | null;
  review: Record<string, string> | null;
  notes: string | null;
  market_type?: string | null;
  currency?: string | null;
  entry_price?: number | null;
  exit_price?: number | null;
  stop_loss?: number | null;
  take_profit?: number | null;
  leverage?: number | null;
  margin?: number | null;
  gross_pnl?: number | null;
  fees?: number | null;
  net_pnl?: number | null;
  price_change_percent?: number | null;
  roi_margin?: number | null;
  risk_amount?: number | null;
  risk_percent?: number | null;
  planned_rr?: number | null;
  realized_rr?: number | null;
  trade_result?: string | null;
};

const SECTION_LABELS: Record<string, string> = {
  comercio: "Comercio",
  resultados: "Resultados",
  contexto: "Contexto",
  estructura: "Estructura",
  zona: "Zona",
  volatilidad: "Volatilidad (histórico)",
  momentum: "Momentum (histórico)",
  confirmacion: "Confirmación",
  riesgo: "Riesgo",
  recorrido: "Recorrido",
  ejecucion: "Ejecución",
  disciplina: "Disciplina",
};

/** Etiqueta legible de una respuesta del checklist; null si la evaluación es anterior al criterio. */
function labelOf(qid: string, a: EvalRow["answers"]): string | null {
  const v = a?.[qid];
  if (v === null || v === undefined || v === "") return null;
  const q = SECTIONS.flatMap((s) => s.groups.flatMap((g) => g.questions)).find(
    (x) => x.id === qid,
  );
  return q?.options.find((o) => o.v === String(v))?.label ?? String(v);
}

function line(label: string, value: unknown) {
  if (value === null || value === undefined || value === "") return `- ${label}: no registrado`;
  return `- ${label}: ${String(value)}`;
}

function rrOf(risk: Record<string, unknown> | null) {
  const entry = Number(risk?.["entry"]);
  const stop = Number(risk?.["stop"]);
  const target = Number(risk?.["target"]);
  if (!entry || !stop || !target) return null;
  const d = Math.abs(entry - stop);
  return d ? Number((Math.abs(target - entry) / d).toFixed(2)) : null;
}

function breakdownLines(b: EvalRow["breakdown"]) {
  if (!b) return "- Desglose por sección: no registrado";
  return Object.entries(b)
    .map(([k, v]) => `- ${SECTION_LABELS[k] ?? k}: ${v?.earned ?? 0} de ${v?.weight ?? 0} puntos`)
    .join("\n");
}

/** Secciones donde se perdieron más puntos, ordenadas: sirve para "lo que más pesó". */
function lostPointsLines(b: EvalRow["breakdown"]) {
  if (!b) return "- Puntos perdidos: no registrado";
  const lost = Object.entries(b)
    .map(([k, v]) => ({
      label: SECTION_LABELS[k] ?? k,
      lost: Math.max(0, Number(v?.weight ?? 0) - Number(v?.earned ?? 0)),
      weight: Number(v?.weight ?? 0),
    }))
    .filter((x) => x.lost > 0)
    .sort((a, b2) => b2.lost - a.lost)
    .slice(0, 5);
  if (lost.length === 0) return "- No se perdieron puntos en ninguna sección.";
  return lost
    .map((x, i) => `- ${i + 1}. ${x.label}: perdió ${x.lost} de ${x.weight} puntos`)
    .join("\n");
}

/** Respuestas del trader por sección, para no repetirlas sino agregar valor. */
function answerLines(a: EvalRow["answers"]) {
  if (!a || Object.keys(a).length === 0) return "- Respuestas del checklist: no registradas";
  const out: string[] = [];
  for (const section of SECTIONS) {
    const rows = section.groups
      .flatMap((g) => g.questions)
      .filter((q) => a[q.id] !== undefined && a[q.id] !== "")
      .map((q) => `  - ${q.label} ${labelOf(q.id, a) ?? "no registrado"}`);
    if (rows.length === 0) continue;
    out.push(`- ${SECTION_LABELS[section.id] ?? section.title}:`, ...rows);
  }
  if (out.length === 0) return "- Respuestas del checklist: no registradas";
  return out.slice(0, 140).join("\n");
}

/**
 * Estado final del sistema (🟢 APROBADA / 🟡 CONDICIONAL / 🔴 DESCARTADA) reconstruido
 * a partir de lo guardado: reglas duras, freno emocional, score y avisos condicionales.
 */
function finalStateBlock(e: EvalRow): string[] {
  const answers = (e.answers ?? {}) as Record<string, string>;
  const warnings = checkConditional({
    a: answers,
    risk: computeRisk((e.risk ?? {}) as RiskData, e.direction, { market: e.market ?? null }),
    maxRiskPct: Number.POSITIVE_INFINITY,
    setup: e.setup,
    preferredSetups: [],
  });
  const critical = (e.hard_rules?.length ?? 0) > 0 || e.emotional_stop === true;
  const score = e.score ?? 0;
  const finalState: FinalState = critical
    ? "DESCARTADA"
    : score < 65
      ? "DESCARTADA"
      : warnings.length > 0 || score < 75
        ? "CONDICIONAL"
        : "APROBADA";
  const fibo = e.risk?.["slFibo"];
  return [
    "",
    "ESTADO FINAL DEL SISTEMA (decisión que ya tomó ANIKE EJEPIKA; no la contradigas):",
    line("Estado", `${FINAL_STATE_UI[finalState].dot} ${finalState}`),
    line(
      "Avisos condicionales (no descartan, exigen esperar)",
      warnings.length > 0 ? warnings.join(" | ") : "ninguno",
    ),
    line(
      "SL predeterminado por Fibonacci 0,75",
      fibo === null || fibo === undefined || fibo === "" ? null : String(fibo),
    ),
    line("Extremo alto del impulso declarado", e.risk?.["swingHigh"]),
    line("Extremo bajo del impulso declarado", e.risk?.["swingLow"]),
  ];
}

export type TraderHistoryInput = {
  sample: number;
  avgScore: number | null;
  winRate: number | null;
  avgR: number | null;
  avgScoreWinners: number | null;
  avgScoreLosers: number | null;
  impulsive: number;
  offPlan: number;
  topRules: string[];
  bestSetup: string | null;
  worstSetup: string | null;
};

function historyBlock(h: TraderHistoryInput | null): string[] {
  if (!h || h.sample === 0) {
    return [
      "",
      "HISTORIAL DEL TRADER: no hay operaciones previas suficientes. No afirmes patrones; dilo si hace falta.",
    ];
  }
  return [
    "",
    `HISTORIAL RECIENTE DEL TRADER (${h.sample} operaciones registradas — úsalo solo para detectar patrones, con la prudencia que corresponde a esta cantidad de muestras):`,
    line("Score promedio", h.avgScore),
    line("Win rate", h.winRate === null ? null : `${h.winRate}%`),
    line("Promedio R", h.avgR),
    line("Score promedio en operaciones ganadoras", h.avgScoreWinners),
    line("Score promedio en operaciones perdedoras", h.avgScoreLosers),
    line("Operaciones con freno emocional", h.impulsive),
    line("Operaciones fuera del plan", h.offPlan),
    line("Mejor setup histórico", h.bestSetup),
    line("Peor setup histórico", h.worstSetup),
    line(
      "Reglas duras más repetidas",
      h.topRules.length > 0 ? h.topRules.join(" | ") : "ninguna repetida",
    ),
  ];
}

export function buildEvaluationPrompt(
  e: EvalRow,
  type: AiReviewType,
  history: TraderHistoryInput | null = null,
): string {
  const rr = rrOf(e.risk);
  const base = [
    "DATOS DE LA EVALUACIÓN (sistema ANIKE EJEPIKA):",
    line("Activo", e.asset),
    line("Dirección", e.direction),
    line("Setup", e.setup),
    line("Score total", e.score === null ? null : `${e.score}/100`),
    line("Clasificación del sistema", e.classification),
    line("R:R", rr),
    line("Riesgo %", e.risk?.["riskPct"]),
    line("Descripción de la idea", e.idea),
    line("Disciplina / freno emocional", e.emotional_stop ? "ACTIVADO" : "sin señales impulsivas"),
    line(
      "Reglas duras incumplidas",
      e.hard_rules && e.hard_rules.length > 0 ? e.hard_rules.join(" | ") : "ninguna",
    ),
    line(
      "Motivo de NO TRADE",
      e.classification === "NO TRADE" || e.decision === "no_trade"
        ? (e.hard_rules && e.hard_rules.length > 0
            ? `reglas duras: ${e.hard_rules.join(" | ")}`
            : e.emotional_stop
              ? "freno emocional activado"
              : `score insuficiente (${e.score ?? "—"}/100)`)
        : "no aplica",
    ),
    "",
    "PUNTAJE POR SECCIÓN:",
    breakdownLines(e.breakdown),
    "",
    "DÓNDE SE PERDIERON LOS PUNTOS (ordenado por peso):",
    lostPointsLines(e.breakdown),
    "",
    "RESPUESTAS DEL TRADER EN EL CHECKLIST (no las repitas, agrega valor sobre ellas):",
    answerLines(e.answers),
    "",
    "LECTURA TÉCNICA DECLARADA (horaria = contexto/estructura, 5M = confirmación de entrada; \"no aplica\" o \"no registrado\" no es un error):",
    line("Patrón de cambio (horaria)", labelOf("h1_pattern_change", e.answers)),
    line("Patrón de continuidad (horaria)", labelOf("h1_pattern_cont", e.answers)),
    line("Nivel de Fibonacci (horaria)", labelOf("h1_fibo", e.answers)),
    line("Divergencia precio/RSI (horaria)", labelOf("h1_rsi_div", e.answers)),
    line("MACD histograma en zona Fibonacci (horaria)", labelOf("h1_macd", e.answers)),
    line("Cruce de líneas MACD tras romper la diagonal (5M)", labelOf("cf5_macd", e.answers)),
    line("RSI evita sobrecompra/sobreventa en la entrada (5M)", labelOf("cf5_rsi", e.answers)),
    ...finalStateBlock(e),
    ...historyBlock(history),
  ];

  if (type === "POST_TRADE") {
    base.push(
      "",
      "RESULTADO DE LA OPERACIÓN EJECUTADA:",
      line("Decisión registrada", e.decision === "registrado" ? "TRADE EJECUTADO" : "NO TRADE"),
      line("Resultado en R", e.result_r),
      line("¿Siguió el plan?", e.followed_plan),
      line("Notas post-trade del trader", e.notes),
      "",
      "DATOS CALCULADOS POR LA CALCULADORA POST-TRADE:",
      line("Mercado", e.market_type),
      line("Precio de entrada", e.entry_price),
      line("Precio de salida", e.exit_price),
      line("Stop Loss", e.stop_loss),
      line("Take Profit", e.take_profit),
      line("Apalancamiento", e.leverage === null || e.leverage === undefined ? null : `${e.leverage}x`),
      line("Margen utilizado", e.margin),
      line("P&L bruto", e.gross_pnl),
      line("Comisiones y costos", e.fees),
      line("P&L neto", e.net_pnl === null || e.net_pnl === undefined ? null : `${e.net_pnl} ${e.currency ?? ""}`),
      line("Movimiento del precio %", e.price_change_percent),
      line("ROI sobre margen %", e.roi_margin),
      line("Riesgo monetario", e.risk_amount),
      line("Riesgo % sobre capital", e.risk_percent),
      line("R:R planificado", e.planned_rr),
      line("R:R realizado", e.realized_rr),
      line("Clasificación del resultado", e.trade_result),
      line("Qué dice el trader que funcionó", e.review?.["worked"]),
      line("Qué dice el trader que falló", e.review?.["failed"]),
      "",
      "Esta operación ya está cerrada. Compara el plan con la ejecución real: qué parte del proceso fue correcta, cuál fue el error real, la enseñanza y la acción concreta.",
      "En 'summary' juzga la coherencia entre resultado y calidad del proceso. Si ganó con proceso débil, no permitas que el resultado justifique la entrada. Si perdió con proceso sólido y riesgo controlado, dilo con claridad: es una pérdida que forma parte de un proceso válido.",
    );
  } else if (type === "NO_TRADE") {
    base.push(
      "",
      "Esta operación fue DESCARTADA por el sistema. Explica con precisión por qué se descartó y qué habría hecho falta para que la idea llegara limpia, sin sugerir en ningún caso que podría entrarse igual.",
    );
  } else {
    base.push(
      "",
      "Esta evaluación fue aprobada por el sistema y todavía no tiene resultado. Explica qué elementos sostienen esa clasificación y cuáles dejan la entrada menos limpia de lo que podría estar, sin recomendar ejecutar ni anticipar el resultado.",
    );
  }

  return base.join("\n");
}

export type WeeklyStatsInput = {
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

export function buildWeeklyPrompt(s: WeeklyStatsInput): string {
  return [
    `ESTADÍSTICAS AGREGADAS DE LA SEMANA (desde ${s.weekStart}):`,
    line("Número de operaciones", s.total),
    line("Win rate", s.winRate === null ? null : `${s.winRate}%`),
    line("Promedio R", s.avgR),
    line("Score promedio", s.avgScore),
    line("Operaciones impulsivas", s.impulsive),
    line("Operaciones fuera del plan", s.offPlan),
    line("Mejor setup", s.bestSetup),
    line("Peor setup", s.worstSetup),
    line(
      "Errores recurrentes (reglas duras más activadas)",
      s.recurringRules.length > 0 ? s.recurringRules.join(" | ") : "ninguno registrado",
    ),
    "",
    "Analiza la SEMANA completa como mentor: en 'summary' lee la calidad del proceso semanal (no solo los resultados) y cierra con la línea '🚨 EL PUNTO CLAVE:'; en 'what_failed' identifica el patrón que se está repitiendo y sé prudente si hay pocas operaciones; en 'next_time' propón qué trabajar la próxima semana. No generes recomendaciones de inversión ni señales.",
  ].join("\n");
}
