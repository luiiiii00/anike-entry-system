import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import {
  applyChecklistOverlay,
  EMPTY_OVERLAY,
  normalizeOverlay,
  type ChecklistOverlay,
} from "@/lib/checklist";
import { supabase } from "@/integrations/supabase/client";

/**
 * Acceso a la capa de edición del cuestionario (editor de administración).
 * Existen como máximo dos versiones: `DRAFT` (borrador, sólo la ve administración)
 * y `PUBLISHED` (la que usan las evaluaciones nuevas y el recálculo del servidor).
 */
export type OverlayStatus = "DRAFT" | "PUBLISHED";

export type OverlayRow = {
  status: OverlayStatus;
  overlay: ChecklistOverlay;
  updated_at: string;
};

type Client = SupabaseClient<Database>;

export async function fetchOverlayRow(
  status: OverlayStatus,
  client: Client = supabase as unknown as Client,
): Promise<OverlayRow | null> {
  const { data, error } = await client
    .from("checklist_overlays")
    .select("status, overlay, updated_at")
    .eq("status", status)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return {
    status: data.status as OverlayStatus,
    overlay: normalizeOverlay(data.overlay),
    updated_at: data.updated_at,
  };
}

/** Capa publicada (o `null` si nunca se publicó nada: se usa el cuestionario base). */
export async function fetchPublishedOverlay(
  client: Client = supabase as unknown as Client,
): Promise<ChecklistOverlay | null> {
  const row = await fetchOverlayRow("PUBLISHED", client);
  return row?.overlay ?? null;
}

/** Carga la capa publicada y la activa en el proceso actual (cliente o servidor). */
export async function loadAndApplyPublishedOverlay(client?: Client): Promise<void> {
  const overlay = await fetchPublishedOverlay(client);
  applyChecklistOverlay(overlay);
}

async function upsertOverlay(status: OverlayStatus, overlay: ChecklistOverlay, userId: string) {
  const { error } = await supabase.from("checklist_overlays").upsert(
    {
      status,
      overlay: overlay as unknown as Json,
      updated_by: userId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "status" },
  );
  if (error) throw new Error(error.message);
}

export async function saveDraftOverlay(overlay: ChecklistOverlay, userId: string) {
  await upsertOverlay("DRAFT", overlay, userId);
}

/** Publica el borrador: a partir de aquí las evaluaciones nuevas lo usan. */
export async function publishOverlay(overlay: ChecklistOverlay, userId: string) {
  await upsertOverlay("PUBLISHED", overlay, userId);
  await upsertOverlay("DRAFT", overlay, userId);
}

/** Descarta el borrador y vuelve a la versión publicada (o al cuestionario base). */
export async function discardDraftOverlay(userId: string) {
  const published = await fetchPublishedOverlay();
  await upsertOverlay("DRAFT", published ?? EMPTY_OVERLAY, userId);
  return published ?? EMPTY_OVERLAY;
}
