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

export const promoStatusFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const db = await adminClient();
    const { data, error } = await db.rpc("launch_promo_status");
    if (error) throw new Error(error.message);
    const row = Array.isArray(data) ? data[0] : data;
    return { taken: row?.taken ?? 0, total: row?.total ?? 0 };
  });

export const createPaymentRequestFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({ planKey: z.string().min(1).max(40), notes: z.string().max(500).optional() })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const db = await adminClient();
    const { data: id, error } = await db.rpc("create_payment_request", {
      _user: context.userId,
      _plan_key: data.planKey,
      ...(data.notes ? { _notes: data.notes } : {}),
    });
    if (error) throw new Error(error.message);
    return id as unknown as string;
  });

export const cancelPaymentRequestFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ request: idSchema }).parse(data))
  .handler(async ({ data, context }) => {
    const db = await adminClient();
    const { error } = await db.rpc("cancel_my_payment_request", {
      _user: context.userId,
      _request: data.request,
    });
    if (error) throw new Error(error.message);
  });

export const attachReceiptFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({ request: idSchema, path: z.string().min(1).max(300) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const db = await adminClient();
    const { error } = await db.rpc("attach_payment_receipt", {
      _user: context.userId,
      _request: data.request,
      _path: data.path,
    });
    if (error) throw new Error(error.message);
  });
