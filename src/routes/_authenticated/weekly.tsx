import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { AnikeAiPanel } from "@/components/AnikeAi";

import { fetchEvaluations } from "@/lib/db";
import { buildInsights, computeStats } from "@/lib/stats";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/_authenticated/weekly")({
  head: () => ({
    meta: [
      { title: "Weekly Review — ANIKE EJEPIKA" },
      { name: "description", content: "Cierre semanal de tu proceso: métricas, patrones y notas." },
      { property: "og:title", content: "Weekly Review — ANIKE EJEPIKA" },
      { property: "og:description", content: "Cierre semanal de tu proceso operativo." },
    ],
  }),
  component: Weekly,
});

function mondayOf(date: Date) {
  const d = new Date(date);
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  return d.toISOString().slice(0, 10);
}

const NOTE_FIELDS = [
  { id: "good", label: "¿Qué funcionó esta semana?" },
  { id: "bad", label: "¿Qué debo corregir?" },
  { id: "repeat", label: "¿Qué debo repetir?" },
  { id: "avoid", label: "¿Qué debo evitar?" },
];

function Weekly() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const weekStart = mondayOf(new Date());

  const { data } = useQuery({
    queryKey: ["evaluations", user?.id],
    queryFn: fetchEvaluations,
    enabled: !!user,
  });

  const { data: review } = useQuery({
    queryKey: ["weekly", user?.id, weekStart],
    enabled: !!user,
    queryFn: async () => {
      const { data: row, error } = await supabase
        .from("weekly_reviews")
        .select("*")
        .eq("week_start", weekStart)
        .maybeSingle();
      if (error) throw error;
      return row;
    },
  });

  const [notes, setNotes] = useState<Record<string, string>>({});
  useEffect(() => {
    if (review?.notes) setNotes(review.notes as Record<string, string>);
  }, [review]);

  const weekList = useMemo(() => {
    const start = new Date(weekStart).getTime();
    return (data ?? []).filter((e) => new Date(e.trade_date).getTime() >= start);
  }, [data, weekStart]);

  const stats = computeStats(weekList);
  const insights = buildInsights(weekList, stats);

  const topRules = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of weekList) {
      for (const r of e.hard_rules ?? []) counts.set(r, (counts.get(r) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([rule, n]) => `${rule} (${n}x)`);
  }, [weekList]);


  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("weekly_reviews")
        .upsert({ user_id: user!.id, week_start: weekStart, notes }, { onConflict: "user_id,week_start" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Weekly review guardada");
      queryClient.invalidateQueries({ queryKey: ["weekly"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppShell title="Weekly Review" subtitle={`Semana desde ${weekStart}`}>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Item label="Evaluaciones finalizadas" value={stats.total} />
        <Item label="Win rate" value={stats.winRate === null ? "—" : `${stats.winRate}%`} />
        <Item label="Promedio R" value={stats.avgR === null ? "—" : stats.avgR.toFixed(2)} />
        <Item label="Score promedio" value={stats.avgScore ?? "—"} />
        <Item
          label="Mejor setup"
          value={stats.bestSetup ? `${stats.bestSetup} (${stats.bestSetupSample})` : "Muestra insuficiente"}
        />
        <Item
          label="Peor setup"
          value={stats.worstSetup ? `${stats.worstSetup} (${stats.worstSetupSample})` : "Muestra insuficiente"}
        />
        <Item label="Impulsivas" value={stats.impulsive} />
        <Item label="Fuera del plan" value={stats.offPlan} />
      </div>

      <AnikeAiPanel
        variant="weekly"
        getPayload={() => ({
          weekStart,
          total: stats.total,
          winRate: stats.winRate,
          avgR: stats.avgR,
          avgScore: stats.avgScore,
          impulsive: stats.impulsive,
          offPlan: stats.offPlan,
          bestSetup: stats.bestSetup,
          worstSetup: stats.worstSetup,
          recurringRules: topRules,
        })}
      />


      <section className="mt-6">
        <p className="label-mono">Lo que tus operaciones están mostrando</p>
        <div className="mt-3 space-y-2">
          {insights.map((i) => (
            <div key={i} className="panel p-4 text-sm leading-relaxed">
              {i}
            </div>
          ))}
        </div>
      </section>

      <section className="mt-6 space-y-3">
        <p className="label-mono">Notas de la semana</p>
        {NOTE_FIELDS.map((f) => (
          <div key={f.id} className="panel p-4">
            <label className="block">
              <span className="text-sm font-medium">{f.label}</span>
              <textarea
                rows={3}
                maxLength={1000}
                value={notes[f.id] ?? ""}
                onChange={(e) => setNotes((n) => ({ ...n, [f.id]: e.target.value }))}
                className="mt-2 w-full rounded-xl border border-input bg-background p-3 text-base outline-none focus:border-primary"
              />
            </label>
          </div>
        ))}
        <button
          onClick={() => save.mutate()}
          disabled={save.isPending}
          className="min-h-13 w-full rounded-xl bg-primary text-sm font-semibold tracking-wide text-primary-foreground disabled:opacity-50"
        >
          GUARDAR WEEKLY REVIEW
        </button>
      </section>
    </AppShell>
  );
}

function Item({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="panel p-4">
      <p className="label-mono">{label}</p>
      <p className="mt-2 font-display text-xl font-semibold">{value}</p>
    </div>
  );
}
