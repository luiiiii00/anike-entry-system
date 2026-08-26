import type { Option, Question } from "@/lib/checklist";
import { cn } from "@/lib/utils";

/** Tono semáforo del criterio: verde = cumple, ámbar = parcial, rojo = no cumple, neutro = no aplica. */
function toneFor(option: Option, best: number): "ok" | "warn" | "stop" | "neutral" {
  if (option.na) return "neutral";
  if (best <= 0) return "neutral";
  const ratio = option.pts / best;
  if (ratio >= 0.999) return "ok";
  if (ratio <= 0.001) return "stop";
  return "warn";
}

const SELECTED: Record<"ok" | "warn" | "stop" | "neutral", string> = {
  ok: "border-ok/60 bg-ok-soft/40 text-ok shadow-glow-ok",
  warn: "border-warn/60 bg-warn-soft/40 text-warn",
  stop: "border-stop/60 bg-stop-soft/40 text-stop",
  neutral: "border-primary/50 bg-primary/10 text-foreground",
};

const IDLE: Record<"ok" | "warn" | "stop" | "neutral", string> = {
  ok: "border-border bg-surface-2 text-muted-foreground hover:border-ok/40 hover:text-foreground",
  warn: "border-border bg-surface-2 text-muted-foreground hover:border-warn/40 hover:text-foreground",
  stop: "border-border bg-surface-2 text-muted-foreground hover:border-stop/40 hover:text-foreground",
  neutral:
    "border-dashed border-border bg-surface-2 text-muted-foreground hover:border-primary/40 hover:text-foreground",
};

export function QuestionList({
  questions,
  answers,
  onChange,
  groupTitle,
}: {
  questions: Question[];
  answers: Record<string, string>;
  onChange: (id: string, value: string) => void;
  groupTitle?: string | undefined;
}) {
  return (
    <div className="space-y-4">
      {groupTitle && <p className="label-mono">{groupTitle}</p>}
      {questions.map((q) => {
        const best = Math.max(0, ...q.options.filter((o) => !o.na).map((o) => o.pts));
        return (
          <div key={q.id} className="panel p-4">
            <p className="text-sm font-medium leading-snug">{q.label}</p>
            {q.hint && (
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{q.hint}</p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              {q.options.map((o) => {
                const selected = answers[q.id] === o.v;
                const tone = toneFor(o, best);
                return (
                  <button
                    key={o.v}
                    type="button"
                    onClick={() => onChange(q.id, o.v)}
                    className={cn(
                      "min-h-11 rounded-xl border px-4 py-2 text-sm transition-all active:scale-[0.98]",
                      selected ? SELECTED[tone] : IDLE[tone],
                    )}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
            {answers[q.id] &&
              q.options.find((o) => o.v === answers[q.id])?.na && (
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Marcado como no aplica: este criterio se excluye del cálculo, no penaliza.
                </p>
              )}
          </div>
        );
      })}
    </div>
  );
}
