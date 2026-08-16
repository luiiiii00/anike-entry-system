import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type AccountStatus = Database["public"]["Enums"]["account_status"];
export type AccessPlan = Database["public"]["Enums"]["access_plan"];
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];

export const STATUS_LABEL: Record<AccountStatus, string> = {
  PENDING: "PENDIENTE",
  APPROVED: "APROBADO",
  REJECTED: "RECHAZADO",
  SUSPENDED: "SUSPENDIDO",
  EXPIRED: "EXPIRADO",
};

/** Colores de badge por estado (amarillo/verde/rojo/gris/naranja). */
export const STATUS_BADGE: Record<AccountStatus, string> = {
  PENDING: "bg-warn/15 text-warn border-warn/30",
  APPROVED: "bg-ok/15 text-ok border-ok/30",
  REJECTED: "bg-danger/15 text-danger border-danger/30",
  SUSPENDED: "bg-muted text-muted-foreground border-border",
  EXPIRED: "bg-orange-500/15 text-orange-400 border-orange-500/30",
};

export const PLAN_LABEL: Record<AccessPlan, string> = {
  NONE: "SIN PLAN",
  PRO: "PRO",
  LIFETIME: "LIFETIME",
};

export function daysLeft(profile: Pick<Profile, "access_expiration" | "plan">): number | null {
  if (profile.plan === "LIFETIME" || !profile.access_expiration) return null;
  const ms = new Date(profile.access_expiration).getTime() - Date.now();
  return Math.ceil(ms / 86_400_000);
}

/** Estado efectivo: si la licencia venció, la cuenta está expirada aunque diga APPROVED. */
export function effectiveStatus(profile: Pick<Profile, "status" | "plan" | "access_expiration">): AccountStatus {
  if (
    profile.status === "APPROVED" &&
    profile.plan !== "LIFETIME" &&
    profile.access_expiration &&
    new Date(profile.access_expiration).getTime() <= Date.now()
  ) {
    return "EXPIRED";
  }
  return profile.status;
}

export function hasActiveAccess(profile: Pick<Profile, "status" | "plan" | "access_expiration"> | null): boolean {
  return !!profile && effectiveStatus(profile) === "APPROVED";
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export async function fetchMyProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function amIAdmin(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) return false;
  return !!data;
}
