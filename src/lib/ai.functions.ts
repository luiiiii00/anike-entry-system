import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { setupLabel } from "@/lib/checklist";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";


const idSchema = z.string().uuid();

const reviewTypeSchema = z.enum(["PRE_TRADE", "NO_TRADE", "POST_TRADE", "WEEKLY_REVIEW"]);

async function adminDb() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function dailyLimit(db: Awaited<ReturnType<typeof adminDb>>) {
  const { data } = await db
    .from("ai_settings")
    .select("ai_daily_limit")
    .eq("id", true)
    .maybeSingle();
  return Number(data?.ai_daily_limit ?? 5);
}

async function usedToday(db: Awaited<ReturnType<typeof adminDb>>, userId: string) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await db
    .from("ai_reviews")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", since);
  return count ?? 0;
}

export const aiUsageFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await adminDb();
    const [limit, used] = await Promise.all([dailyLimit(db), usedToday(db, context.userId)]);
    return { used, limit, remaining: Math.max(0, limit - used) };
  });

export const setAiLimitFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ limit: z.number().int().min(0).max(200) }).parse(data))
  .handler(async ({ data, context }) => {
    const { assertAdmin } = await import("@/lib/admin.server");
    await assertAdmin(context.supabase, context.userId);
    const db = await adminDb();
    const { error } = await db
      .from("ai_settings")
      .update({ ai_daily_limit: data.limit })
      .eq("id", true);
    if (error) throw new Error(error.message);
    return { limit: data.limit };
  });

export const analyzeEvaluationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({ evaluationId: idSchema, reviewType: reviewTypeSchema.optional() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { runAnikeAi, buildEvaluationPrompt, AiUnavailableError } =
      await import("@/lib/ai.server");
    const db = await adminDb();

    const limit = await dailyLimit(db);
    const used = await usedToday(db, context.userId);
    if (used >= limit) throw new Error("ai_daily_limit_reached");

    const { data: row, error } = await db
      .from("evaluations")
      .select("*")
      .eq("id", data.evaluationId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("evaluation_not_found");

    // Historial reciente del propio usuario: solo lectura, para detectar patrones.
    const { data: recent } = await db
      .from("evaluations")
      .select("score,result_r,emotional_stop,followed_plan,hard_rules,setup,status")
      .eq("user_id", context.userId)
      .neq("id", row.id)
      .order("trade_date", { ascending: false })
      .limit(30);
    const history = buildHistory(recent ?? []);

    const isNoTrade =
      row.final_state === "NO TRADE" ||
      row.final_state === "DESCARTADA" ||
      row.classification === "NO TRADE" ||
      row.decision === "no_trade";
    const hasResult = row.result_r !== null && row.result_r !== undefined;
    const reviewType =
      data.reviewType ?? (hasResult ? "POST_TRADE" : isNoTrade ? "NO_TRADE" : "PRE_TRADE");

    // Contexto post-trade: sólo si la operación está cerrada. Se calcula en
    // servidor a partir de los campos ya guardados; el cliente no lo envía.
    let postTradeContext: unknown = null;
    if (reviewType === "POST_TRADE") {
      const { analyzePostTradeAll, buildAiPostTradeContext, refsFromRow } = await import(
        "@/lib/posttrade-analytics"
      );
      const { data: settings } = await db
        .from("settings")
        .select("account_capital")
        .eq("user_id", context.userId)
        .maybeSingle();
      const refs = refsFromRow(
        row as unknown as Record<string, unknown>,
        Number(settings?.account_capital ?? null),
      );
      postTradeContext = buildAiPostTradeContext(analyzePostTradeAll(refs.planned, refs.real));
    }

    const prompt = buildEvaluationPrompt(
      {
        asset: row.asset,
        direction: row.direction,
        setup: row.setup,
        score: row.score,
        classification: row.classification,
        idea: row.idea,
        hard_rules: row.hard_rules,
        emotional_stop: row.emotional_stop,
        decision: row.decision,
        final_state: row.final_state,
        result_r: row.result_r,
        followed_plan: row.followed_plan,

        answers: row.answers as Record<string, unknown> | null,
        risk: row.risk as Record<string, unknown> | null,
        breakdown: row.breakdown as Record<string, { earned?: number; weight?: number }> | null,
        review: row.review as Record<string, string> | null,
        notes: row.notes,
        // `market` es el mercado de la evaluación (lo usa computeRisk/evaluate);
        // `market_type` es el del cálculo post-trade. Se envían ambos.
        market: row.market,
        market_type: row.market_type,
        currency: row.currency,
        entry_price: row.entry_price,
        exit_price: row.exit_price,
        stop_loss: row.stop_loss,
        take_profit: row.take_profit,
        leverage: row.leverage,
        margin: row.margin,
        gross_pnl: row.gross_pnl,
        fees: row.fees,
        net_pnl: row.net_pnl,
        price_change_percent: row.price_change_percent,
        roi_margin: row.roi_margin,
        risk_amount: row.risk_amount,
        risk_percent: row.risk_percent,
        planned_rr: row.planned_rr,
        realized_rr: row.realized_rr,
        trade_result: row.trade_result,
      },
      reviewType,
      history,
      postTradeContext,
    );


    let result;
    try {
      result = await runAnikeAi(prompt);
    } catch (e) {
      if (e instanceof AiUnavailableError) throw new Error(e.message);
      throw e;
    }

    const { data: saved, error: insertError } = await db
      .from("ai_reviews")
      .insert({
        user_id: context.userId,
        evaluation_id: row.id,
        trade_id: row.id,
        review_type: reviewType,
        ...result,
      })
      .select("*")
      .single();
    if (insertError) throw new Error(insertError.message);
    return saved;
  });

export const analyzeWeekFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        weekStart: z.string().min(8).max(10),
        total: z.number().int().min(0),
        winRate: z.number().nullable(),
        avgR: z.number().nullable(),
        avgScore: z.number().nullable(),
        impulsive: z.number().int().min(0),
        offPlan: z.number().int().min(0),
        bestSetup: z.string().max(80).nullable(),
        worstSetup: z.string().max(80).nullable(),
        recurringRules: z.array(z.string().max(200)).max(10),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { runAnikeAi, buildWeeklyPrompt, AiUnavailableError } = await import("@/lib/ai.server");
    const db = await adminDb();

    const limit = await dailyLimit(db);
    const used = await usedToday(db, context.userId);
    if (used >= limit) throw new Error("ai_daily_limit_reached");

    let result;
    try {
      result = await runAnikeAi(buildWeeklyPrompt(data));
    } catch (e) {
      if (e instanceof AiUnavailableError) throw new Error(e.message);
      throw e;
    }

    const { data: saved, error } = await db
      .from("ai_reviews")
      .insert({ user_id: context.userId, review_type: "WEEKLY_REVIEW", ...result })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return saved;
  });

