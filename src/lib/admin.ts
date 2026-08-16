import { supabase } from "@/integrations/supabase/client";
import type { AccessPlan, AccountStatus, Profile } from "@/lib/access";

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

/** Marca como EXPIRED las licencias vencidas (la verificación real vive en la base de datos). */
export async function sweepExpired(): Promise<number> {
  const { data, error } = await supabase.rpc("expire_overdue_accounts");
  if (error) throw error;
  return data ?? 0;
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

export async function approveUser(target: string, plan: AccessPlan, days: number | null) {
  const { error } = await supabase.rpc("admin_approve_user", {
    _target: target,
    _plan: plan,
    ...(days === null ? {} : { _days: days }),
  });
  if (error) throw error;
}

export async function rejectUser(target: string, reason: string) {
  const { error } = await supabase.rpc("admin_reject_user", { _target: target, _reason: reason });
  if (error) throw error;
}

export async function suspendUser(target: string, reason: string, revoke = false) {
  const { error } = await supabase.rpc("admin_suspend_user", {
    _target: target,
    _reason: reason,
    _revoke: revoke,
  });
  if (error) throw error;
}

export async function reactivateUser(target: string): Promise<AccountStatus> {
  const { data, error } = await supabase.rpc("admin_reactivate_user", { _target: target });
  if (error) throw error;
  return (data as AccountStatus) ?? "APPROVED";
}

export async function renewUser(target: string, days: number) {
  const { error } = await supabase.rpc("admin_renew_user", { _target: target, _days: days });
  if (error) throw error;
}

export async function changePlan(target: string, plan: AccessPlan, days: number | null) {
  const { error } = await supabase.rpc("admin_change_plan", {
    _target: target,
    _plan: plan,
    ...(days === null ? {} : { _days: days }),
  });
  if (error) throw error;
}
