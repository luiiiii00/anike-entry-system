import { supabase } from "@/integrations/supabase/client";
import type { AccessPlan, AccountStatus, Profile } from "@/lib/access";
import {
  approveUserFn,
  changePlanFn,
  reactivateUserFn,
  rejectUserFn,
  renewUserFn,
  suspendUserFn,
  sweepExpiredFn,
} from "@/lib/admin.functions";

export type AuditEntry = {
  id: string;
  admin_user_id: string;
  target_user_id: string;
  action: string;
  details: Record<string, unknown> | null;
  created_at: string;
};

export const ACTION_LABEL: Record<string, string> = {
  APPROVE_USER: "Usuario aprobado",
  REJECT_USER: "Solicitud rechazada",
  SUSPEND_USER: "Cuenta suspendida",
  REVOKE_ACCESS: "Acceso revocado",
  REACTIVATE_USER: "Cuenta reactivada",
  RENEW_USER: "Licencia renovada",
  CHANGE_PLAN: "Plan modificado",
};

/** Marca como EXPIRED las licencias vencidas (se ejecuta en el servidor). */
export async function sweepExpired(): Promise<number> {
  return await sweepExpiredFn();
}

export async function fetchAllProfiles(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function fetchAuditLog(targetUserId?: string): Promise<AuditEntry[]> {
  let query = supabase
    .from("admin_audit_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  if (targetUserId) query = query.eq("target_user_id", targetUserId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as AuditEntry[];
}

type ActivePlan = "PRO" | "LIFETIME";

function activePlan(plan: AccessPlan): ActivePlan {
  return plan === "LIFETIME" ? "LIFETIME" : "PRO";
}

export async function approveUser(target: string, plan: AccessPlan, days: number | null) {
  await approveUserFn({ data: { target, plan: activePlan(plan), days } });
}

export async function rejectUser(target: string, reason: string) {
  await rejectUserFn({ data: { target, reason } });
}

export async function suspendUser(target: string, reason: string, revoke = false) {
  await suspendUserFn({ data: { target, reason, revoke } });
}

export async function reactivateUser(target: string): Promise<AccountStatus> {
  const result = await reactivateUserFn({ data: { target } });
  return (result as AccountStatus) ?? "APPROVED";
}

export async function renewUser(target: string, days: number) {
  await renewUserFn({ data: { target, days } });
}

export async function changePlan(target: string, plan: AccessPlan, days: number | null) {
  await changePlanFn({ data: { target, plan: activePlan(plan), days } });
}
