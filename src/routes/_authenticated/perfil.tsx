import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { LogOut } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { ProtectionLog } from "@/components/ProtectionLog";
import { PaymentHistory } from "@/components/PaymentHistory";
import { useProfile } from "@/hooks/useProfile";
import { formatDate, formatExpiration, PLAN_LABEL } from "@/lib/access";
import { Link } from "@tanstack/react-router";
import { fetchSettings, saveSettings } from "@/lib/db";
import { OFFICIAL_SETUPS } from "@/lib/checklist";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/perfil")({
  head: () => ({
    meta: [
      { title: "Perfil y parámetros — ANIKE EJEPIKA" },
      {
        name: "description",
        content: "Configura tu capital, riesgo máximo, R:R mínimo y setups preferidos.",
      },
      { property: "og:title", content: "Perfil y parámetros — ANIKE EJEPIKA" },
      { property: "og:description", content: "Configura tus parámetros de riesgo y disciplina." },
    ],
  }),
  component: Perfil,
});

function Perfil() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ["settings", user?.id],
    queryFn: () => fetchSettings(user!.id),
    enabled: !!user,
  });

  const [capital, setCapital] = useState("1000");
  const [maxRisk, setMaxRisk] = useState("1");
  const [minRR, setMinRR] = useState("2");
  const [maxTrades, setMaxTrades] = useState("3");
  const [currency, setCurrency] = useState("USD");
  const [setups, setSetups] = useState<string[]>([]);

  useEffect(() => {
    if (!data) return;
    setCapital(String(data.account_capital));
    setMaxRisk(String(data.max_risk_pct));
    setMinRR(String(data.min_rr));
    setMaxTrades(String(data.max_daily_trades));
    setCurrency(data.currency);
    setSetups(data.preferred_setups ?? []);
  }, [data]);

  const save = useMutation({
    mutationFn: () =>
      saveSettings(user!.id, {
        account_capital: Number(capital) || 0,
        max_risk_pct: Number(maxRisk) || 1,
        min_rr: Number(minRR) || 2,
        max_daily_trades: Number(maxTrades) || 3,
        currency,
        preferred_setups: setups,
      }),

    onSuccess: () => {
      toast.success("Parámetros guardados");
      queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppShell title="Perfil" subtitle="Tus parámetros definen los avisos de riesgo y disciplina.">
      <div className="panel p-4">
        <p className="label-mono">Cuenta</p>
        <p className="mt-2 text-sm">{user?.email ?? "—"}</p>
        {profile && (
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="label-mono">Plan actual</dt>
              <dd className="mt-1">{PLAN_LABEL[profile.plan]}</dd>
            </div>
            <div>
              <dt className="label-mono">Inicio</dt>
              <dd className="mt-1">{formatDate(profile.access_start)}</dd>
            </div>
            <div className="col-span-2">
              <dt className="label-mono">Vencimiento</dt>
              <dd className="mt-1 tabular-nums">{formatExpiration(profile)}</dd>
            </div>
          </dl>
        )}
        <Link
          to="/activar"
          className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-primary/60 text-sm font-semibold tracking-wide text-primary"
        >
          {profile?.plan === "LIFETIME" ? "VER PLANES" : "RENOVAR O CAMBIAR PLAN"}
        </Link>
      </div>

      <PaymentHistory />

      <div className="panel mt-4 grid gap-3 p-4 sm:grid-cols-2">
        <Field label="Capital de cuenta" value={capital} onChange={setCapital} type="number" />
        <Field label="Moneda" value={currency} onChange={setCurrency} />
        <Field
          label="Riesgo máximo por operación (%)"
          value={maxRisk}
          onChange={setMaxRisk}
          type="number"
        />
        <Field label="R:R mínimo aceptable" value={minRR} onChange={setMinRR} type="number" />
        <Field
          label="Máximo de operaciones por día"
          value={maxTrades}
          onChange={setMaxTrades}
          type="number"
        />
      </div>

      <div className="panel mt-4 p-4">
        <p className="label-mono">Setups preferidos</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Los cinco setups oficiales de ANIKE EJEPIKA.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {OFFICIAL_SETUPS.map((s) => {
            const on = setups.includes(s.id);
            return (
              <button
                key={s.id}
                onClick={() => setSetups((p) => (on ? p.filter((x) => x !== s.id) : [...p, s.id]))}
                className={cn(
                  "min-h-11 rounded-xl border px-3 text-sm",
                  on
                    ? "border-primary bg-primary/15"
                    : "border-border bg-surface-2 text-muted-foreground",
                )}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      </div>



      <ProtectionLog />

      <button
        onClick={() => save.mutate()}
        disabled={save.isPending}
        className="mt-4 min-h-13 w-full rounded-xl bg-primary text-sm font-semibold tracking-wide text-primary-foreground disabled:opacity-50"
      >
        GUARDAR PARÁMETROS
      </button>

      <button
        onClick={async () => {
          await supabase.auth.signOut();
          window.location.href = "/";
        }}
        className="mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-border bg-surface text-sm text-muted-foreground"
      >
        <LogOut className="h-4 w-4" /> Cerrar sesión
      </button>
    </AppShell>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="label-mono">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 min-h-11 w-full rounded-xl border border-input bg-background px-3 text-base outline-none focus:border-primary"
      />
    </label>
  );
}
