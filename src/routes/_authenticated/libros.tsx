import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { BookOpen, ChevronDown, ExternalLink, FileText, Trash2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useProfile } from "@/hooks/useProfile";
import { cn } from "@/lib/utils";
import {
  LIBRARY_BLOCKS,
  deleteLibraryDoc,
  fetchLibraryDocs,
  formatSize,
  libraryFileUrl,
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
