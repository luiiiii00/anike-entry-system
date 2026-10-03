import { afterAll, describe, expect, test } from "bun:test";
import {
  applyChecklistOverlay,
  EMPTY_OVERLAY,
  EVALUATION_SETUP_IDS,
  getActiveQuestionsBySetup,
} from "../src/lib/checklist";
import { evaluate } from "../src/lib/scoring";
import { saveEvaluationInputSchema } from "../src/lib/evaluations.functions";

/** A1 — un setup explícito inválido nunca se degrada a evaluación global. */

function best(setup: string | null): Record<string, string> {
  const a: Record<string, string> = {};
  for (const q of getActiveQuestionsBySetup(setup)) {
    const top = [...q.options].sort((x, y) => y.pts - x.pts)[0];
    if (top) a[q.id] = top.v;
  }
  return a;
}
const risk = { capital: 10000, riskPct: 1, entry: 100, stop: 95, target: 115 };
const run = (setup: string | null | undefined, answers = best(null)) =>
  evaluate({ answers, risk, setup, direction: "LONG", maxRiskPct: 1, market: "CRYPTO" });

const base = { tradeDate: "2026-10-03", answers: {}, risk: {}, status: "draft" as const };
const INVALID = ["HACK", "S01_HACK", "CUALQUIER_COSA", ""];

describe("A1 · barrera 1: schema de entrada", () => {
  test("acepta S01–S05, FREE, null y undefined", () => {
    for (const s of EVALUATION_SETUP_IDS)
      expect(saveEvaluationInputSchema.safeParse({ ...base, setup: s }).success).toBe(true);
    expect(saveEvaluationInputSchema.safeParse({ ...base, setup: null }).success).toBe(true);
    expect(saveEvaluationInputSchema.safeParse(base).success).toBe(true);
  });
  test("rechaza HACK, S01_HACK, CUALQUIER_COSA y ''", () => {
    for (const s of INVALID)
      expect(saveEvaluationInputSchema.safeParse({ ...base, setup: s }).success).toBe(false);
  });
  test("NaN / Infinity / -Infinity explícitos se rechazan; vacío y null se aceptan", () => {
    for (const bad of [Number.NaN, Infinity, -Infinity, "NaN", "Infinity", "-Infinity", "abc"])
      expect(saveEvaluationInputSchema.safeParse({ ...base, risk: { entry: bad } }).success).toBe(
        false,
      );
    for (const ok of [100, "100.5", "", null, undefined])
      expect(saveEvaluationInputSchema.safeParse({ ...base, risk: { entry: ok } }).success).toBe(
        true,
      );
  });
});

describe("A1 · barrera 2: evaluate()", () => {
  test("S01–S05 y FREE válidos evalúan su propia matriz", () => {
    for (const s of EVALUATION_SETUP_IDS) {
      const d = run(s, best(s));
      expect(d.complete).toBe(true);
      expect(d.finalState).toBe("APROBADA");
    }
  });
  test("null / undefined conservan el fallback global histórico", () => {
    expect(() => run(null)).not.toThrow();
    expect(() => run(undefined)).not.toThrow();
  });
  test("setup inválido → error: nunca evaluación global ni APROBADA", () => {
    for (const s of INVALID) expect(() => run(s, best(null))).toThrow(/invalid_setup/);
  });
  test("setup oficial con catálogo activo vacío → error", () => {
    const ids = getActiveQuestionsBySetup("REVERSION").map((q) => q.id);
    let applied = true;
    try {
      applyChecklistOverlay({ ...EMPTY_OVERLAY, disabled: ids });
    } catch {
      applied = false;
    }
    if (applied && getActiveQuestionsBySetup("REVERSION").length === 0)
      expect(() => run("REVERSION", {})).toThrow(/empty_setup_catalog/);
    else expect(applied).toBe(true);
  });
  afterAll(() => applyChecklistOverlay(EMPTY_OVERLAY));
});