type HistoryRow = {
  score: number | null;
  result_r: number | null;
  emotional_stop: boolean | null;
  followed_plan: string | null;
  hard_rules: string[] | null;
  setup: string | null;
  status: string | null;
};

function avg(list: number[]) {
  if (list.length === 0) return null;
  return Number((list.reduce((a, b) => a + b, 0) / list.length).toFixed(2));
}

function buildHistory(rows: HistoryRow[]) {
  if (rows.length === 0) return null;
  const closed = rows.filter((r) => r.result_r !== null && r.result_r !== undefined);
  const winners = closed.filter((r) => Number(r.result_r) > 0);
  const losers = closed.filter((r) => Number(r.result_r) < 0);
  const scores = rows.filter((r) => r.score !== null).map((r) => Number(r.score));

  const ruleCount = new Map<string, number>();
  for (const r of rows)
    for (const k of r.hard_rules ?? []) ruleCount.set(k, (ruleCount.get(k) ?? 0) + 1);
  const topRules = [...ruleCount.entries()]
    .filter(([, n]) => n > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k, n]) => `${k} (${n}x)`);

  // Mejor/peor setup: R medio, con nombre oficial y mínimo de 3 operaciones
  // cerradas. Con menos muestras no se afirma nada.
  const perSetup = new Map<string, { sum: number; n: number }>();
  for (const r of closed) {
    const key = r.setup ?? "sin setup";
    const cur = perSetup.get(key) ?? { sum: 0, n: 0 };
    perSetup.set(key, { sum: cur.sum + Number(r.result_r), n: cur.n + 1 });
  }
  const ranked = [...perSetup.entries()]
    .filter(([, v]) => v.n >= 3)
    .map(([k, v]) => ({ key: k, avgR: Number((v.sum / v.n).toFixed(2)), n: v.n }))
    .sort((a, b) => b.avgR - a.avgR);
  const nameOf = (s: { key: string; avgR: number; n: number } | undefined) =>
    s === undefined ? null : `${setupLabel(s.key)} (${s.avgR}R en ${s.n} operaciones)`;

  return {
    sample: rows.length,
    closed: closed.length,
    avgScore: avg(scores),
    winRate:
      closed.length === 0 ? null : Number(((winners.length / closed.length) * 100).toFixed(1)),
    avgR: avg(closed.map((r) => Number(r.result_r))),
    avgScoreWinners: avg(winners.filter((r) => r.score !== null).map((r) => Number(r.score))),
    avgScoreLosers: avg(losers.filter((r) => r.score !== null).map((r) => Number(r.score))),
    impulsive: rows.filter((r) => r.emotional_stop).length,
    offPlan: rows.filter((r) => r.followed_plan === "no").length,
    topRules,
    bestSetup: nameOf(ranked[0]),
    worstSetup: ranked.length > 1 ? nameOf(ranked[ranked.length - 1]) : null,
  };

}
