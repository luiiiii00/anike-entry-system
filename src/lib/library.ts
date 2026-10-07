import { supabase } from "@/integrations/supabase/client";

import tendencia from "@/assets/libros/1._Tendencia-y-Canal.pdf.json";
import fundamental from "@/assets/libros/2._Analisis-Fundamental.pdf.json";
import cont1 from "@/assets/libros/3._Patrones-de-Continuacion-1.pdf.json";
import cambio1 from "@/assets/libros/5._Patrones-de-Cambio-1.pdf.json";
import graficosCambio from "@/assets/libros/7._Patrones-Graficos-de-Cambio.pdf.json";
import graficosCont from "@/assets/libros/8._Patrones-Graficos-de-Continuidad.pdf.json";
import macd from "@/assets/libros/11._MACD.pdf.json";
import rsi from "@/assets/libros/12._RSI.pdf.json";
import estrategia from "@/assets/libros/Estrategia-ANIKE-EJEPIKA.pdf.json";

export const LIBRARY_BUCKET = "library";

export type BlockId = "01" | "02" | "03" | "04" | "05" | "06";

export type StaticDoc = {
  title: string;
  description: string;
  asset?: { url: string; size: number };
};

export type LibraryBlock = {
  id: BlockId;
  title: string;
  subtitle: string;
  /** Secuencia operativa (solo el bloque 01). */
  flow?: string[];
  docs: StaticDoc[];
};

export const LIBRARY_BLOCKS: LibraryBlock[] = [
  {
    id: "01",
    title: "01 — Manual operativo ANIKE EJEPIKA",
    subtitle: "La secuencia completa del sistema, paso por paso.",
    flow: [
      "Contexto",
      "Sesión",
      "Estructura",
      "Patrón",
      "Fibonacci",
      "Zona",
      "RSI/MACD",
      "Confirmación",
      "Riesgo",
      "Recorrido",
      "Ejecución",
      "Disciplina",
      "Resultado",
      "Aprendizaje",
    ],
    docs: [],
  },
  {
    id: "02",
    title: "02 — Fundamentos",
    subtitle: "Bases de análisis antes de mirar el gráfico de entrada.",
    docs: [
      {
        title: "Análisis Fundamental",
        description: "Bases del análisis fundamental y su impacto en el precio.",
        asset: fundamental,
      },
      {
        title: "Tendencia y Canal",
        description: "Cómo identificar la tendencia dominante y operar dentro de canales.",
        asset: tendencia,
      },
    ],
  },
  {
    id: "03",
    title: "03 — Lectura del precio",
    subtitle: "Patrones, estructura y niveles de retroceso.",
    docs: [
      {
        title: "Patrones de Cambio",
        description: "Formaciones de reversión y cómo anticipar agotamiento.",
        asset: cambio1,
      },
      {
        title: "Patrones de Continuación",
        description: "Formaciones que confirman continuidad de tendencia.",
        asset: cont1,
      },
      {
        title: "Patrones Gráficos",
        description: "Referencia visual de figuras de cambio de tendencia.",
        asset: graficosCambio,
      },
      {
        title: "Patrones Gráficos de Continuidad",
        description: "Referencia visual de las figuras que mantienen la tendencia.",
        asset: graficosCont,
      },
    ],
  },
  {
    id: "04",
    title: "04 — Indicadores",
    subtitle: "Confirmadores, nunca gatillos de entrada.",
    docs: [
      {
        title: "RSI",
        description: "Uso del RSI para medir fuerza, sobrecompra y divergencias.",
        asset: rsi,
      },
      {
        title: "MACD",
        description: "Lectura del MACD, cruces y divergencias aplicadas al proceso.",
        asset: macd,
      },
    ],
  },
  {
    id: "05",
    title: "05 — Ejecución",
    subtitle: "Cómo se opera el sistema en la práctica.",
    docs: [
      {
        title: "Estrategia ANIKE",
        description: "La estrategia completa del sistema: criterios, contexto y ejecución.",
        asset: estrategia,
      },
    ],
  },
  {
    id: "06",
    title: "06 — Trader",
    subtitle: "El factor humano detrás de cada resultado.",
    docs: [],
  },
];

export type LibraryDoc = {
  id: string;
  block: BlockId;
  title: string;
  description: string;
  storage_path: string;
  size: number;
  sort_order: number;
  created_at: string;
};

export async function fetchLibraryDocs(): Promise<LibraryDoc[]> {
  const { data, error } = await supabase
    .from("library_documents")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as LibraryDoc[];
}

