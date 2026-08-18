import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { adminClient, assertAdmin } from "@/lib/admin.server";

const idSchema = z.string().uuid();

export const approvePaymentFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ request: idSchema }).parse(data))
  .handler(async ({ data, context }) => {
    const admin = await assertAdmin(context.supabase, context.userId);
    const db = await adminClient();
    const { data: exp, error } = await db.rpc("admin_approve_payment", {
      _admin: admin,
      _request: data.request,
    });
    if (error) throw new Error(error.message);
    return (exp as string | null) ?? null;
  });

export const rejectPaymentFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({ request: idSchema, reason: z.string().max(500) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const admin = await assertAdmin(context.supabase, context.userId);
    const db = await adminClient();
    const { error } = await db.rpc("admin_reject_payment", {
      _admin: admin,
      _request: data.request,
      _reason: data.reason,
    });
    if (error) throw new Error(error.message);
  });
