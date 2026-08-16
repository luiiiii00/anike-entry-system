import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  CheckCircle2,
  Clock,
  LayoutDashboard,
  LogOut,
  RefreshCw,
  Search,
  ShieldOff,
  TimerOff,
  Users,
  X,
  XCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Wordmark } from "@/components/brand";
import { friendlyAuthError } from "@/lib/auth-errors";
import {
  effectiveStatus,
  formatDate,
  formatDateTime,
  formatExpiration,
  timeRemaining,
  timeZoneLabel,
  PLAN_LABEL,
  STATUS_BADGE,
  STATUS_LABEL,
  type AccessPlan,
  type AccountStatus,
  type Profile,
} from "@/lib/access";
import {
  ACTION_LABEL,
  approveUser,
  changePlan,
  fetchAllProfiles,
  fetchAuditLog,
  reactivateUser,
  rejectUser,
  renewUser,
  suspendUser,
  sweepExpired,
} from "@/lib/admin";
import { useNow } from "@/hooks/useNow";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/login", replace: true });
    // El rol vive en la base de datos; si no es admin, no existe el panel para él.
    const { data: role } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!role) throw redirect({ to: "/estado", replace: true });
    return { user: data.user };
  },
  head: () => ({
    meta: [
      { title: "Panel de administración — ANIKE EJEPIKA" },
      { name: "description", content: "Gestión de solicitudes, licencias y acceso de usuarios." },
      { property: "og:title", content: "Panel de administración — ANIKE EJEPIKA" },
      { property: "og:description", content: "Gestión de accesos y licencias." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminPanel,
});

type Filter = "ALL" | AccountStatus;
type Modal =
  | { kind: "approve"; user: Profile }
  | { kind: "reject"; user: Profile }
  | { kind: "suspend"; user: Profile; revoke: boolean }
  | { kind: "renew"; user: Profile }
  | { kind: "plan"; user: Profile }
  | { kind: "detail"; user: Profile }
  | null;

const DURATIONS = [1, 7, 30];
const PLAN_ACTIONS = ["APPROVE_USER", "RENEW_USER", "CHANGE_PLAN"];

function AdminPanel() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter>("PENDING");
  const [planFilter, setPlanFilter] = useState<"ALL" | AccessPlan>("ALL");
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<Modal>(null);
  const now = useNow(15_000);

  const users = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      await sweepExpired().catch(() => 0);
      return fetchAllProfiles();
    },
  });

  const rows = users.data ?? [];

  const counts = useMemo(() => {
    const base: Record<AccountStatus, number> = {
      PENDING: 0,
      APPROVED: 0,
      REJECTED: 0,
      SUSPENDED: 0,
      EXPIRED: 0,
    };
    for (const u of rows) base[effectiveStatus(u)] += 1;
    return base;
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((u) => {
      if (filter !== "ALL" && effectiveStatus(u) !== filter) return false;
      if (planFilter !== "ALL" && u.plan !== planFilter) return false;
      if (!q) return true;
      return (
        (u.full_name ?? u.display_name ?? "").toLowerCase().includes(q) ||
        (u.email ?? "").toLowerCase().includes(q)
      );
    });
  }, [rows, filter, planFilter, search]);

  const people = useMemo(() => {
    const map: Record<string, string> = {};
    for (const u of rows) map[u.id] = u.full_name ?? u.display_name ?? u.email ?? u.id.slice(0, 8);
    return map;
  }, [rows]);

  const act = useMutation({
    mutationFn: async (fn: () => Promise<unknown>) => fn(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      queryClient.invalidateQueries({ queryKey: ["admin-audit"] });
      setModal(null);
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    router.navigate({ to: "/login", replace: true });
  }

  return (
    <div className="min-h-screen bg-background">
      <ContentProtection />
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-60 flex-col border-r border-border bg-surface/60 p-5 lg:flex">
        <Wordmark />
        <p className="label-mono mt-6">Administración</p>
        <nav className="mt-3 flex flex-1 flex-col gap-1 text-sm">
          {(
            [
              ["ALL", "Todos los usuarios", Users],
              ["PENDING", "Solicitudes pendientes", Clock],
              ["APPROVED", "Usuarios activos", CheckCircle2],
              ["SUSPENDED", "Suspendidos", ShieldOff],
              ["REJECTED", "Rechazados", XCircle],
              ["EXPIRED", "Expirados", TimerOff],
            ] as const
          ).map(([key, label, Icon]) => (
            <button
              key={key}
              onClick={() => setFilter(key as Filter)}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
                filter === key
                  ? "bg-primary/12 text-primary"
                  : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" /> <span className="truncate">{label}</span>
              {key !== "ALL" && (
                <span className="ml-auto text-xs tabular-nums">
                  {counts[key as AccountStatus]}
                </span>
              )}
            </button>
          ))}
        </nav>
        <button
          onClick={() => router.navigate({ to: "/dashboard" })}
          className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
        >
          <LayoutDashboard className="h-4 w-4" /> Ir a la app
        </button>
        <button
          onClick={signOut}
          className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
        >
          <LogOut className="h-4 w-4" /> Salir
        </button>
      </aside>

      <div className="lg:pl-60">
        <header className="grid-noise sticky top-0 z-10 border-b border-border bg-background/85 px-4 py-4 backdrop-blur-md sm:px-6">
          <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="label-mono">Panel administrador</p>
              <h1 className="font-display text-xl font-semibold sm:text-2xl">Control de acceso</h1>
            </div>
            <button
              onClick={() => users.refetch()}
              className="flex min-h-11 items-center gap-2 rounded-xl border border-border bg-surface-2 px-4 text-sm font-medium transition-colors hover:bg-surface"
            >
              <RefreshCw className={cn("h-4 w-4", users.isFetching && "animate-spin")} /> Actualizar
            </button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <SummaryCard label="Usuarios" value={rows.length} />
            <SummaryCard label="Pendientes" value={counts.PENDING} tone="text-warn" />
            <SummaryCard label="Aprobados" value={counts.APPROVED} tone="text-ok" />
            <SummaryCard label="Suspendidos" value={counts.SUSPENDED} />
            <SummaryCard label="Rechazados" value={counts.REJECTED} tone="text-danger" />
            <SummaryCard label="Expirados" value={counts.EXPIRED} tone="text-orange-400" />
          </section>

          <section className="panel mt-6 p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar por nombre o email"
                  className="min-h-11 w-full rounded-xl border border-input bg-background pl-9 pr-3 text-sm outline-none focus:border-primary"
                />
              </div>
              <select
                value={planFilter}
                onChange={(e) => setPlanFilter(e.target.value as "ALL" | AccessPlan)}
                className="min-h-11 rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-primary"
              >
                <option value="ALL">Todos los planes</option>
                <option value="NONE">Sin plan</option>
                <option value="PRO">PRO</option>
                <option value="LIFETIME">LIFETIME</option>
              </select>
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value as Filter)}
                className="min-h-11 rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-primary lg:hidden"
              >
                <option value="ALL">Todos</option>
                <option value="PENDING">Pendientes</option>
                <option value="APPROVED">Aprobados</option>
                <option value="REJECTED">Rechazados</option>
                <option value="SUSPENDED">Suspendidos</option>
                <option value="EXPIRED">Expirados</option>
              </select>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    {["Nombre", "Email", "Solicitud", "Estado", "Plan", "Vence", "Acciones"].map(
                      (h) => (
                        <th key={h} className="label-mono pb-3 pr-3 font-normal">
                          {h}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((u) => {
                    const status = effectiveStatus(u);
                    return (
                      <tr key={u.id} className="border-b border-border/60">
                        <td className="py-3 pr-3">
                          <button
                            onClick={() => setModal({ kind: "detail", user: u })}
                            className="text-left font-medium hover:text-primary"
                          >
                            {u.full_name ?? u.display_name ?? "—"}
                          </button>
                        </td>
                        <td className="py-3 pr-3 text-muted-foreground">{u.email ?? "—"}</td>
                        <td className="py-3 pr-3 text-muted-foreground">{formatDate(u.created_at)}</td>
                        <td className="py-3 pr-3">
                          <StatusBadge status={status} />
                        </td>
                        <td className="py-3 pr-3">{PLAN_LABEL[u.plan]}</td>
                        <td className="py-3 pr-3 text-muted-foreground">
                          <span className="tabular-nums">{formatExpiration(u)}</span>
                          {u.plan === "PRO" && u.access_expiration && (
                            <span className="block text-xs tabular-nums text-muted-foreground/80">
                              restan {timeRemaining(u, now)}
                            </span>
                          )}
                        </td>
                        <td className="py-3">
                          <div className="flex flex-wrap gap-1.5">
                            {status === "PENDING" && (
                              <>
                                <RowBtn tone="ok" onClick={() => setModal({ kind: "approve", user: u })}>
                                  APROBAR
                                </RowBtn>
                                <RowBtn tone="danger" onClick={() => setModal({ kind: "reject", user: u })}>
                                  RECHAZAR
                                </RowBtn>
                              </>
                            )}
                            {(status === "APPROVED" || status === "EXPIRED") && (
                              <>
                                <RowBtn onClick={() => setModal({ kind: "detail", user: u })}>VER</RowBtn>
                                {u.plan === "PRO" && (
                                  <RowBtn onClick={() => setModal({ kind: "renew", user: u })}>
                                    RENOVAR
                                  </RowBtn>
                                )}
                                <RowBtn onClick={() => setModal({ kind: "plan", user: u })}>PLAN</RowBtn>
                                <RowBtn
                                  onClick={() => setModal({ kind: "suspend", user: u, revoke: false })}
                                >
                                  SUSPENDER
                                </RowBtn>
                                <RowBtn
                                  tone="danger"
                                  onClick={() => setModal({ kind: "suspend", user: u, revoke: true })}
                                >
                                  REVOCAR
                                </RowBtn>
                              </>
                            )}
                            {status === "SUSPENDED" && (
                              <RowBtn
                                tone="ok"
                                onClick={() =>
                                  act.mutate(async () => {
                                    const result = await reactivateUser(u.id);
                                    toast.success(
                                      result === "EXPIRED"
                                        ? "Reactivado, pero la licencia está vencida."
                                        : "Usuario reactivado.",
                                    );
                                  })
                                }
                              >
                                REACTIVAR
                              </RowBtn>
                            )}
                            {status === "REJECTED" && (
                              <RowBtn tone="ok" onClick={() => setModal({ kind: "approve", user: u })}>
                                APROBAR
                              </RowBtn>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-10 text-center text-muted-foreground">
                        {users.isLoading ? "Cargando…" : "Sin usuarios en esta vista."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </main>
      </div>

      {modal && (
        <ModalHost
          modal={modal}
          people={people}
          busy={act.isPending}
          onClose={() => setModal(null)}
          run={(fn) => act.mutate(fn)}
        />
      )}
    </div>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="panel p-4">
      <p className="label-mono">{label}</p>
      <p className={cn("mt-1 font-display text-2xl font-semibold tabular-nums", tone)}>{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: AccountStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-wide",
        STATUS_BADGE[status],
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

function RowBtn({
  children,
  onClick,
  tone,
}: {
  children: React.ReactNode;
  onClick: () => void;
  tone?: "ok" | "danger";
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold tracking-wide transition-colors",
        tone === "ok" && "border-ok/40 text-ok hover:bg-ok/10",
        tone === "danger" && "border-danger/40 text-danger hover:bg-danger/10",
        !tone && "border-border text-muted-foreground hover:bg-surface-2 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function ModalHost({
  modal,
  people,
  busy,
  onClose,
  run,
}: {
  modal: NonNullable<Modal>;
  people: Record<string, string>;
  busy: boolean;
  onClose: () => void;
  run: (fn: () => Promise<unknown>) => void;
}) {
  const user = modal.user;
  const [plan, setPlan] = useState<AccessPlan>(user.plan === "LIFETIME" ? "LIFETIME" : "PRO");
  const [days, setDays] = useState(30);
  const [reason, setReason] = useState("");

  const name = user.full_name ?? user.display_name ?? user.email ?? "usuario";

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/70 p-4 sm:items-center">
      <div className="panel max-h-[90vh] w-full max-w-lg overflow-y-auto p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="label-mono">{name}</p>
            <h2 className="font-display text-xl font-semibold">
              {modal.kind === "approve" && "Aprobar acceso"}
              {modal.kind === "reject" && "Rechazar solicitud"}
              {modal.kind === "suspend" && (modal.revoke ? "Revocar acceso" : "Suspender acceso")}
              {modal.kind === "renew" && "Renovar licencia"}
              {modal.kind === "plan" && "Cambiar plan"}
              {modal.kind === "detail" && "Detalle de usuario"}
            </h2>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="text-muted-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        {modal.kind === "approve" && (
          <div className="mt-5 space-y-4">
            <p className="text-sm text-muted-foreground">
              ¿Quieres aprobar el acceso de este usuario?
            </p>
            <PlanPicker plan={plan} setPlan={setPlan} />
            {plan === "PRO" && <DaysPicker days={days} setDays={setDays} />}
            <Confirm
              busy={busy}
              label="APROBAR"
              onConfirm={() =>
                run(async () => {
                  await approveUser(user.id, plan, plan === "PRO" ? days : null);
                  toast.success("Usuario aprobado correctamente.");
                })
              }
            />
          </div>
        )}

        {modal.kind === "reject" && (
          <div className="mt-5 space-y-4">
            <p className="text-sm text-muted-foreground">¿Quieres rechazar esta solicitud?</p>
            <ReasonField
              value={reason}
              onChange={setReason}
              placeholder="Motivo del rechazo (opcional)"
            />
            <Confirm
              busy={busy}
              tone="danger"
              label="RECHAZAR"
              onConfirm={() =>
                run(async () => {
                  await rejectUser(user.id, reason);
                  toast.success("Solicitud rechazada.");
                })
              }
            />
          </div>
        )}

        {modal.kind === "suspend" && (
          <div className="mt-5 space-y-4">
            <p className="text-sm text-muted-foreground">
              {modal.revoke
                ? "Esta acción eliminará el acceso del usuario al sistema."
                : "¿Quieres suspender el acceso de este usuario?"}
            </p>
            <ReasonField
              value={reason}
              onChange={setReason}
              placeholder={modal.revoke ? "Motivo de la revocación" : "Motivo de suspensión"}
            />
            <Confirm
              busy={busy}
              tone="danger"
              label={modal.revoke ? "REVOCAR ACCESO" : "SUSPENDER"}
              onConfirm={() =>
                run(async () => {
                  await suspendUser(user.id, reason, modal.revoke);
                  toast.success(modal.revoke ? "Acceso revocado." : "Usuario suspendido.");
                })
              }
            />
          </div>
        )}

        {modal.kind === "renew" && (
          <div className="mt-5 space-y-4">
            <p className="text-sm text-muted-foreground">
              Vencimiento actual: <span className="tabular-nums">{formatExpiration(user)}</span>.
              Si ya venció, el nuevo período empieza en este momento; si no, se suma al tiempo
              restante ({timeRemaining(user)}).
            </p>
            <DaysPicker days={days} setDays={setDays} />
            <Confirm
              busy={busy}
              label="RENOVAR"
              onConfirm={() =>
                run(async () => {
                  await renewUser(user.id, days);
                  toast.success("Licencia renovada.");
                })
              }
            />
          </div>
        )}

        {modal.kind === "plan" && (
          <div className="mt-5 space-y-4">
            <PlanPicker plan={plan} setPlan={setPlan} />
            {plan === "PRO" && <DaysPicker days={days} setDays={setDays} />}
            <Confirm
              busy={busy}
              label="GUARDAR PLAN"
              onConfirm={() =>
                run(async () => {
                  await changePlan(user.id, plan, plan === "PRO" ? days : null);
                  toast.success("Plan actualizado.");
                })
              }
            />
          </div>
        )}

        {modal.kind === "detail" && <UserDetail user={user} people={people} />}
      </div>
    </div>
  );
}

function PlanPicker({ plan, setPlan }: { plan: AccessPlan; setPlan: (p: AccessPlan) => void }) {
  return (
    <div>
      <p className="label-mono">Plan</p>
      <div className="mt-2 flex gap-2">
        {(["PRO", "LIFETIME"] as const).map((p) => (
          <button
            key={p}
            onClick={() => setPlan(p)}
            className={cn(
              "min-h-11 flex-1 rounded-xl border text-sm font-semibold tracking-wide transition-colors",
              plan === p
                ? "border-primary bg-primary/12 text-primary"
                : "border-border bg-surface-2 text-muted-foreground",
            )}
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}

function DaysPicker({
  days,
  setDays,
  options = DURATIONS,
}: {
  days: number;
  setDays: (d: number) => void;
  options?: number[];
}) {
  return (
    <div>
      <p className="label-mono">Duración</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((d) => (
          <button
            key={d}
            onClick={() => setDays(d)}
            className={cn(
              "min-h-10 rounded-xl border px-3 text-sm transition-colors",
              days === d
                ? "border-primary bg-primary/12 text-primary"
                : "border-border bg-surface-2 text-muted-foreground",
            )}
          >
            {d} días
          </button>
        ))}
      </div>
    </div>
  );
}

function ReasonField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={3}
      maxLength={500}
      className="w-full rounded-xl border border-input bg-background p-3 text-sm outline-none focus:border-primary"
    />
  );
}

function Confirm({
  busy,
  label,
  onConfirm,
  tone,
}: {
  busy: boolean;
  label: string;
  onConfirm: () => void;
  tone?: "danger";
}) {
  return (
    <button
      disabled={busy}
      onClick={onConfirm}
      className={cn(
        "min-h-12 w-full rounded-xl text-sm font-semibold tracking-wide transition-transform active:scale-[0.99] disabled:opacity-60",
        tone === "danger"
          ? "bg-danger text-white"
          : "bg-primary text-primary-foreground",
      )}
    >
      {busy ? "PROCESANDO..." : label}
    </button>
  );
}

function UserDetail({ user, people }: { user: Profile; people: Record<string, string> }) {
  const now = useNow(15_000);
  const audit = useQuery({
    queryKey: ["admin-audit", user.id],
    queryFn: () => fetchAuditLog(user.id),
  });

  const status = effectiveStatus(user);

  return (
    <div className="mt-5 space-y-5">
      <div className="flex items-center gap-2">
        <StatusBadge status={status} />
        <span className="text-sm text-muted-foreground">{PLAN_LABEL[user.plan]}</span>
      </div>
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <Detail label="Email" value={user.email ?? "—"} />
        <Detail label="Registro" value={formatDate(user.created_at)} />
        <Detail label="Aprobación" value={formatDateTime(user.approved_at)} />
        <Detail label="Inicio de acceso" value={formatDateTime(user.access_start)} />
        <Detail label="Último acceso" value={formatDateTime(user.last_seen_at)} />
      </dl>
      <div className="rounded-xl border border-border bg-surface-2 p-4">
        <p className="label-mono">Vencimiento exacto</p>
        <p className="mt-1 font-display text-lg tabular-nums">{formatExpiration(user)}</p>
        <p className="mt-1 text-xs text-muted-foreground tabular-nums">
          Tiempo restante: {timeRemaining(user, now)} · Zona horaria: {timeZoneLabel()}
        </p>
      </div>
      {user.rejection_reason && <Detail label="Motivo de rechazo" value={user.rejection_reason} />}
      {user.suspension_reason && (
        <Detail label="Motivo de suspensión" value={user.suspension_reason} />
      )}

      <div>
        <p className="label-mono">Historial de plan</p>
        <ul className="mt-2 space-y-2">
          {(audit.data ?? [])
            .filter((e) => PLAN_ACTIONS.includes(e.action))
            .map((entry) => {
              const d = (entry.details ?? {}) as Record<string, unknown>;
              const plan = d["plan"] ? String(d["plan"]) : null;
              const days = d["days"] ? Number(d["days"]) : null;
              const expiration = d["new_expiration"] ?? d["expiration"];
              return (
                <li
                  key={entry.id}
                  className="rounded-xl border border-border bg-surface-2 p-3 text-sm"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="font-medium">{ACTION_LABEL[entry.action] ?? entry.action}</p>
                    <p className="label-mono tabular-nums">{formatDateTime(entry.created_at)}</p>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {[
                      plan ? `Plan: ${plan}` : null,
                      days ? `Duración: ${days} día${days === 1 ? "" : "s"}` : null,
                      expiration
                        ? `Vence: ${formatDateTime(String(expiration))}`
                        : plan === "LIFETIME"
                          ? "Vence: nunca"
                          : null,
                      `Admin: ${people[entry.admin_user_id] ?? entry.admin_user_id.slice(0, 8)}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </li>
              );
            })}
          {(audit.data ?? []).filter((e) => PLAN_ACTIONS.includes(e.action)).length === 0 && (
            <li className="text-sm text-muted-foreground">
              {audit.isLoading ? "Cargando…" : "Sin cambios de plan registrados."}
            </li>
          )}
        </ul>
      </div>

      <div>
        <p className="label-mono">Historial administrativo</p>
        <ul className="mt-2 space-y-2">
          {(audit.data ?? []).map((entry) => (
            <li key={entry.id} className="rounded-xl border border-border bg-surface-2 p-3 text-sm">
              <p className="label-mono">{formatDateTime(entry.created_at)}</p>
              <p className="mt-0.5">
                {ACTION_LABEL[entry.action] ?? entry.action}
                <span className="text-muted-foreground">
                  {" "}· {people[entry.admin_user_id] ?? entry.admin_user_id.slice(0, 8)}
                </span>
              </p>
              {entry.details && Object.keys(entry.details).length > 0 && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {Object.entries(entry.details)
                    .filter(([, v]) => v !== null && v !== "")
                    .map(([k, v]) => `${k}: ${String(v)}`)
                    .join(" · ")}
                </p>
              )}
            </li>
          ))}
          {(audit.data ?? []).length === 0 && (
            <li className="text-sm text-muted-foreground">
              {audit.isLoading ? "Cargando…" : "Sin acciones registradas."}
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="label-mono">{label}</dt>
      <dd className="mt-0.5">{value}</dd>
    </div>
  );
}
