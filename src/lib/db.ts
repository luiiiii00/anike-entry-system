import { supabase } from "@/integrations/supabase/client";
import type { Answers, Breakdown, RiskData } from "./scoring";

export type Settings = {
  user_id: string;
  max_risk_pct: number;
  min_rr: number;
  max_daily_trades: number;
  preferred_setups: string[];
  theme: string;
  currency: string;
  account_capital: number;
};

export type Evaluation = {
  id: string;
  user_id: string;
  trade_no: number | null;
  trade_date: string;
  trade_time: string | null;
  asset: string | null;
  market: string | null;
  session: string | null;
  direction: string | null;
  setup: string | null;
  idea: string | null;
  answers: Answers;
  risk: RiskData;
  score: number | null;
  breakdown: Breakdown | Record<string, never>;
  classification: string | null;
  hard_rules: string[];
  emotional_stop: boolean;
  status: "draft" | "completed" | string;
  decision: string | null;
  result_r: number | null;
  result_money: number | null;
  followed_plan: string | null;
  review: Record<string, string>;
  created_at: string;
  updated_at: string;
};

export async function fetchSettings(userId: string): Promise<Settings> {
  const { data, error } = await supabase.from("settings").select("*").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  if (data) return data as unknown as Settings;
  const { data: created, error: insertError } = await supabase
    .from("settings")
    .insert({ user_id: userId })
    .select("*")
    .single();
  if (insertError) throw insertError;
  return created as unknown as Settings;
}

export async function saveSettings(userId: string, patch: Partial<Settings>) {
  const { error } = await supabase.from("settings").update(patch).eq("user_id", userId);
  if (error) throw error;
}

export async function fetchEvaluations(): Promise<Evaluation[]> {
  const { data, error } = await supabase
    .from("evaluations")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as Evaluation[];
}

export async function fetchEvaluation(id: string): Promise<Evaluation | null> {
  const { data, error } = await supabase.from("evaluations").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return (data ?? null) as unknown as Evaluation | null;
}

export async function upsertEvaluation(
  payload: Partial<Evaluation> & { user_id: string },
): Promise<Evaluation> {
  if (payload.id) {
    const { id, ...rest } = payload;
    const { data, error } = await supabase
      .from("evaluations")
      .update(rest as never)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;
    return data as unknown as Evaluation;
  }
  const { data, error } = await supabase
    .from("evaluations")
    .insert(payload as never)
    .select("*")
    .single();
  if (error) throw error;
  return data as unknown as Evaluation;
}

export async function deleteEvaluation(id: string) {
  const { error } = await supabase.from("evaluations").delete().eq("id", id);
  if (error) throw error;
}

export async function nextTradeNumber(): Promise<number> {
  const { data, error } = await supabase
    .from("evaluations")
    .select("trade_no")
    .order("trade_no", { ascending: false })
    .limit(1);
  if (error) throw error;
  const top = data?.[0]?.trade_no ?? 0;
  return (top ?? 0) + 1;
}
