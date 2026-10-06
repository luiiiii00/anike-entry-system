import { describe, expect, test } from "bun:test";
import { getActiveQuestionsBySetup, SECTIONS, activeQuestionIds } from "../src/lib/checklist";
import { INTERNAL_WEIGHTS, INTERNAL_WEIGHT_TABLE } from "../src/lib/internal-weights";
import { evaluate, type RiskData } from "../src/lib/scoring";

/** Remapeo OPCIÓN A de pesos internos oficiales. */
const SETUPS = [
  "REVERSION",
  "CONTINUACION",
  "RUPTURA_RETESTEO",
  "ZONA_FIBONACCI",
  "IMPULSO_PULLBACK",
] as const;
const sectionOf = new Map<string, string>();
for (const s of SECTIONS)
  for (const g of s.groups) for (const q of g.questions) sectionOf.set(q.id, s.id);

function best(S: string) {
  const a: Record<string, string> = {};
  for (const q of getActiveQuestionsBySetup(S as never)) {
    const top = [...q.options].sort((x, y) => y.pts - x.pts)[0];
    if (top) a[q.id] = top.v;
  }
  return a;
}

describe("pesos internos oficiales", () => {
  test("todo reactivo puntuable S01–S05 tiene peso oficial explícito (sin peso 1 genérico)", () => {
    for (const S of SETUPS)
      for (const q of getActiveQuestionsBySetup(S)) {
        if (q.meta || q.validationOnly || sectionOf.get(q.id) === "resultados") continue;
        expect(INTERNAL_WEIGHTS[q.id], `${S} ${q.id}`).toBeDefined();
      }
  });
  test("metadata y validation-only = 0 % (no figuran en la tabla)", () => {
    for (const S of SETUPS)
      for (const q of getActiveQuestionsBySetup(S))
        if (q.meta || q.validationOnly) expect(INTERNAL_WEIGHTS[q.id]).toBeUndefined();
  });
  test("cada bloque suma 100 % RAW (sin normalización)", () => {
    for (const S of SETUPS) {
      const ids = activeQuestionIds(S, best(S));
      const bySection: Record<string, number> = {};
      for (const e of INTERNAL_WEIGHT_TABLE) {
        if (e.setup !== S && e.setup !== "COMUN") continue;
        if (!ids.has(e.id)) continue;
        bySection[e.section] = (bySection[e.section] ?? 0) + e.w;
      }
      for (const [sec, total] of Object.entries(bySection))
        expect(Math.abs(total - 100), `${S} ${sec}`).toBeLessThan(1e-6);
    }
  });
  test("aislamiento: los pesos de un setup sólo referencian sus reactivos", () => {
    const prefix = {
      REVERSION: "S01_",
      CONTINUACION: "S02_",
      RUPTURA_RETESTEO: "S03_",
      ZONA_FIBONACCI: "S04_",
      IMPULSO_PULLBACK: "S05_",
    } as Record<string, string>;
    for (const e of INTERNAL_WEIGHT_TABLE)
      if (e.setup !== "COMUN") expect(e.id.startsWith(prefix[e.setup]!)).toBe(true);
  });
  test("S01/S02: R:R fuera del score → Riesgo = Geometría 50 % + Riesgo monetario 50 %", () => {
    for (const S of ["REVERSION", "CONTINUACION"] as const) {
      const rows = INTERNAL_WEIGHT_TABLE.filter((e) => e.setup === S && e.section === "riesgo");
      expect(rows.map((e) => e.w)).toEqual([50, 50]);
    }
  });
  test("S01 con R:R 1.00: válido, Riesgo 100 % (R:R sin puntos) → APROBADA", () => {
    const risk: RiskData = { capital: 10000, riskPct: 1, entry: 100, stop: 90, target: 110 };
    const d = evaluate({
      answers: best("REVERSION"),
      risk,
      setup: "REVERSION",
      direction: "LONG",
      maxRiskPct: 1,
    });
    expect(d.globalInvalidation).toBe(false);
    expect(d.breakdown.riesgo.percent).toBeCloseTo(100, 6);
    expect(d.finalState).toBe("APROBADA");
  });
  test("metadata / validation-only suman 0 % en la tabla", () => {
    for (const S of SETUPS)
      for (const q of getActiveQuestionsBySetup(S))
        if (q.meta || q.validationOnly) expect(INTERNAL_WEIGHTS[q.id]?.w ?? 0).toBe(0);
  });
  test("S03 con R:R 1.00 y respuestas óptimas → APROBADA (R:R no puntúa en S03)", () => {
    const risk: RiskData = { capital: 10000, riskPct: 1, entry: 100, stop: 90, target: 110 };
    const d = evaluate({
      answers: best("RUPTURA_RETESTEO"),
      risk,
      setup: "RUPTURA_RETESTEO",
      direction: "LONG",
      maxRiskPct: 1,
    });
    expect(d.score).toBe(100);
    expect(d.finalState).toBe("APROBADA");
  });
});
