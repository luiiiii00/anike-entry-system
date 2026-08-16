import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { adminClient, assertAdmin } from "@/lib/admin.server";

const planSchema = z.enum(["PRO", "LIFETIME"]);
const targetSchema = z.string().uuid();
const daysSchema = z.number().int().positive().max(3650).nullable();

export const approveUserFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({ target: targetSchema, plan: planSchema, days: daysSchema }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const admin = await assertAdmin(context.supabase, context.userId);
    const db = await adminClient();
    const { error } = await db.rpc("admin_approve_user", {
      _admin: admin,
      _target: data.target,
      _plan: data.plan,
      ...(data.days === null ? {} : { _days: data.days }),
    });
    if (error) throw new Error(error.message);
  });

export const rejectUserFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({ target: targetSchema, reason: z.string().max(500) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const admin = await assertAdmin(context.supabase, context.userId);
    const db = await adminClient();
    const { error } = await db.rpc("admin_reject_user", {
      _admin: admin,
      _target: data.target,
      _reason: data.reason,
    });
    if (error) throw new Error(error.message);
  });

export const suspendUserFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({ target: targetSchema, reason: z.string().max(500), revoke: z.boolean() })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const admin = await assertAdmin(context.supabase, context.userId);
    const db = await adminClient();
    const { error } = await db.rpc("admin_suspend_user", {
      _admin: admin,
      _target: data.target,
      _reason: data.reason,
      _revoke: data.revoke,
    });
    if (error) throw new Error(error.message);
  });

export const reactivateUserFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ target: targetSchema }).parse(data))
  .handler(async ({ data, context }) => {
    const admin = await assertAdmin(context.supabase, context.userId);
    const db = await adminClient();
    const { data: result, error } = await db.rpc("admin_reactivate_user", {
      _admin: admin,
      _target: data.target,
    });
    if (error) throw new Error(error.message);
    return (result as string) ?? "APPROVED";
  });

export const renewUserFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({ target: targetSchema, days: z.number().int().positive().max(3650) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const admin = await assertAdmin(context.supabase, context.userId);
    const db = await adminClient();
    const { error } = await db.rpc("admin_renew_user", {
      _admin: admin,
      _target: data.target,
      _days: data.days,
    });
    if (error) throw new Error(error.message);
  });

export const changePlanFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({ target: targetSchema, plan: planSchema, days: daysSchema }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const admin = await assertAdmin(context.supabase, context.userId);
    const db = await adminClient();
    const { error } = await db.rpc("admin_change_plan", {
      _admin: admin,
      _target: data.target,
      _plan: data.plan,
      ...(data.days === null ? {} : { _days: data.days }),
    });
    if (error) throw new Error(error.message);
  });

export const sweepExpiredFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const db = await adminClient();
    const { data, error } = await db.rpc("expire_overdue_accounts");
    if (error) throw new Error(error.message);
    return data ?? 0;
  });
