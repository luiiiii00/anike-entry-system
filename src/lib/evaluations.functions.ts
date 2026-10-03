import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { evaluate, type Answers, type RiskData } from "@/lib/scoring";
import { loadAndApplyPublishedOverlay } from "@/lib/checklist-overlay";
import type { Evaluation } from "@/lib/db";
import type { Json } from "@/integrations/supabase/types";

/**
 * Fuente única de verdad del motor: el cliente envía ÚNICAMENTE datos fuente
 * (respuestas, riesgo, datos de la operación, decisión solicitada). El servidor
 * recalcula score, clasificación, reglas críticas, freno emocional, estado final
 * y decisión efectiva, y es el único que puede escribirlos (trigger en BD).
 *
 * Flujo de escritura en dos pasos:
 *  1) Como el usuario (RLS + trigger): datos fuente. Garantiza propiedad y acceso
 *     activo; el contador transaccional asigna el número de operación.
 *  2) Como servidor: campos derivados recalculados.
 */

import { EVALUATION_SETUP_IDS } from "@/lib/checklist";

// Ausente / null / "" permitidos; un valor explícito debe ser numérico y finito
// (NaN, Infinity y -Infinity se rechazan, no se descartan en silencio).
const numish = z
  .union([
    z.number().finite(),
    z
      .string()
      .max(40)
      .refine((v) => v.trim() === "" || Number.isFinite(Number(v)), "valor no finito"),
    z.null(),
  ])
  .optional();

const riskSchema = z
  .object({
    capital: numish,
    riskPct: numish,
    entry: numish,
    stop: numish,
    target: numish,
    swingHigh: numish,
    swingLow: numish,
    slFibo: numish,
  })
  .partial();

export const saveEvaluationInputSchema = z.object({
  id: z.string().uuid().optional(),
  tradeDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  tradeTime: z.string().max(8).nullable().optional(),
  asset: z.string().max(40).nullable().optional(),
  market: z.string().max(40).nullable().optional(),
  session: z.string().max(40).nullable().optional(),
  direction: z.enum(["LONG", "SHORT"]).nullable().optional(),
  // A1: sólo setups oficiales (S01–S05 + FREE); null/undefined = global histórico.
  setup: z
    .enum(EVALUATION_SETUP_IDS as unknown as [string, ...string[]])
    .nullable()
    .optional(),
  idea: z.string().max(4000).nullable().optional(),
  answers: z.record(z.string().max(60), z.string().max(200)),
  risk: riskSchema,
  status: z.enum(["draft", "completed"]),
  decision: z.enum(["registrado", "no_trade"]).nullable().optional(),
});

export type SaveEvaluationInput = z.infer<typeof saveEvaluationInputSchema>;

const MESSAGES: Record<string, string> = {
  evaluation_not_found: "Evaluación no encontrada o sin acceso activo.",
  completed_evaluation_is_frozen:
    "Esta evaluación ya está finalizada: sus datos no pueden modificarse. Crea una nueva evaluación.",
  derived_fields_are_server_managed: "Los campos calculados los determina el servidor.",
  trade_rejected_cannot_register: "La operación es NO TRADE por el sistema: no puede registrarse.",
  conditional_cannot_register:
    "La operación es CONDICIONAL: no cumple los gates obligatorios del sistema y no puede registrarse como operación ANIKE EJEPIKA. Puedes finalizarla como NO TRADE.",
  incomplete_cannot_register:
    "El cuestionario activo del setup está incompleto: todas sus preguntas son obligatorias.",
  decision_required: "Debes elegir REGISTRAR o NO TRADE para finalizar.",
  decision_locked: "La decisión de una evaluación finalizada no puede cambiarse.",
  asset_required: "Falta el activo de la operación.",
};

function evaluateOrReject(input: Parameters<typeof evaluate>[0]) {
  try {
    return evaluate(input);
  } catch {
    throw new Error("Setup inválido: elige uno de los setups oficiales.");
  }
}

function friendly(code: string): Error {
  return new Error(MESSAGES[code] ?? code);
}

function dbError(message: string): Error {
  for (const code of Object.keys(MESSAGES)) if (message.includes(code)) return friendly(code);
  return new Error(message);
}

/** Convierte valores numéricos del formulario a números finitos (o los descarta). */
function cleanRisk(risk: SaveEvaluationInput["risk"]): RiskData {
  const out: RiskData = {};
  for (const [k, v] of Object.entries(risk)) {
    if (v === null || v === undefined || v === "") continue;
    const n = Number(v);
    if (Number.isFinite(n)) (out as Record<string, number>)[k] = n;
  }
  return out;
}

