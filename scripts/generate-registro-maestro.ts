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
lines.push("Este registro refleja exactamente la lógica del motor (`scoring.ts`, `internal-weights.ts`).", "");
lines.push("## Reglas del motor V2", "");
lines.push(
  "- Estados: BORRADOR / CONDICIONAL / APROBADA / NO TRADE.",
  "- No existe HARD por reactivo: ninguna respuesta ordinaria ni factor 0 produce NO TRADE por sí sola.",
  "- R:R = METADATA / validación global objetiva: se calcula y se muestra, no aporta factor ni puntos; no existe escala de puntuación R:R.",
  "- R:R < 1.00 → `rr_below_min` → NO TRADE. R:R >= 1.00 → válido, sin puntos de score.",
  "- Geometría LONG (SL < Entrada < TP) / SHORT (TP < Entrada < SL) obligatoria; Entry = SL (riskDistance = 0) → NO TRADE; NaN/Infinity → NO TRADE.",
  "- Invalidaciones de EJECUCIÓN (excepción explícita del usuario): entrada por venganza (`revenge_entry`) y FOMO (`fomo_entry`) → NO TRADE. Las preguntas de persecución del precio (S01_EXEC_03, S02/S03/S05_EXEC_02) son reactivos puntuables normales: factor 0 nunca produce NO TRADE.",
  "- internal_weight = peso oficial de la matriz (OPCIÓN B: cada componente tiene reactivo propio, sin renormalización); metadata y validation-only = 0 %. S02 Ejecución 50/50 y S02 Disciplina 100 %: decisión oficial del propietario.",
  "- Riesgo S01/S02: al retirar R:R del score, Geometría 50 % + Riesgo monetario 50 %.",
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
lines.push(
  `- Por respaldo de fuente: VERIFIED=${summary.bySourceStatus.VERIFIED}, NORMALIZED=${summary.bySourceStatus.NORMALIZED}, PENDIENTE_DE_FUENTE=${summary.bySourceStatus.PENDIENTE_DE_FUENTE}`,
);
lines.push(
  `- Activos en matriz vigente: **${summary.active}** · declarados por contrato (no inyectados): **${summary.declared}**`,
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
  "| setup | setup_id | question_id | block | orden | tipo | concepto | condición | tipo cond. | opciones (factor) | internal_weight | destino CORE | score | validación | HARD | rol temporalidad | fuente | activo | estado | source_status |",
);
lines.push("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
for (const r of records) {
  lines.push(
    `| ${r.setup_code} ${r.setup_semantic_name} | ${r.setup_id} | ${r.question_id} | ${r.block_code} ${r.block_title} | ${r.order} | ${r.type} | ${r.concept} | ${r.condition ?? "—"} | ${r.condition_type} | ${opts(r)} | ${r.internal_weight} | ${r.core_target.block} (${r.core_target.weight} · ${r.core_target.stage}) | ${r.score_behavior} | ${r.validation_behavior} | ${r.hard_behavior} | ${r.role ?? "—"} | ${r.source ?? "—"} | ${r.active ? "sí" : "declarado"} | ${r.status} | ${r.source_status} |`,
  );
}

lines.push("");

writeFileSync(
  new URL("../docs/REGISTRO-MAESTRO-ANIKE-EJEPIKA.md", import.meta.url),
  lines.join("\n"),
);
console.log(
  `Registro generado: ${summary.total} reactivos · ${summary.complete} COMPLETOS · ${summary.pending} PENDIENTES · ${issues.length} errores de esquema`,
);
