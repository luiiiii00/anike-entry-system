import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { BookOpen, ChevronDown, ExternalLink, FileText, Trash2, Upload } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useProfile } from "@/hooks/useProfile";
import { cn } from "@/lib/utils";
import {
  LIBRARY_BLOCKS,
  deleteLibraryDoc,
  fetchLibraryDocs,
  formatSize,
  libraryFileUrl,
  uploadLibraryDoc,
  validateLibraryUpload,
  type BlockId,
  type LibraryDoc,
} from "@/lib/library";

export const Route = createFileRoute("/_authenticated/libros")({
  head: () => ({
    meta: [
      { title: "Biblioteca de Trading — ANIKE EJEPIKA" },
      {
        name: "description",
        content:
          "Biblioteca organizada en seis bloques: manual operativo, fundamentos, lectura del precio, indicadores, ejecución y trader.",
      },
      { property: "og:title", content: "Biblioteca de Trading — ANIKE EJEPIKA" },
      {
        property: "og:description",
        content: "Material de estudio en PDF organizado por bloques del sistema ANIKE EJEPIKA.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Libros,
});

function Libros() {
  const { user, isAdmin } = useProfile();
  const [open, setOpen] = useState<BlockId | null>("01");
  const { data: docs } = useQuery({
    queryKey: ["library-docs"],
    queryFn: fetchLibraryDocs,
    enabled: !!user,
  });

  return (
    <AppShell
      title="Biblioteca de Trading"
      subtitle="Seis bloques de estudio para reforzar tu criterio antes de operar."
    >
      {isAdmin && user ? <AdminUpload userId={user.id} /> : null}

      <div className="space-y-3">
        {LIBRARY_BLOCKS.map((block) => {
          const isOpen = open === block.id;
          const extras = (docs ?? []).filter((d) => d.block === block.id);
          const count = block.docs.filter((d) => d.asset).length + extras.length;
          return (
            <section
              key={block.id}
              className="overflow-hidden rounded-xl border border-border bg-surface/60"
            >
              <button
                onClick={() => setOpen(isOpen ? null : block.id)}
                aria-expanded={isOpen}
                className="flex w-full items-center gap-3 p-4 text-left"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-primary">
                  <BookOpen className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-display text-base font-semibold leading-tight">
                    {block.title}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {block.subtitle} · {count} PDF
                  </span>
                </span>
                <ChevronDown
                  className={cn(
                    "h-5 w-5 shrink-0 text-muted-foreground transition-transform",
                    isOpen && "rotate-180",
                  )}
                />
              </button>

              {isOpen ? (
                <div className="border-t border-border p-4">
                  {block.flow ? (
                    <div className="mb-4 flex flex-wrap items-center gap-1.5">
                      {block.flow.map((step, i) => (
                        <span key={step} className="flex items-center gap-1.5">
                          <span className="rounded-lg bg-surface-2 px-2 py-1 text-[11px] tracking-wide">
                            {step}
                          </span>
                          {i < block.flow!.length - 1 ? (
                            <span className="text-[11px] text-muted-foreground">→</span>
                          ) : null}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  <ul className="space-y-2">
                    {block.docs.map((doc) => (
                      <li
                        key={doc.title}
                        className="flex items-center gap-3 rounded-lg border border-border/70 bg-surface-2/50 p-3"
                      >
                        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium leading-tight">{doc.title}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">{doc.description}</p>
                        </div>
                        {doc.asset ? (
                          <a
                            href={doc.asset.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground"
                          >
                            <ExternalLink className="h-3.5 w-3.5" /> Abrir
                          </a>
                        ) : (
                          <span className="shrink-0 text-[11px] text-muted-foreground">
                            Sin material
                          </span>
                        )}
                      </li>
                    ))}

                    {extras.map((doc) => (
                      <UploadedDoc key={doc.id} doc={doc} isAdmin={isAdmin} />
                    ))}
                  </ul>
                </div>
              ) : null}
            </section>
          );
        })}
      </div>

      <p className="mt-6 text-[11px] leading-relaxed text-muted-foreground">
        Material educativo de uso interno. No constituye asesoramiento financiero ni predicción de
        mercado.
      </p>
    </AppShell>
  );
}

function UploadedDoc({ doc, isAdmin }: { doc: LibraryDoc; isAdmin: boolean }) {
  const queryClient = useQueryClient();
  const open = useMutation({
    mutationFn: () => libraryFileUrl(doc.storage_path),
    onSuccess: (url) => window.open(url, "_blank", "noopener"),
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: () => deleteLibraryDoc(doc),
    onSuccess: () => {
      toast.success("Documento eliminado.");
      queryClient.invalidateQueries({ queryKey: ["library-docs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <li className="flex items-center gap-3 rounded-lg border border-border/70 bg-surface-2/50 p-3">
      <FileText className="h-4 w-4 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-tight">{doc.title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {doc.description || "PDF"} · {formatSize(doc.size)}
        </p>
      </div>
      <button
        onClick={() => open.mutate()}
        disabled={open.isPending}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground disabled:opacity-50"
      >
        <ExternalLink className="h-3.5 w-3.5" /> Abrir
      </button>
      {isAdmin ? (
        <button
          onClick={() => remove.mutate()}
          disabled={remove.isPending}
          aria-label="Eliminar documento"
          className="shrink-0 rounded-lg border border-border p-2 text-stop disabled:opacity-50"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </li>
  );
}

function AdminUpload({ userId }: { userId: string }) {
  const queryClient = useQueryClient();
  const [block, setBlock] = useState<BlockId>("02");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [inputKey, setInputKey] = useState(0);
  const [status, setStatus] = useState<
    { kind: "idle" } | { kind: "success"; text: string } | { kind: "error"; text: string }
  >({ kind: "idle" });

  const upload = useMutation({
    mutationFn: () =>
      uploadLibraryDoc({
        userId,
        block,
        title: title.trim(),
        description: description.trim(),
        file: file!,
      }),
    onMutate: () => setStatus({ kind: "idle" }),
    onSuccess: () => {
      const section = LIBRARY_BLOCKS.find((b) => b.id === block)?.title ?? block;
      toast.success("PDF agregado a la biblioteca.");
      setStatus({ kind: "success", text: `«${title.trim()}» agregado a ${section}.` });
      setTitle("");
      setDescription("");
      setFile(null);
      setInputKey((k) => k + 1);
      queryClient.invalidateQueries({ queryKey: ["library-docs"] });
    },
    onError: (e: Error) => {
      toast.error(e.message);
      setStatus({ kind: "error", text: e.message });
    },
  });

  const problem = validateLibraryUpload({ block, title, description, file });
  const fileProblem = file ? validateLibraryUpload({ block, title: "ok", description: "", file }) : null;
  const ready = !problem;

  return (
    <div className="panel mb-4 p-4">
      <p className="label-mono">Subir PDF a Biblioteca (solo admin)</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="label-mono">Bloque</span>
          <select
            value={block}
            onChange={(e) => setBlock(e.target.value as BlockId)}
            className="mt-1.5 min-h-11 w-full rounded-xl border border-input bg-background px-3 text-base"
          >
            {LIBRARY_BLOCKS.map((b) => (
              <option key={b.id} value={b.id}>
                {b.title}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label-mono">Título</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ej: Gestión de riesgo avanzada"
            className="mt-1.5 min-h-11 w-full rounded-xl border border-input bg-background px-3 text-base outline-none focus:border-primary"
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="label-mono">Descripción</span>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Breve descripción del material"
            className="mt-1.5 min-h-11 w-full rounded-xl border border-input bg-background px-3 text-base outline-none focus:border-primary"
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="label-mono">Archivo PDF</span>
          <input
            key={inputKey}
            type="file"
            accept="application/pdf,.pdf"
            disabled={upload.isPending}
            onChange={(e) => {
              setStatus({ kind: "idle" });
              setFile(e.target.files?.[0] ?? null);
            }}
            className="mt-1.5 w-full rounded-xl border border-input bg-background p-2.5 text-sm"
          />
          <span className="mt-1 block text-xs text-muted-foreground">
            {file
              ? fileProblem
                ? fileProblem
                : `Seleccionado: ${file.name} · ${formatSize(file.size)}`
              : "Selecciona un archivo PDF (máx. 30 MB)."}
          </span>
        </label>
      </div>
      {status.kind !== "idle" ? (
        <p
          role="status"
          className={cn("mt-3 text-sm", status.kind === "error" ? "text-stop" : "text-primary")}
        >
          {status.text}
        </p>
      ) : null}
      <button
        onClick={() => upload.mutate()}
        disabled={!ready || upload.isPending}
        className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
      >
        <Upload className="h-4 w-4" /> {upload.isPending ? "Subiendo PDF…" : "Subir PDF a Biblioteca"}
      </button>
    </div>
  );
}
