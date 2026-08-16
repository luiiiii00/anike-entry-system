import { useEffect, useState } from "react";
import { ShieldCheck, Trash2 } from "lucide-react";
import {
  PROTECTION_EVENT_LABEL,
  clearProtectionEvents,
  formatProtectionTime,
  getProtectionEvents,
  subscribeProtectionEvents,
  type ProtectionEvent,
} from "@/lib/protection-log";

/** Panel de auditoría de la capa de protección de contenido. */
export function ProtectionLog() {
  const [events, setEvents] = useState<ProtectionEvent[]>([]);

  useEffect(() => {
    setEvents(getProtectionEvents());
    return subscribeProtectionEvents((next) => setEvents([...next]));
  }, []);

  return (
    <section className="panel mt-4 p-4" data-testid="protection-log">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="label-mono">Registro de protección</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Eventos guardados solo en este dispositivo ({events.length}).
          </p>
        </div>
        <button
          onClick={clearProtectionEvents}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2.5 text-xs text-muted-foreground"
        >
          <Trash2 className="h-3.5 w-3.5" /> Limpiar
        </button>
      </div>

      {events.length === 0 ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
          <ShieldCheck className="h-4 w-4 text-ok" /> Sin eventos registrados.
        </p>
      ) : (
        <ul className="mt-3 max-h-72 divide-y divide-border overflow-y-auto">
          {events.map((e) => (
            <li key={e.id} className="flex items-start justify-between gap-3 py-2 text-sm">
              <span className="min-w-0">
                <span className="block font-medium">{PROTECTION_EVENT_LABEL[e.type]}</span>
                <span className="block text-xs text-muted-foreground">{e.detail}</span>
              </span>
              <time className="shrink-0 font-mono text-[11px] text-muted-foreground">
                {formatProtectionTime(e.at)}
              </time>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
