/**
 * Genera `docs/REGISTRO-MAESTRO-ANIKE-EJEPIKA.md` desde el registro maestro.
 * Uso: bun scripts/generate-registro-maestro.ts
 */
import { writeFileSync } from "node:fs";
import {
  buildRegistry,
  registryIssues,
  registrySummary,
  type RegistryRecord,
} from "../src/lib/checklist-registry";

const records = buildRegistry();
const summary = registrySummary(records);
const issues = registryIssues(records);

const f = (n: number) => n.toFixed(2);
const opts = (r: RegistryRecord) =>
  r.options.length === 0 ? "—" : r.options.map((o) => `${o.label} (${f(o.factor)})`).join(" · ");

const lines: string[] = [];
lines.push("# REGISTRO TÉCNICO MAESTRO — MATRIZ ANIKE EJEPIKA", "");
lines.push(
  "Generado desde `src/lib/checklist-registry.ts` (fuente: matriz activa en `src/lib/checklist.ts`).",
);
lines.push(
  "Este registro NO modifica pesos CORE, fórmula, gates, HARD, umbral 80 ni estados.",
  "",
);
lines.push(`- Total de reactivos registrados: **${summary.total}**`);
lines.push(`- COMPLETOS: **${summary.complete}**`);
lines.push(`- PENDIENTE_DE_FUENTE: **${summary.pending}**`);
lines.push(
  `- Por tipo: ${Object.entries(summary.byType)
    .map(([t, n]) => `${t}=${n}`)
    .join(", ")}`,
);
lines.push(`- Errores de esquema detectados: **${issues.length}**`, "");

lines.push("## Pendientes de fuente", "");
if (summary.pending === 0) {
  lines.push("No quedan reactivos PENDIENTE_DE_FUENTE: el registro está cerrado.", "");
} else {
  for (const p of summary.pendingIds) {
    lines.push(`- \`${p.setup_id}\` · \`${p.question_id}\` — ${p.reason}`);
  }
  lines.push("");
}

lines.push("## Tabla maestra", "");
lines.push(
  "| setup_id | question_id | block | orden | tipo | concepto | condición | opciones (factor) | internal_weight | destino CORE | comportamiento | fuente | estado |",
);
lines.push("|---|---|---|---|---|---|---|---|---|---|---|---|---|");
for (const r of records) {
  lines.push(
    `| ${r.setup_id} | ${r.question_id} | ${r.block_code} ${r.block_title} | ${r.order} | ${r.type} | ${r.concept} | ${r.condition ?? "—"} | ${opts(r)} | ${r.internal_weight} | ${r.core_target.block} (${r.core_target.weight} · ${r.core_target.stage}) | ${r.behavior} | ${r.source ?? "—"} | ${r.status} |`,
  );
}
lines.push("");

writeFileSync(new URL("../docs/REGISTRO-MAESTRO-ANIKE-EJEPIKA.md", import.meta.url), lines.join("\n"));
console.log(
  `Registro generado: ${summary.total} reactivos · ${summary.complete} COMPLETOS · ${summary.pending} PENDIENTES · ${issues.length} errores de esquema`,
);
