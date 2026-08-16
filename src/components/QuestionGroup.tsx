import type { Question } from "@/lib/checklist";
import { cn } from "@/lib/utils";

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
      {questions.map((q) => (
        <div key={q.id} className="panel p-4">
          <p className="text-sm font-medium leading-snug">{q.label}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {q.options.map((o) => {
              const selected = answers[q.id] === o.v;
              return (
                <button
                  key={o.v}
                  type="button"
                  onClick={() => onChange(q.id, o.v)}
                  className={cn(
                    "min-h-11 rounded-xl border px-4 py-2 text-sm transition-all active:scale-[0.98]",
                    selected
                      ? "border-primary bg-primary/15 text-foreground shadow-glow-ok"
                      : "border-border bg-surface-2 text-muted-foreground hover:border-primary/40 hover:text-foreground",
                  )}
                >
                  {o.label}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
