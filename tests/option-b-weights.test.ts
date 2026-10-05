import { describe, expect, test } from "bun:test";
import { activeQuestionIds, getActiveQuestionsBySetup } from "../src/lib/checklist";
import { INTERNAL_WEIGHT_TABLE } from "../src/lib/internal-weights";
import * as IW from "../src/lib/internal-weights";
import { evaluate } from "../src/lib/scoring";

const SETUPS = [
  "REVERSION",
  "CONTINUACION",
  "RUPTURA_RETESTEO",
  "ZONA_FIBONACCI",
  "IMPULSO_PULLBACK",
] as const;
function best(S: string) {
  const a: Record<string, string> = {};
  for (const q of getActiveQuestionsBySetup(S as never)) {
    const top = [...q.options].sort((x, y) => y.pts - x.pts)[0];
    if (top) a[q.id] = top.v;
  }
  return a;
}
describe("OPCIÓN B: matriz oficial completa", () => {
  test("sin UNCOVERED_COMPONENTS", () => {
    expect("UNCOVERED_COMPONENTS" in IW).toBe(false);
  });
  test("cada bloque activo suma exactamente 100 con pesos reales (sin renormalizar)", () => {
    for (const S of SETUPS)
      for (const variant of [{}, { S03_BREAK_VARIANT: "THREE_BODY" }]) {
        const ids = activeQuestionIds(S, { ...best(S), ...variant });
        const sums: Record<string, number> = {};
        for (const e of INTERNAL_WEIGHT_TABLE)
          if ((e.setup === S || e.setup === "COMUN") && ids.has(e.id))
            sums[e.section] = (sums[e.section] ?? 0) + e.w;
        for (const [sec, t] of Object.entries(sums)) expect(t, `${S} ${sec}`).toBeCloseTo(100, 3);
      }
  });
  test("cada reactivo ponderado existe y pertenece a su setup (sin doble scoring)", () => {
    const seen = new Set<string>();
    for (const e of INTERNAL_WEIGHT_TABLE) {
      expect(seen.has(e.id), e.id).toBe(false);
      seen.add(e.id);
      if (e.setup !== "COMUN")
        expect(
          getActiveQuestionsBySetup(e.setup as never).some((q) => q.id === e.id),
          e.id,
        ).toBe(true);
    }
  });
  test("S04_CONF_02 sigue validation-only 0 % y el 5M puntúa sólo en S04_CONF_05", () => {
    expect(INTERNAL_WEIGHT_TABLE.find((e) => e.id === "S04_CONF_02")).toBeUndefined();
    expect(INTERNAL_WEIGHT_TABLE.find((e) => e.id === "S04_CONF_05")?.w).toBe(15);
  });
  test("R:R >= 1 no cambia score", () => {
    for (const S of SETUPS) {
      const scores = [110, 115, 120, 190].map(
        (target) =>
          evaluate({
            answers: best(S),
            risk: { capital: 10000, riskPct: 1, entry: 100, stop: 90, target },
            setup: S,
            direction: "LONG",
            maxRiskPct: 1,
          }).score,
      );
      expect(new Set(scores).size).toBe(1);
      expect(scores[0]).toBe(100);
    }
  });
});

import { WEIGHT_SOURCE_PENDING_IDS } from "../src/lib/internal-weights";
import { buildRegistry, OPTION_B_NEW_IDS } from "../src/lib/checklist-registry";
import { readFileSync } from "node:fs";

describe("OPCIÓN B: fuente de pesos", () => {
  test("sólo S02 Ejecución/Disciplina quedan con peso PENDIENTE_DE_FUENTE", () => {
    expect([...WEIGHT_SOURCE_PENDING_IDS].sort()).toEqual([
      "S02_DISC_01",
      "S02_EXEC_01",
      "S02_EXEC_02",
    ]);
  });
  test("el registro marca esos pesos y los 18 reactivos nuevos como PENDIENTE_DE_FUENTE", () => {
    const recs = buildRegistry();
    for (const id of [...WEIGHT_SOURCE_PENDING_IDS, ...OPTION_B_NEW_IDS]) {
      const r = recs.find((x) => x.question_id === id);
      expect(r?.status, id).toBe("PENDIENTE_DE_FUENTE");
    }
    expect(OPTION_B_NEW_IDS.size).toBe(18);
  });
  test("sin 'Matriz vigente', OPCIÓN A ni normalización en pesos", () => {
    const src = readFileSync("src/lib/internal-weights.ts", "utf8");
    expect(src).not.toMatch(/Matriz vigente|OPCIÓN A|normaliz|UNCOVERED|equipon/i);
  });
  test("SIN_COMPONENTE sólo en S05_CTX_03 (documentado)", () => {
    const sin = INTERNAL_WEIGHT_TABLE.filter((e) => e.mapping === "SIN_COMPONENTE").map(
      (e) => e.id,
    );
    expect(sin).toEqual(["S05_CTX_03"]);
  });
});
