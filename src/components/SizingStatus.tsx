import { sizingStatus, type RiskMetrics } from "@/lib/scoring";
import { cn } from "@/lib/utils";

/**
 * Etiqueta obligatoria junto a CUALQUIER tamaño de posición mostrado en la app.
 * Deja explícito si el lotaje es exacto, orientativo (no ejecutable) o no disponible.
 */
export function SizingStatus({
  metrics,
  className,
}: {
  metrics: Pick<RiskMetrics, "sizingPrecision" | "sizingMissing">;
  className?: string;
}) {
  const s = sizingStatus(metrics);
  return (
    <div className={cn("space-y-1", className)}>
      <span
        className={cn(
          "inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold tracking-wide",
          s.tone === "ok" && "border-ok/50 bg-ok-soft/30 text-ok",
          s.tone === "warn" && "border-warn/50 bg-warn-soft/30 text-warn",
          s.tone === "none" && "border-border bg-surface text-muted-foreground",
        )}
      >
        LOTAJE {s.label}
      </span>
      <p className="text-[11px] leading-relaxed text-muted-foreground">{s.note}</p>
    </div>
  );
}
