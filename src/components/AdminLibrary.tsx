import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Upload } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import {
  LIBRARY_BLOCKS,
  formatSize,
  uploadLibraryDoc,
  validateLibraryUpload,
  type BlockId,
} from "@/lib/library";

/** Admin > Biblioteca: único formulario de subida de PDF (reutiliza src/lib/library.ts). */
export function AdminLibrary() {
  const { user } = useAuth();
  const userId = user?.id ?? "";
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
    <section className="panel mt-6 p-4 sm:p-5" aria-label="Admin > Biblioteca">
      <p className="label-mono">Admin &gt; Biblioteca</p>
      <h2 className="mt-1 font-display text-lg font-semibold">Subir PDF a Biblioteca</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="label-mono">Sección</span>
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
        disabled={!ready || !userId || upload.isPending}
        className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
      >
        <Upload className="h-4 w-4" /> {upload.isPending ? "Subiendo PDF…" : "Subir PDF a Biblioteca"}
      </button>
    </section>
  );
}
