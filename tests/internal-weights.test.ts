import { describe, expect, test } from "bun:test";
import { getActiveQuestionsBySetup, SECTIONS, activeQuestionIds } from "../src/lib/checklist";
import {
  AUTO_RR_IDS,
  INTERNAL_WEIGHTS,
  INTERNAL_WEIGHT_TABLE,
  rrFactor,
} from "../src/lib/internal-weights";
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
  test("cada bloque suma 100 % de peso efectivo normalizado", () => {
    for (const S of SETUPS) {
      const ids = activeQuestionIds(S, best(S));
      const bySection: Record<string, number> = {};
      for (const e of INTERNAL_WEIGHT_TABLE) {
        if (e.setup !== S && e.setup !== "COMUN") continue;
        if (!ids.has(e.id) && !e.id.endsWith("_AUTO_RR")) continue;
        bySection[e.section] = (bySection[e.section] ?? 0) + e.w;
      }
      for (const [sec, total] of Object.entries(bySection)) {
        const rows = INTERNAL_WEIGHT_TABLE.filter(
          (e) =>
            e.section === sec &&
            (e.setup === S || e.setup === "COMUN") &&
            (ids.has(e.id) || e.id.endsWith("_AUTO_RR")),
        );
        const pct = rows.reduce((acc, e) => acc + (e.w / total) * 100, 0);
        expect(pct, `${S} ${sec}`).toBeCloseTo(100, 6);
      }
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
  test("S01/S02: R:R automático = 40 % de Riesgo", () => {
    for (const S of ["REVERSION", "CONTINUACION"] as const) {
      const rows = INTERNAL_WEIGHT_TABLE.filter((e) => e.setup === S && e.section === "riesgo");
      const total = rows.reduce((a, e) => a + e.w, 0);
      expect(INTERNAL_WEIGHTS[AUTO_RR_IDS[S]]!.w / total).toBeCloseTo(0.4, 9);
    }
  });
  test("escala R:R existente: <1 → 0 · 1 → 0,3 · 1,5 → 0,6 · ≥2 → 1", () => {
    expect(rrFactor(0.99)).toBe(0);
    expect(rrFactor(1)).toBe(0.3);
    expect(rrFactor(1.5)).toBe(0.6);
    expect(rrFactor(2)).toBe(1);
    expect(rrFactor(Number.NaN)).toBeNull();
  });
  test("S01 con R:R 1.00: válido (no NO TRADE), Riesgo 72 % → CONDICIONAL por gate", () => {
    const risk: RiskData = { capital: 10000, riskPct: 1, entry: 100, stop: 90, target: 110 };
    const d = evaluate({
      answers: best("REVERSION"),
      risk,
      setup: "REVERSION",
      direction: "LONG",
      maxRiskPct: 1,
    });
    expect(d.globalInvalidation).toBe(false);
    expect(d.breakdown.riesgo.percent).toBeCloseTo(72, 6);
    expect(d.finalState).toBe("CONDICIONAL");
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
