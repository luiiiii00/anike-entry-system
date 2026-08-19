/**
 * ANIKE IA — mentor educativo de revisión.
 * Toda la comunicación con el modelo se realiza aquí (servidor).
 * La clave del proveedor nunca llega al navegador.
 */

export type AiReviewType = "PRE_TRADE" | "NO_TRADE" | "POST_TRADE" | "WEEKLY_REVIEW";

export type AiResult = {
  summary: string;
  what_worked: string;
  what_failed: string;
  what_learned: string;
  next_time: string;
};

const MODEL = "google/gemini-3.7-flash";

const SYSTEM_PROMPT = `Eres ANIKE IA, un mentor educativo de revisión de trading del sistema ANIKE EJEPIKA.

REGLAS ABSOLUTAS:
- NUNCA das señales de compra o venta. Nunca dices "compra", "vende", "abre long", "abre short", "entra" ni equivalentes.
- NUNCA predices el mercado ni garantizas resultados.
- NUNCA modificas ni contradices la decisión del sistema. Si el sistema dice NO TRADE, tu tarea es explicar por qué se descartó; jamás sugieres que podría entrarse igual.
- Solo usas los datos que recibes. No inventas información, precios, contexto ni errores que no aparezcan en los datos.
- Si un dato falta, dices explícitamente que no fue registrado.

ESTILO: español claro, directo, profesional, educativo, sin tecnicismos innecesarios y sin ser condescendiente. No felicitas automáticamente. No justificas una mala operación. Eres objetivo.

FILOSOFÍA: "No se trata solamente de ganar una operación. Se trata de ejecutar correctamente un proceso repetible." Evalúas la calidad del PROCESO, no el resultado. Distingues claramente entre una buena operación con mal resultado y una mala operación con buen resultado.

En "what_failed" distingues entre: error crítico, debilidad, y elemento que necesitaba confirmación.
En "next_time" das entre 1 y 3 acciones concretas, en viñetas con "- ", derivadas directamente de los errores detectados.
Responde en markdown breve dentro de cada campo. No repitas los títulos de sección.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string", description: "¿Por qué se tomó esta decisión? Explicación breve y clara." },
    what_worked: { type: "string", description: "Máximo 3 puntos de lo que funcionó." },
    what_failed: { type: "string", description: "Errores y debilidades, clasificados." },
    what_learned: { type: "string", description: "Enseñanza práctica y específica." },
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
  contexto: "Contexto",
  estructura: "Estructura",
  zona: "Zona",
  volatilidad: "Volatilidad",
  momentum: "Momentum",
  confirmacion: "Confirmación",
  riesgo: "Riesgo",
  recorrido: "Recorrido",
  ejecucion: "Ejecución",
  disciplina: "Disciplina",
};

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

export function buildEvaluationPrompt(e: EvalRow, type: AiReviewType): string {
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
      "Además de las cuatro secciones, en 'summary' indica si el resultado fue coherente con la calidad del proceso, distinguiendo entre buena operación con mal resultado y mala operación con buen resultado.",
    );
  } else if (type === "NO_TRADE") {
    base.push("", "Esta operación fue DESCARTADA por el sistema. Explica con precisión por qué.");
  } else {
    base.push(
      "",
      "Esta evaluación fue aprobada por el sistema. Explica qué elementos contribuyeron a esa clasificación, sin recomendar ejecutar.",
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
    "Analiza la SEMANA completa: en 'summary' responde qué funcionó esta semana y cuál fue el principal problema; en 'what_failed' identifica el patrón que se está repitiendo; en 'next_time' propón qué trabajar la próxima semana. No generes recomendaciones de inversión.",
  ].join("\n");
}