export const saveEvaluationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => saveEvaluationInputSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const answers: Answers = data.answers;
    const risk = cleanRisk(data.risk);

    // El cuestionario activo es el publicado desde administración (si existe):
    // el servidor recalcula siempre con la misma versión que ve el usuario.
    await loadAndApplyPublishedOverlay(supabase);

    const { data: settings } = await supabase
      .from("settings")
      .select("max_risk_pct, preferred_setups")
      .eq("user_id", userId)
      .maybeSingle();

    let current: { id: string; status: string; decision: string | null } | null = null;
    if (data.id) {
      const { data: row, error } = await supabase
        .from("evaluations")
        .select("id, status, decision")
        .eq("id", data.id)
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw dbError(error.message);
      if (!row) throw friendly("evaluation_not_found");
      current = row;
      // Una evaluación finalizada es histórica: no se recalcula ni se reescribe.
      if (row.status === "completed") throw friendly("completed_evaluation_is_frozen");
    }

    // ---- Recalculo server-side (la única fuente de verdad) --------------------
    const decision = evaluateOrReject({
      answers,
      risk,
      maxRiskPct: Number(settings?.max_risk_pct ?? 1),
      setup: data.setup ?? null,
      preferredSetups: settings?.preferred_setups ?? [],
      direction: data.direction ?? null,
      market: data.market ?? null,
    });
    // V2: sólo una evaluación APROBADA puede registrarse. NO TRADE (invalidación
    // global objetiva) y CONDICIONAL (score, gates o pendientes) no son registrables.
    const rejected = decision.globalInvalidation || decision.finalState === "NO TRADE";

    let effectiveDecision: "registrado" | "no_trade" | null = null;
    if (data.status === "completed") {
      if (!data.decision) throw friendly("decision_required");
      if (!data.asset?.trim()) throw friendly("asset_required");
      if (data.decision === "registrado") {
        if (rejected) throw friendly("trade_rejected_cannot_register");
        if (!decision.complete) throw friendly("incomplete_cannot_register");
        if (decision.finalState !== "APROBADA") throw friendly("conditional_cannot_register");
      }
      effectiveDecision = data.decision;
    }

    // ---- 1) Datos fuente como el usuario (RLS + trigger) ----------------------
    const source = {
      trade_date: data.tradeDate,
      trade_time: data.tradeTime || null,
      asset: data.asset?.trim() || null,
      market: data.market ?? null,
      session: data.session ?? null,
      direction: data.direction ?? null,
      setup: data.setup ?? null,
      idea: data.idea || null,
      answers,
      risk: risk as Record<string, number>,
    };

    let id = current?.id;
    if (id) {
      const { error } = await supabase
        .from("evaluations")
        .update(source)
        .eq("id", id)
        .eq("user_id", userId);
      if (error) throw dbError(error.message);
    } else {
      const { data: inserted, error } = await supabase
        .from("evaluations")
        .insert({ ...source, user_id: userId })
        .select("id")
        .single();
      if (error) throw dbError(error.message);
      id = inserted.id;
    }

    // ---- 2) Campos derivados como servidor ----------------------------------
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("evaluations")
      .update({
        // Se persiste el score VISIBLE (floor); la clasificación y el estado ya
        // se decidieron con el score interno con decimales.
        score: decision.scoreVisible,
        breakdown: decision.breakdown as unknown as Json,
        classification: decision.classification,
        // V2: ningún reactivo produce HARD. La columna conserva las
        // invalidaciones globales objetivas (informativo, no decide el estado).
        hard_rules: decision.globalInvalidations,
        // Señal informativa de disciplina: no decide el estado.
        emotional_stop: decision.emotional,
        final_state: decision.finalState,
        status: data.status,
        decision: effectiveDecision,
      })
      .eq("id", id)
      .eq("user_id", userId)
      .select("*")
      .single();
    if (error) throw dbError(error.message);

    return row as unknown as Evaluation;
  });

/**
 * Registro directo en el Journal (sin checklist previo). Se crea como el usuario
 * (RLS + numeración transaccional) y el servidor la marca como registrada.
 */
export const createJournalTradeFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: inserted, error } = await supabase
      .from("evaluations")
      .insert({ user_id: userId })
      .select("id")
      .single();
    if (error) throw dbError(error.message);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error: updError } = await supabaseAdmin
      .from("evaluations")
      .update({ status: "completed", decision: "registrado", classification: "REGISTRO DIRECTO" })
      .eq("id", inserted.id)
      .eq("user_id", userId)
      .select("*")
      .single();
    if (updError) throw dbError(updError.message);
    return row as unknown as Evaluation;
  });
