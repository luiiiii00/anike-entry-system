import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type PaymentPlan = Database["public"]["Tables"]["payment_plans"]["Row"];
export type PaymentSettings = Database["public"]["Tables"]["payment_settings"]["Row"];
export type PaymentRequest = Database["public"]["Tables"]["payment_requests"]["Row"];
export type PaymentStatus = "PENDING" | "APPROVED" | "REJECTED";

export const RECEIPTS_BUCKET = "payment-receipts";

export const PAYMENT_STATUS_LABEL: Record<string, string> = {
  PENDING: "PENDIENTE",
  APPROVED: "APROBADO",
  REJECTED: "RECHAZADO",
};

export const PAYMENT_STATUS_BADGE: Record<string, string> = {
  PENDING: "bg-warn/15 text-warn border-warn/30",
  APPROVED: "bg-ok/15 text-ok border-ok/30",
  REJECTED: "bg-danger/15 text-danger border-danger/30",
};

export const METHOD_LABEL: Record<string, string> = {
  BANK_TRANSFER: "Transferencia",
};

export const REJECTION_REASONS = [
  "Monto incorrecto.",
  "Comprobante ilegible.",
  "Transferencia no encontrada.",
  "Plan incorrecto.",
  "Otro.",
] as const;

/** Formato guaraní: 50.000 Gs */
export function formatGs(amount: number): string {
  return `${new Intl.NumberFormat("es-PY").format(amount)} Gs`;
}

export function planDurationLabel(plan: Pick<PaymentPlan, "duration_days" | "access_plan">): string {
  if (plan.access_plan === "LIFETIME" || !plan.duration_days) return "De por vida";
  return `${plan.duration_days} días de acceso`;
}

export async function fetchPlans(): Promise<PaymentPlan[]> {
  const { data, error } = await supabase
    .from("payment_plans")
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function fetchPaymentSettings(): Promise<PaymentSettings | null> {
  const { data, error } = await supabase.from("payment_settings").select("*").maybeSingle();
  if (error) throw error;
  return data;
}

export async function savePaymentSettings(patch: Partial<PaymentSettings>) {
  const { error } = await supabase.from("payment_settings").update(patch).eq("id", true);
  if (error) throw error;
}

export async function savePlan(key: string, patch: Partial<PaymentPlan>) {
  const { error } = await supabase.from("payment_plans").update(patch).eq("key", key);
  if (error) throw error;
}

/** Cupos reales de la promoción de lanzamiento (solo pagos aprobados). */
export async function fetchPromoStatus(): Promise<{ taken: number; total: number }> {
  const { data, error } = await supabase.rpc("launch_promo_status");
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return { taken: row?.taken ?? 0, total: row?.total ?? 0 };
}

export async function fetchMyPaymentRequests(): Promise<PaymentRequest[]> {
  const { data, error } = await supabase
    .from("payment_requests")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function fetchAllPaymentRequests(): Promise<PaymentRequest[]> {
  const { data, error } = await supabase
    .from("payment_requests")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  return data ?? [];
}

/** El servidor fija el precio oficial: el cliente solo envía la clave del plan. */
export async function createPaymentRequest(planKey: string, notes?: string): Promise<string> {
  const { data, error } = await supabase.rpc("create_payment_request", {
    _plan_key: planKey,
    ...(notes ? { _notes: notes } : {}),
  });
  if (error) throw error;
  return data as unknown as string;
}

export async function cancelMyPaymentRequest(id: string) {
  const { error } = await supabase.rpc("cancel_my_payment_request", { _request: id });
  if (error) throw error;
}

const ALLOWED = ["image/jpeg", "image/jpg", "image/png", "application/pdf"];

export async function uploadReceipt(userId: string, requestId: string, file: File) {
  if (!ALLOWED.includes(file.type)) throw new Error("Formato no permitido. Usa JPG, PNG o PDF.");
  if (file.size > 8 * 1024 * 1024) throw new Error("El archivo supera los 8 MB.");
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
  const path = `${userId}/${requestId}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage
    .from(RECEIPTS_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw error;
  const { error: linkError } = await supabase.rpc("attach_payment_receipt", {
    _request: requestId,
    _path: path,
  });
  if (linkError) throw linkError;
  return path;
}

/** URL temporal firmada para ver el comprobante (bucket privado). */
export async function signedReceiptUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(RECEIPTS_BUCKET)
    .createSignedUrl(path, 60 * 10);
  if (error) throw error;
  return data.signedUrl;
}

export function paymentError(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error ?? "");
  if (msg.includes("payment_pending_exists"))
    return "Ya tienes una solicitud pendiente. Espera la verificación o cancélala.";
  if (msg.includes("promo_sold_out")) return "La promoción de lanzamiento está agotada.";
  if (msg.includes("invalid_plan")) return "El plan seleccionado no está disponible.";
  if (msg.includes("request_already_reviewed")) return "Esta solicitud ya fue revisada.";
  if (msg.includes("request_not_editable")) return "La solicitud ya no puede modificarse.";
  if (msg.includes("not_authorized")) return "No tienes permisos para esta acción.";
  return msg || "No fue posible completar la operación.";
}
