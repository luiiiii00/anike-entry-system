import { createFileRoute } from "@tanstack/react-router";
import { BookOpen, ExternalLink } from "lucide-react";
import { AppShell } from "@/components/AppShell";

import tendencia from "@/assets/libros/1._Tendencia-y-Canal.pdf.json";
import fundamental from "@/assets/libros/2._Analisis-Fundamental.pdf.json";
import cont1 from "@/assets/libros/3._Patrones-de-Continuacion-1.pdf.json";
import cont2 from "@/assets/libros/4._Patrones-de-Continuacion-2.pdf.json";
import cambio1 from "@/assets/libros/5._Patrones-de-Cambio-1.pdf.json";
import cambio2 from "@/assets/libros/6._Patrones-de-Cambio-2.pdf.json";
import graficosCambio from "@/assets/libros/7._Patrones-Graficos-de-Cambio.pdf.json";
import graficosCont from "@/assets/libros/8._Patrones-Graficos-de-Continuidad.pdf.json";
import macd from "@/assets/libros/11._MACD.pdf.json";
import rsi from "@/assets/libros/12._RSI.pdf.json";

export const Route = createFileRoute("/_authenticated/libros")({
  head: () => ({
    meta: [
      { title: "Libros de Trading — ANIKE EJEPIKA" },
      {
        name: "description",
        content:
          "Biblioteca de material de estudio: tendencia, patrones de continuación y cambio, MACD y RSI.",
      },
      { property: "og:title", content: "Libros de Trading — ANIKE EJEPIKA" },
      {
        property: "og:description",
        content: "Material de estudio en PDF para reforzar tu proceso de análisis técnico.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Libros,
});

type Book = {
  order: number;
  title: string;
  category: string;
  description: string;
  asset: { url: string; size: number; original_filename: string };
};

const BOOKS: Book[] = [
  {
    order: 1,
    title: "Tendencia y Canal",
    category: "Estructura de mercado",
    description: "Cómo identificar la tendencia dominante y operar dentro de canales.",
    asset: tendencia,
  },
  {
    order: 2,
    title: "Análisis Fundamental",
    category: "Contexto macro",
    description: "Bases del análisis fundamental y su impacto en el precio.",
    asset: fundamental,
  },
  {
    order: 3,
    title: "Patrones de Continuación 1",
    category: "Patrones",
    description: "Primera parte de las formaciones que confirman continuidad de tendencia.",
    asset: cont1,
  },
  {
    order: 4,
    title: "Patrones de Continuación 2",
    category: "Patrones",
    description: "Segunda parte de las formaciones de continuidad y sus objetivos.",
    asset: cont2,
  },
  {
    order: 5,
    title: "Patrones de Cambio 1",
    category: "Patrones",
    description: "Formaciones de reversión y cómo anticipar agotamiento.",
    asset: cambio1,
  },
  {
    order: 6,
    title: "Patrones de Cambio 2",
    category: "Patrones",
    description: "Continuación del estudio de patrones de reversión.",
    asset: cambio2,
  },
  {
    order: 7,
    title: "Patrones Gráficos de Cambio",
    category: "Patrones gráficos",
    description: "Referencia visual de las principales figuras de cambio de tendencia.",
    asset: graficosCambio,
  },
  {
    order: 8,
    title: "Patrones Gráficos de Continuidad",
    category: "Patrones gráficos",
    description: "Referencia visual de las figuras que mantienen la tendencia.",
    asset: graficosCont,
  },
  {
    order: 9,
    title: "MACD",
    category: "Indicadores",
    description: "Lectura del MACD, cruces y divergencias aplicadas al proceso.",
    asset: macd,
  },
  {
    order: 10,
    title: "RSI",
    category: "Indicadores",
    description: "Uso del RSI para medir fuerza, sobrecompra y divergencias.",
    asset: rsi,
  },
];

function formatSize(bytes: number) {
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}

function Libros() {
  return (
    <AppShell
      title="Libros de Trading"
      subtitle="Material de estudio para reforzar tu criterio antes de operar."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {BOOKS.map((book) => (
          <article
            key={book.order}
            className="flex flex-col rounded-xl border border-border bg-surface/60 p-4"
          >
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-primary">
                <BookOpen className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {book.category}
                </p>
                <h2 className="font-display text-base font-semibold leading-tight">
                  {book.order}. {book.title}
                </h2>
              </div>
            </div>
            <p className="mt-3 flex-1 text-sm text-muted-foreground">{book.description}</p>
            <div className="mt-4 flex items-center justify-between gap-2">
              <span className="text-[11px] text-muted-foreground">
                PDF · {formatSize(book.asset.size)}
              </span>
              <div className="flex gap-2">
                <a
                  href={book.asset.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> Abrir
                </a>
              </div>
            </div>
          </article>
        ))}
      </div>
      <p className="mt-6 text-[11px] leading-relaxed text-muted-foreground">
        Material educativo de uso interno. No constituye asesoramiento financiero ni predicción de
        mercado.
      </p>
    </AppShell>
  );
}
