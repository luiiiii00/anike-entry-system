import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const idSchema = z.string().uuid();

const reviewTypeSchema = z.enum(["PRE_TRADE", "NO_TRADE", "POST_TRADE", "WEEKLY_REVIEW"]);

async function adminDb() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function dailyLimit(db: Awaited<ReturnType<typeof adminDb>>) {
  const { data } = await db.from("ai_settings").select("ai_daily_limit").eq("id", true).maybeSingle();
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
    const {
      runAnikeAi,
      buildEvaluationPrompt,
      AiUnavailableError,
    } = await import("@/lib/ai.server");
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

    const isNoTrade = row.classification === "NO TRADE" || row.decision === "no_trade";
    const hasResult = row.result_r !== null && row.result_r !== undefined;
    const reviewType =
      data.reviewType ?? (hasResult ? "POST_TRADE" : isNoTrade ? "NO_TRADE" : "PRE_TRADE");

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
        result_r: row.result_r,
        followed_plan: row.followed_plan,
        answers: row.answers as Record<string, unknown> | null,
        risk: row.risk as Record<string, unknown> | null,
        breakdown: row.breakdown as Record<string, { earned?: number; weight?: number }> | null,
        review: row.review as Record<string, string> | null,
        notes: row.notes,
      },
      reviewType,
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
