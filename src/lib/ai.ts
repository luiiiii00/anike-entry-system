import { supabase } from "@/integrations/supabase/client";

export type AiReview = {
  id: string;
  user_id: string;
  trade_id: string | null;
  evaluation_id: string | null;
  review_type: "PRE_TRADE" | "NO_TRADE" | "POST_TRADE" | "WEEKLY_REVIEW";
  summary: string;
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
  ai_daily_limit_reached: "Has alcanzado tu límite diario de análisis IA.",
  evaluation_not_found: "No encontramos esta evaluación.",
};

export function aiErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : "";
  const key = Object.keys(MESSAGES).find((k) => raw.includes(k));
  if (key) return MESSAGES[key]!;
  return "ANIKE IA no está disponible en este momento. Tu evaluación y tus datos no se han perdido.";
}
