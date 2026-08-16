/**
 * Registro local (en el dispositivo) de eventos de la capa de protección de
 * contenido: atajos bloqueados, pérdida de foco, cambio de app, intentos de
 * impresión y grabación de pantalla. Sirve para auditar después qué pasó y
 * cuándo, sin enviar nada a la red.
 */

export type ProtectionEventType =
  | "shortcut"
  | "print"
  | "blur"
  | "focus"
  | "app-switch"
  | "recording-start"
  | "recording-end"
  | "context-menu";

export type ProtectionEvent = {
  id: string;
  type: ProtectionEventType;
  detail: string;
  at: string; // ISO UTC
};

const STORAGE_KEY = "anike:protection-log";
const MAX_EVENTS = 200;
const MIN_GAP_MS = 700; // evita duplicados/parpadeos consecutivos

let events: ProtectionEvent[] = [];
let loaded = false;
const listeners = new Set<(e: ProtectionEvent[]) => void>();

export const PROTECTION_EVENT_LABEL: Record<ProtectionEventType, string> = {
  shortcut: "Atajo bloqueado",
  print: "Intento de impresión",
  blur: "Ventana sin foco",
  focus: "Foco restaurado",
  "app-switch": "Cambio de app / pestaña",
  "recording-start": "Grabación detectada",
  "recording-end": "Grabación finalizada",
  "context-menu": "Menú contextual bloqueado",
};

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) events = JSON.parse(raw) as ProtectionEvent[];
  } catch {
    events = [];
  }
}

function persist() {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
  } catch {
    /* almacenamiento no disponible: el log sigue en memoria */
  }
}

function emit() {
  const snapshot = events;
  listeners.forEach((fn) => fn(snapshot));
}

export function logProtectionEvent(type: ProtectionEventType, detail: string) {
  if (typeof window === "undefined") return;
  load();
  const now = Date.now();
  const last = events[0];
  if (last && last.type === type && last.detail === detail) {
    if (now - new Date(last.at).getTime() < MIN_GAP_MS) return;
  }
  const event: ProtectionEvent = {
    id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    detail,
    at: new Date(now).toISOString(),
  };
  events = [event, ...events].slice(0, MAX_EVENTS);
  persist();
  emit();
}

export function getProtectionEvents(): ProtectionEvent[] {
  load();
  return events;
}

export function clearProtectionEvents() {
  events = [];
  persist();
  emit();
}

export function subscribeProtectionEvents(fn: (e: ProtectionEvent[]) => void) {
  load();
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function formatProtectionTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
