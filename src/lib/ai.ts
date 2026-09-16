import { supabase } from "@/integrations/supabase/client";

export type AiReview = {
  id: string;
  user_id: string;
  trade_id: string | null;
  evaluation_id: string | null;
  review_type: "PRE_TRADE" | "NO_TRADE" | "POST_TRADE" | "WEEKLY_REVIEW";
  summary: string;
  /** Por qué el sistema llegó a ese estado (puede estar vacío en análisis antiguos). */
  why?: string | null;
  /** Contradicciones detectadas (puede estar vacío en análisis antiguos). */
  contradictions?: string | null;
  what_worked: string;
  what_failed: string;
  what_learned: string;
  next_time: string;

  created_at: string;
};

export async function fetchAiReviewsForEvaluation(evaluationId: string): Promise<AiReview[]> {
  const { data, error } = await supabase
    .from("ai_reviews")
    .select("*")
    .eq("evaluation_id", evaluationId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as AiReview[];
}

export async function fetchAiReviewsByType(type: AiReview["review_type"]): Promise<AiReview[]> {
  const { data, error } = await supabase
    .from("ai_reviews")
    .select("*")
    .eq("review_type", type)
    .order("created_at", { ascending: false })
    .limit(10);
  if (error) throw error;
  return (data ?? []) as unknown as AiReview[];
}

export async function fetchAnalyzedEvaluationIds(): Promise<Set<string>> {
  const { data, error } = await supabase.from("ai_reviews").select("evaluation_id");
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.evaluation_id).filter((v): v is string => !!v));
}

const MESSAGES: Record<string, string> = {
  ai_daily_limit_reached: "Has alcanzado tu límite de análisis IA de las últimas 24 horas.",
  ai_rate_limited: "ANIKE IA está recibiendo muchas peticiones. Prueba de nuevo en un momento.",
  ai_no_credits: "ANIKE IA no tiene créditos disponibles en este momento.",
  ai_blocked: "ANIKE IA está desactivada o limitada en este espacio de trabajo.",
  evaluation_not_found: "No encontramos esta evaluación.",
};


export function aiErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : "";
  const key = Object.keys(MESSAGES).find((k) => raw.includes(k));
  if (key) return MESSAGES[key]!;
  return "ANIKE IA no está disponible en este momento. Tu evaluación y tus datos no se han perdido.";
}
