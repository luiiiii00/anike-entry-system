import type { Light } from "@/lib/scoring";
import { cn } from "@/lib/utils";

const STYLES: Record<Light, { border: string; text: string; bg: string; dot: string }> = {
  ok: { border: "border-ok/40", text: "text-ok", bg: "bg-ok-soft/40", dot: "bg-ok" },
  warn: { border: "border-warn/40", text: "text-warn", bg: "bg-warn-soft/40", dot: "bg-warn" },
  stop: { border: "border-stop/40", text: "text-stop", bg: "bg-stop-soft/40", dot: "bg-stop" },
};

export function TrafficLight({
  light,
  classification,
  message,
}: {
  light: Light;
  classification: string;
  message: string;
}) {
  const s = STYLES[light];
  return (
    <div className={cn("animate-rise rounded-2xl border p-5", s.border, s.bg)}>
      <div className="flex items-center gap-4">
        <div className="flex flex-col gap-1.5 rounded-full bg-background/60 p-2 ring-1 ring-border">
          {(["ok", "warn", "stop"] as Light[]).map((l) => (
            <span
              key={l}
              className={cn(
                "h-3.5 w-3.5 rounded-full transition-opacity",
                STYLES[l].dot,
                l === light ? "opacity-100" : "opacity-15",
              )}
              style={l === light ? { boxShadow: `0 0 14px -2px ${STYLES[l].dot}` } : undefined}
            />
          ))}
        </div>
        <div>
          <p className={cn("font-display text-2xl font-semibold", s.text)}>{classification}</p>
          <p className="mt-1 text-sm text-muted-foreground">{message}</p>
        </div>
      </div>
    </div>
  );
}

export function lightFor(classification: string | null | undefined): Light {
  if (classification === "SETUP A+" || classification === "SETUP A") return "ok";
  if (classification === "SETUP B") return "warn";
  return "stop";
}
