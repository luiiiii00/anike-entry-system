import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Plus, RotateCcw, Save, Trash2, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Wordmark } from "@/components/brand";
import { ContentProtection } from "@/components/ContentProtection";
import {
  ADDED_GROUP_TITLE,
  EDITABLE_SECTION_IDS,
  EMPTY_OVERLAY,
  OFFICIAL_SETUPS,
  SECTION_BY_ID,
  buildChecklistCatalog,
  checklistOverlayIssues,
  type ChecklistOverlay,
  type OfficialSetupId,
  type OverlayOption,
  type SectionId,
} from "@/lib/checklist";
import {
  discardDraftOverlay,
  fetchOverlayRow,
  publishOverlay,
  saveDraftOverlay,
} from "@/lib/checklist-overlay";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin-preguntas")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/login", replace: true });
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
      { title: "Editor de preguntas — ANIKE EJEPIKA" },
      {
        name: "description",
        content: "Editor de preguntas, opciones y factores de cada setup oficial.",
      },
      { property: "og:title", content: "Editor de preguntas — ANIKE EJEPIKA" },
      { property: "og:description", content: "Edición del cuestionario por setup." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: QuestionEditor,
});

const FACTORS = [1, 0.75, 0.5, 0.25, 0];
const FACTOR_LABEL: Record<string, string> = {
  "1": "1,00 · Excelente",
  "0.75": "0,75 · Fuerte",
  "0.5": "0,50 · Parcial",
  "0.25": "0,25 · Débil",
  "0": "0,00 · Ausente",
};

const DEFAULT_OPTIONS: OverlayOption[] = [
  { v: "excelente", label: "Totalmente confirmado", pts: 1 },
  { v: "fuerte", label: "Favorable", pts: 0.75 },
  { v: "parcial", label: "Parcial", pts: 0.5 },
  { v: "debil", label: "Débil o dudoso", pts: 0.25 },
  { v: "ausente", label: "Ausente o incorrecto", pts: 0 },
];

function slug(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 34);
}

