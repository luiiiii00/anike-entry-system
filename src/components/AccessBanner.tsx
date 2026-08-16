import { AlertTriangle } from "lucide-react";
import { daysLeft, formatExpiration, timeRemaining } from "@/lib/access";
import { useProfile } from "@/hooks/useProfile";
import { useNow } from "@/hooks/useNow";
import { cn } from "@/lib/utils";

export function AccessBanner() {
  const { profile } = useProfile();
  const now = useNow(15_000);
  if (!profile || profile.status !== "APPROVED") return null;

  const left = daysLeft(profile);
  if (left === null || left > 7) return null;

  const critical = left <= 3;
  return (
    <div
      className={cn(
        "mb-5 flex items-start gap-3 rounded-xl border p-4 text-sm",
        critical
          ? "border-danger/40 bg-danger/10 text-danger"
          : "border-warn/40 bg-warn/10 text-warn",
      )}
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <p>
        Tu acceso vence el {formatExpiration(profile)} · restan {timeRemaining(profile, now)}.
        Contacta con el administrador para renovar tu licencia.
      </p>
    </div>
  );
}
