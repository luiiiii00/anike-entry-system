import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bot } from "lucide-react";
import { toast } from "sonner";
import { aiUsageFn, setAiLimitFn } from "@/lib/ai.functions";

export function AdminAiSettings() {
  const usage = useServerFn(aiUsageFn);
  const setLimit = useServerFn(setAiLimitFn);
  const queryClient = useQueryClient();
  const [value, setValue] = useState("5");

  const current = useQuery({
    queryKey: ["ai-usage", "admin"],
    queryFn: () => usage({ data: undefined }),
  });

  useEffect(() => {
    if (current.data) setValue(String(current.data.limit));
  }, [current.data]);

  const save = useMutation({
    mutationFn: async () => setLimit({ data: { limit: Number(value) } }),
    onSuccess: () => {
      toast.success("Límite diario de ANIKE IA actualizado");
      queryClient.invalidateQueries({ queryKey: ["ai-usage"] });
    },
    onError: () => toast.error("No fue posible actualizar el límite"),
  });

  return (
    <section className="panel mt-6 p-5">
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl border border-primary/40 bg-primary/10">
          <Bot className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h2 className="font-display text-lg font-semibold">ANIKE IA</h2>
          <p className="text-xs text-muted-foreground">
            Análisis educativos por usuario y por día.
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="label-mono">Límite diario por usuario</span>
          <input
            type="number"
            min={0}
            max={200}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="mt-1.5 min-h-11 w-32 rounded-xl border border-input bg-background px-3 text-base outline-none focus:border-primary"
          />
        </label>
        <button
          onClick={() => save.mutate()}
          disabled={save.isPending || !value}
          className="min-h-11 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {save.isPending ? "Guardando…" : "GUARDAR"}
        </button>
      </div>
    </section>
  );
}