function QuestionEditor() {
  const [overlay, setOverlay] = useState<ChecklistOverlay>(EMPTY_OVERLAY);
  const [setup, setSetup] = useState<OfficialSetupId>("REVERSION");
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [userId, setUserId] = useState<string>("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? ""));
  }, []);

  const loaded = useQuery({
    queryKey: ["checklist-overlay", "editor"],
    queryFn: async () => {
      const draft = await fetchOverlayRow("DRAFT");
      const published = await fetchOverlayRow("PUBLISHED");
      return { draft, published };
    },
    staleTime: 0,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    const d = loaded.data;
    if (!d) return;
    setOverlay(d.draft?.overlay ?? d.published?.overlay ?? EMPTY_OVERLAY);
    setDirty(false);
  }, [loaded.data]);

  const catalog = useMemo(() => buildChecklistCatalog(overlay), [overlay]);
  const issues = useMemo(() => checklistOverlayIssues(overlay), [overlay]);

  const questions = catalog.setupQuestions[setup];
  const bySection = useMemo(() => {
    const map = new Map<SectionId, typeof questions>();
    for (const q of questions) {
      const list = map.get(q.sectionId) ?? [];
      list.push(q);
      map.set(q.sectionId, list);
    }
    return map;
  }, [questions]);

  const addedIds = new Set(overlay.added.map((q) => q.id));

  function mutate(next: ChecklistOverlay) {
    setOverlay(next);
    setDirty(true);
  }

  function editQuestion(id: string, patch: { label?: string; hint?: string }) {
    const current = overlay.edits[id] ?? {};
    mutate({ ...overlay, edits: { ...overlay.edits, [id]: { ...current, ...patch } } });
  }

  function editAdded(id: string, patch: { label?: string; hint?: string }) {
    mutate({
      ...overlay,
      added: overlay.added.map((q) => (q.id === id ? { ...q, ...patch } : q)),
    });
  }

  function setOptions(id: string, options: OverlayOption[]) {
    if (addedIds.has(id)) {
      mutate({
        ...overlay,
        added: overlay.added.map((q) => (q.id === id ? { ...q, options } : q)),
      });
      return;
    }
    const current = overlay.edits[id] ?? {};
    mutate({ ...overlay, edits: { ...overlay.edits, [id]: { ...current, options } } });
  }

  function removeQuestion(id: string) {
    if (addedIds.has(id)) {
      mutate({ ...overlay, added: overlay.added.filter((q) => q.id !== id) });
      return;
    }
    mutate({ ...overlay, disabled: [...new Set([...overlay.disabled, id])] });
  }

  function restoreQuestion(id: string) {
    mutate({ ...overlay, disabled: overlay.disabled.filter((x) => x !== id) });
  }

  function resetQuestion(id: string) {
    const edits = { ...overlay.edits };
    delete edits[id];
    mutate({ ...overlay, edits });
  }

  function addQuestion(sectionId: SectionId, owner: OfficialSetupId | "COMMON", label: string) {
    const clean = label.trim();
    if (!clean) {
      toast.error("Escribe el enunciado de la pregunta.");
      return;
    }
    const base = `x_${slug(clean) || "criterio"}`;
    let id = base;
    let n = 2;
    const taken = new Set([
      ...overlay.added.map((q) => q.id),
      ...catalog.sections.flatMap((s) => s.groups.flatMap((g) => g.questions.map((q) => q.id))),
    ]);
    while (taken.has(id)) id = `${base}_${n++}`;
    mutate({
      ...overlay,
      added: [
        ...overlay.added,
        { id, sectionId, owner, label: clean, options: DEFAULT_OPTIONS.map((o) => ({ ...o })) },
      ],
    });
    toast.success("Pregunta añadida al borrador.");
  }

  async function onSaveDraft() {
    setBusy(true);
    try {
      await saveDraftOverlay(overlay, userId);
      setDirty(false);
      toast.success("Borrador guardado. Los usuarios siguen viendo la versión publicada.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar el borrador.");
    } finally {
      setBusy(false);
    }
  }

  async function onPublish() {
    if (issues.length > 0) {
      toast.error("Corrige los avisos antes de publicar.");
      return;
    }
    setBusy(true);
    try {
      await publishOverlay(overlay, userId);
      setDirty(false);
      toast.success("Cuestionario publicado: las evaluaciones nuevas ya lo usan.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo publicar.");
    } finally {
      setBusy(false);
    }
  }

  async function onDiscard() {
    setBusy(true);
    try {
      const restored = await discardDraftOverlay(userId);
      setOverlay(restored);
      setDirty(false);
      toast.success("Borrador descartado.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo descartar el borrador.");
    } finally {
      setBusy(false);
    }
  }

  const removedInSetup = overlay.disabled;

  return (
    <div className="min-h-screen bg-background">
      <ContentProtection />
      <header className="sticky top-0 z-10 border-b border-border bg-background/90 px-4 py-4 backdrop-blur sm:px-6">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-3">
          <Wordmark compact />
          <div className="min-w-0">
            <h1 className="font-display text-lg font-semibold">Editor de preguntas</h1>
            <p className="text-xs text-muted-foreground">
              Enunciados, opciones y factores de cada setup. Guarda como borrador y publica cuando
              esté listo.
            </p>
          </div>
          <Link
            to="/admin"
            className="ml-auto inline-flex min-h-10 items-center gap-2 rounded-xl border border-border bg-surface px-3 text-sm"
          >
            <ArrowLeft className="h-4 w-4" /> Panel
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-4 pb-40 pt-5 sm:px-6">
        {loaded.isLoading ? (
          <p className="text-sm text-muted-foreground">Cargando cuestionario...</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {OFFICIAL_SETUPS.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSetup(s.id)}
                  className={cn(
                    "min-h-11 rounded-xl border px-4 text-sm transition-colors",
                    setup === s.id
                      ? "border-primary/60 bg-primary/10 text-foreground"
                      : "border-border bg-surface-2 text-muted-foreground",
                  )}
                >
                  {s.code} · {s.name}
                </button>
              ))}
            </div>

            <p className="mt-3 text-sm text-muted-foreground">
              {questions.length} preguntas activas en este setup.
            </p>

            {issues.length > 0 && (
              <div className="panel mt-4 border-stop/50 bg-stop-soft/30 p-4">
                <p className="label-mono text-stop">Avisos que impiden publicar</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                  {issues.map((i) => (
                    <li key={i}>{i}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-6 space-y-8">
              {EDITABLE_SECTION_IDS.map((sectionId) => {
                const list = bySection.get(sectionId) ?? [];
                const section = SECTION_BY_ID[sectionId];
                return (
                  <section key={sectionId}>
                    <p className="label-mono">
                      {section.step} {section.title} · peso {section.weight}
                    </p>
                    <div className="mt-3 space-y-4">
                      {list.map((q) => (
                        <QuestionCard
                          key={q.id}
                          id={q.id}
                          label={q.label}
                          hint={q.hint ?? ""}
                          options={q.options.map((o) => ({
                            v: o.v,
                            label: o.label,
                            pts: o.pts,
                          }))}
                          custom={addedIds.has(q.id)}
                          edited={overlay.edits[q.id] !== undefined}
                          onLabel={(value) =>
                            addedIds.has(q.id)
                              ? editAdded(q.id, { label: value })
                              : editQuestion(q.id, { label: value })
                          }
                          onHint={(value) =>
                            addedIds.has(q.id)
                              ? editAdded(q.id, { hint: value })
                              : editQuestion(q.id, { hint: value })
                          }
                          onOptions={(options) => setOptions(q.id, options)}
                          onRemove={() => removeQuestion(q.id)}
                          onReset={() => resetQuestion(q.id)}
                        />
                      ))}
                      <AddQuestion
                        sectionId={sectionId}
                        setup={setup}
                        onAdd={(owner, label) => addQuestion(sectionId, owner, label)}
                      />
                    </div>
                  </section>
                );
              })}
            </div>

            {removedInSetup.length > 0 && (
              <div className="panel mt-8 p-4">
                <p className="label-mono">Preguntas retiradas del cuestionario</p>
                <ul className="mt-2 space-y-2 text-sm">
                  {removedInSetup.map((id) => (
                    <li key={id} className="flex items-center gap-3">
                      <span className="font-mono text-xs text-muted-foreground">{id}</span>
                      <button
                        onClick={() => restoreQuestion(id)}
                        className="ml-auto inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs"
                      >
                        <RotateCcw className="h-3.5 w-3.5" /> Restaurar
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </main>

      <div className="fixed bottom-0 left-0 right-0 border-t border-border bg-surface/95 px-4 py-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] backdrop-blur sm:px-6">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-3">
          <p className="text-xs text-muted-foreground">
            {dirty ? "Cambios sin guardar" : "Sin cambios pendientes"}
          </p>
          <button
            onClick={onDiscard}
            disabled={busy}
            className="ml-auto inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-surface px-3 text-sm disabled:opacity-60"
          >
            <Trash2 className="h-4 w-4" /> Descartar borrador
          </button>
          <button
            onClick={onSaveDraft}
            disabled={busy}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-surface-2 px-3 text-sm disabled:opacity-60"
          >
            <Save className="h-4 w-4" /> Guardar borrador
          </button>
          <button
            onClick={onPublish}
            disabled={busy || issues.length > 0}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            <Upload className="h-4 w-4" /> Publicar
          </button>
        </div>
      </div>
    </div>
  );
}

function QuestionCard({
  id,
  label,
  hint,
  options,
  custom,
  edited,
  onLabel,
  onHint,
  onOptions,
  onRemove,
  onReset,
}: {
  id: string;
  label: string;
  hint: string;
  options: OverlayOption[];
  custom: boolean;
  edited: boolean;
  onLabel: (v: string) => void;
  onHint: (v: string) => void;
  onOptions: (o: OverlayOption[]) => void;
  onRemove: () => void;
  onReset: () => void;
}) {
  return (
    <div className="panel p-4">
      <div className="flex items-center gap-2">
        <span className="font-mono text-[11px] text-muted-foreground">{id}</span>
        {custom && (
          <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[11px] text-primary">
            {ADDED_GROUP_TITLE}
          </span>
        )}
        {!custom && edited && (
          <button onClick={onReset} className="text-[11px] text-muted-foreground underline">
            Volver al texto original
          </button>
        )}
        <button
          onClick={onRemove}
          className="ml-auto inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs"
        >
          <Trash2 className="h-3.5 w-3.5" /> Quitar
        </button>
      </div>

      <label className="mt-3 block">
        <span className="label-mono">Enunciado</span>
        <textarea
          value={label}
          rows={2}
          onChange={(e) => onLabel(e.target.value)}
          className="mt-1.5 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        />
      </label>

      <label className="mt-3 block">
        <span className="label-mono">Ayuda (opcional)</span>
        <input
          value={hint}
          onChange={(e) => onHint(e.target.value)}
          className="mt-1.5 min-h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-primary"
        />
      </label>

      <p className="label-mono mt-4">Opciones y factores</p>
      <div className="mt-2 space-y-2">
        {options.map((o, i) => (
          <div key={`${o.v}-${i}`} className="flex flex-wrap items-center gap-2">
            <input
              value={o.label}
              onChange={(e) =>
                onOptions(options.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))
              }
              className="min-h-11 flex-1 rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-primary"
            />
            <select
              value={String(o.pts)}
              onChange={(e) =>
                onOptions(
                  options.map((x, j) => (j === i ? { ...x, pts: Number(e.target.value) } : x)),
                )
              }
              className="min-h-11 rounded-xl border border-input bg-background px-2 text-sm"
            >
              {FACTORS.map((f) => (
                <option key={f} value={String(f)}>
                  {FACTOR_LABEL[String(f)]}
                </option>
              ))}
            </select>
            <button
              onClick={() => onOptions(options.filter((_, j) => j !== i))}
              disabled={options.length <= 2}
              className="inline-flex min-h-11 items-center rounded-xl border border-border px-2.5 text-xs disabled:opacity-40"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        <button
          onClick={() =>
            onOptions([
              ...options,
              { v: `op_${options.length + 1}`, label: "Nueva opción", pts: 0.5 },
            ])
          }
          className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-dashed border-border px-3 text-xs text-muted-foreground"
        >
          <Plus className="h-3.5 w-3.5" /> Añadir opción
        </button>
      </div>
    </div>
  );
}

function AddQuestion({
  sectionId,
  setup,
  onAdd,
}: {
  sectionId: SectionId;
  setup: OfficialSetupId;
  onAdd: (owner: OfficialSetupId | "COMMON", label: string) => void;
}) {
  const [label, setLabel] = useState("");
  const [owner, setOwner] = useState<OfficialSetupId | "COMMON">(setup);

  useEffect(() => setOwner(setup), [setup]);

  return (
    <div className="panel border-dashed p-4">
      <p className="label-mono">Añadir pregunta a {SECTION_BY_ID[sectionId].title}</p>
      <textarea
        value={label}
        rows={2}
        placeholder="Escribe el enunciado de la pregunta nueva"
        onChange={(e) => setLabel(e.target.value)}
        className="mt-2 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <select
          value={owner}
          onChange={(e) => setOwner(e.target.value as OfficialSetupId | "COMMON")}
          className="min-h-11 rounded-xl border border-input bg-background px-2 text-sm"
        >
          <option value={setup}>Sólo este setup</option>
          <option value="COMMON">Todos los setups</option>
        </select>
        <button
          onClick={() => {
            onAdd(owner, label);
            setLabel("");
          }}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-surface-2 px-3 text-sm"
        >
          <Plus className="h-4 w-4" /> Añadir
        </button>
        <p className="text-xs text-muted-foreground">
          Se crea con los cinco factores oficiales (1,00 / 0,75 / 0,50 / 0,25 / 0,00).
        </p>
      </div>
    </div>
  );
}