export async function libraryFileUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(LIBRARY_BUCKET)
    .createSignedUrl(path, 60 * 30);
  if (error) throw error;
  return data.signedUrl;
}

export const LIBRARY_BLOCK_IDS: BlockId[] = LIBRARY_BLOCKS.map((b) => b.id);
export const LIBRARY_MAX_BYTES = 30 * 1024 * 1024;
export const LIBRARY_TITLE_MIN = 2;
export const LIBRARY_TITLE_MAX = 200;
export const LIBRARY_DESCRIPTION_MAX = 500;

/**
 * Validación previa a la subida. La autoridad final está en el servidor:
 * RLS de `library_documents` + política de Storage (solo admin, solo .pdf,
 * carpeta = sección existente) + restricciones CHECK de la tabla.
 */
export function validateLibraryUpload(input: {
  block: string;
  title: string;
  description: string;
  file: { name: string; type: string; size: number } | null;
}): string | null {
  if (!LIBRARY_BLOCK_IDS.includes(input.block as BlockId)) return "Selecciona una sección válida.";
  const title = input.title.trim();
  if (title.length < LIBRARY_TITLE_MIN) return "El título debe tener al menos 2 caracteres.";
  if (title.length > LIBRARY_TITLE_MAX) return "El título no puede superar 200 caracteres.";
  if (input.description.trim().length > LIBRARY_DESCRIPTION_MAX)
    return "La descripción no puede superar 500 caracteres.";
  const f = input.file;
  if (!f) return "Selecciona un archivo PDF.";
  if (f.type !== "application/pdf" || !/\.pdf$/i.test(f.name))
    return "Solo se permiten archivos PDF.";
  if (f.size <= 0) return "El archivo está vacío.";
  if (f.size > LIBRARY_MAX_BYTES) return "El archivo supera los 30 MB.";
  return null;
}

/** Ruta en Storage: `<sección>/<timestamp>-<nombre-saneado>.pdf`. */
export function libraryStoragePath(block: BlockId, fileName: string, now = Date.now()) {
  const base = fileName.replace(/\.pdf$/i, "").replace(/[^\w.\-]+/g, "_").slice(0, 120) || "documento";
  return `${block}/${now}-${base}.pdf`;
}

/** Comprueba la firma real del archivo (%PDF-), no solo la extensión. */
export async function hasPdfSignature(file: Blob): Promise<boolean> {
  const head = new Uint8Array(await file.slice(0, 5).arrayBuffer());
  return String.fromCharCode(...head) === "%PDF-";
}

export async function uploadLibraryDoc(input: {
  userId: string;
  block: BlockId;
  title: string;
  description: string;
  file: File;
}) {
  const invalid = validateLibraryUpload(input);
  if (invalid) throw new Error(invalid);
  if (!(await hasPdfSignature(input.file)))
    throw new Error("El archivo no es un PDF válido.");
  const path = libraryStoragePath(input.block, input.file.name);
  const up = await supabase.storage
    .from(LIBRARY_BUCKET)
    .upload(path, input.file, { contentType: "application/pdf", upsert: false });
  if (up.error) throw new Error(friendlyLibraryError(up.error.message));
  const { error } = await supabase.from("library_documents").insert({
    block: input.block,
    title: input.title.trim(),
    description: input.description.trim(),
    storage_path: path,
    size: input.file.size,
    created_by: input.userId,
  });
  if (error) {
    // No dejar archivos huérfanos si el registro es rechazado.
    await supabase.storage.from(LIBRARY_BUCKET).remove([path]);
    throw new Error(friendlyLibraryError(error.message));
  }
}

export function friendlyLibraryError(message: string): string {
  if (/row-level security|unauthorized|permission|403/i.test(message))
    return "Solo un administrador puede subir documentos a la Biblioteca.";
  if (/exceeded|too large|413/i.test(message)) return "El archivo supera el tamaño permitido.";
  if (/check constraint/i.test(message)) return "Los datos del documento no son válidos.";
  return "No se pudo subir el PDF. Inténtalo de nuevo.";
}

export async function deleteLibraryDoc(doc: LibraryDoc) {
  const { error } = await supabase.from("library_documents").delete().eq("id", doc.id);
  if (error) throw error;
  await supabase.storage.from(LIBRARY_BUCKET).remove([doc.storage_path]);
}

export function formatSize(bytes: number) {
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}
