import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
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
  final_state?: string | null;

  decision: string | null;
  result_r: number | null;
  result_money: number | null;
  followed_plan: string | null;
  review: Record<string, string>;
  notes?: string | null;
  created_at: string;
  updated_at: string;
  // POST-TRADE (calculado y guardado en servidor)
  market_type?: string | null;
  currency?: string | null;
  entry_price?: number | null;
  exit_price?: number | null;
  quantity?: number | null;
  lot_size?: number | null;
  contract_size?: number | null;
  leverage?: number | null;
  margin?: number | null;
  notional_value?: number | null;
  stop_loss?: number | null;
  take_profit?: number | null;
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
  post_trade_inputs?: Json | null;
  calculated_at?: string | null;
};

/*
 * El registro directo en el Journal y el guardado de evaluaciones se realizan
 * en servidor (`src/lib/evaluations.functions.ts`): el cliente no puede escribir
 * campos derivados ni elegir el número de operación.
 */


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

/**
 * Reflexión post-trade: los ÚNICOS campos que el cliente puede escribir sobre una
 * evaluación finalizada (el trigger en BD rechaza cualquier campo derivado).
 */
export async function saveTradeReflection(
  id: string,
  patch: { followed_plan?: string | null; review?: Record<string, string>; notes?: string | null },
): Promise<Evaluation> {
  const { data, error } = await supabase
    .from("evaluations")
    .update(patch as never)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data as unknown as Evaluation;
}

export async function deleteEvaluation(id: string) {
  const { error } = await supabase.from("evaluations").delete().eq("id", id);
  if (error) throw error;
}

/**
 * Número de operación PROVISIONAL para mostrar en el asistente. El número
 * definitivo lo asigna el contador transaccional de la base de datos al guardar.
 */

export async function nextTradeNumber(userId?: string): Promise<number> {
  let uid = userId;
  if (!uid) {
    const { data: auth } = await supabase.auth.getUser();
    uid = auth.user?.id;
  }
  let query = supabase.from("evaluations").select("trade_no");
  if (uid) query = query.eq("user_id", uid);
  const { data, error } = await query.order("trade_no", { ascending: false }).limit(1);
  if (error) throw error;
  const top = data?.[0]?.trade_no ?? 0;
  return (top ?? 0) + 1;
}
