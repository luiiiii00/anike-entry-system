import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  activeQuestionIds,
  getActiveQuestionsBySetup,
  EVALUATION_SETUP_IDS,
  type EvaluationSetupId,
} from "../src/lib/checklist";
import {
  APPROVAL_MIN_SCORE,
  evaluate,
  globalInvalidations,
  resolveFinalState,
  type RiskData,
} from "../src/lib/scoring";

/** Contrato técnico maestro V2 — fixtures y regresiones obligatorias. */

const SETUPS = ["REVERSION", "CONTINUACION", "RUPTURA_RETESTEO", "ZONA_FIBONACCI", "IMPULSO_PULLBACK"] as const;

const VALID_LONG: RiskData = { capital: 10000, riskPct: 1, entry: 100, stop: 95, target: 115 };
const RR_199: RiskData = { capital: 10000, riskPct: 1, entry: 100, stop: 90, target: 119.9 };

function best(setup: EvaluationSetupId): Record<string, string> {
  const answers: Record<string, string> = {};
  for (const q of getActiveQuestionsBySetup(setup)) {
    const top = [...q.options].sort((a, b) => b.pts - a.pts)[0];
    if (top) answers[q.id] = top.v;
  }
  return answers;
}

function worst(setup: EvaluationSetupId): Record<string, string> {
  const answers = best(setup);
  const active = activeQuestionIds(setup, answers);
  for (const q of getActiveQuestionsBySetup(setup)) {
    if (!active.has(q.id) || q.meta || q.validationOnly) continue;
    const low = [...q.options].sort((a, b) => a.pts - b.pts)[0];
    if (low) answers[q.id] = low.v;
  }
  return answers;
}

/** Una validación del setup en factor 0: condición pendiente, nunca NO TRADE. */
function pending(setup: EvaluationSetupId): Record<string, string> | null {
  const answers = best(setup);
  const active = activeQuestionIds(setup, answers);
  for (const q of getActiveQuestionsBySetup(setup)) {
    if (!active.has(q.id)) continue;
    if (!q.validationOnly && !String(q.kind ?? "").includes("VALIDATION")) continue;
    const zero = q.options.find((o) => o.pts === 0);
    if (zero) return { ...answers, [q.id]: zero.v };
  }
  return null;
}

const run = (setup: string, answers: Record<string, string>, risk: RiskData = VALID_LONG, direction = "LONG") =>
  evaluate({ answers, risk, setup, direction, maxRiskPct: 1, market: "CRYPTO" });

describe("1) 25 fixtures: 5 setups × 5 casos", () => {
  for (const S of SETUPS) {
    test(`${S} · configuración completa → APROBADA`, () => {
      const d = run(S, best(S));
      expect(d.complete).toBe(true);
      expect(d.score).toBe(100);
      expect(d.gatesOk).toBe(true);
      expect(d.pendingConditions).toBe(false);
      expect(d.globalInvalidation).toBe(false);
      expect(d.finalState).toBe("APROBADA");
    });
    test(`${S} · condición pendiente → CONDICIONAL`, () => {
      const a = pending(S);
      expect(a).not.toBeNull();
      const d = run(S, a!);
      expect(d.pendingConditions).toBe(true);
      expect(d.globalInvalidation).toBe(false);
      expect(d.finalState).toBe("CONDICIONAL");
    });
    test(`${S} · score bajo → CONDICIONAL`, () => {
      const d = run(S, worst(S));
      expect(d.complete).toBe(true);
      expect(d.score).toBeLessThan(APPROVAL_MIN_SCORE);
      expect(d.globalInvalidation).toBe(false);
      expect(d.finalState).toBe("CONDICIONAL");
    });
    test(`${S} · invalidación global objetiva → NO TRADE`, () => {
      const d = run(S, best(S), RR_199);
      expect(d.score).toBe(100);
      expect(d.globalInvalidationIds).toContain("rr_below_min");
      expect(d.finalState).toBe("NO TRADE");
    });
    test(`${S} · límite 80.00 con gates OK → APROBADA`, () => {
      const d = run(S, best(S));
      expect(
        resolveFinalState({
          complete: d.complete,
          globalInvalidation: d.globalInvalidation,
          scoreInternal: 80,
          gatesOk: d.gatesOk,
          pendingConditions: d.pendingConditions,
        }),
      ).toBe("APROBADA");
    });
  }
});

const state = (scoreInternal: number, extra: Partial<Parameters<typeof resolveFinalState>[0]> = {}) =>
  resolveFinalState({ complete: true, globalInvalidation: false, scoreInternal, gatesOk: true, pendingConditions: false, ...extra });

describe("2) umbral", () => {
  test("79.99 → 79 → CONDICIONAL", () => {
    expect(Math.floor(79.99)).toBe(79);
    expect(state(79.99)).toBe("CONDICIONAL");
  });
  test("80.00 / 80.01 → 80 → APROBADA; 87.99 → 87", () => {
    expect(Math.floor(80)).toBe(80);
    expect(state(80)).toBe("APROBADA");
    expect(Math.floor(80.01)).toBe(80);
    expect(state(80.01)).toBe("APROBADA");
    expect(Math.floor(87.99)).toBe(87);
  });
});

const gi = (risk: RiskData, direction: string, maxRiskPct = 1) => globalInvalidations({ risk, direction, maxRiskPct });

describe("3–8) R:R, geometría y seguridad numérica", () => {
  test("R:R 1.99 → NO TRADE; 2.00 → válido", () => {
    expect(gi({ entry: 100, stop: 90, target: 119.9 }, "LONG")).toContain("rr_below_min");
    expect(gi({ entry: 100, stop: 90, target: 120 }, "LONG")).toEqual([]);
  });
  test("LONG SL<Entry<TP con R:R correcto", () => {
    const d = run("REVERSION", best("REVERSION"), { capital: 10000, riskPct: 1, entry: 100, stop: 95, target: 110 });
    expect(d.metrics.rr).toBeCloseTo(2, 6);
    expect(d.globalInvalidation).toBe(false);
  });
  test("SHORT TP<Entry<SL con R:R correcto", () => {
    const d = run("REVERSION", best("REVERSION"), { capital: 10000, riskPct: 1, entry: 100, stop: 105, target: 85 }, "SHORT");
    expect(d.metrics.rr).toBeCloseTo(3, 6);
    expect(d.globalInvalidation).toBe(false);
  });
  test("TP del lado incorrecto → NO TRADE", () => {
    expect(gi({ entry: 100, stop: 95, target: 90 }, "LONG")).toContain("long_geometry");
    expect(gi({ entry: 100, stop: 105, target: 110 }, "SHORT")).toContain("short_geometry");
  });
  test("Entry = SL → NO TRADE sin dividir", () => {
    const d = run("REVERSION", best("REVERSION"), { capital: 10000, riskPct: 1, entry: 100, stop: 100, target: 120 });
    expect(d.globalInvalidationIds).toContain("zero_risk_distance");
    expect(d.finalState).toBe("NO TRADE");
    expect(d.metrics.rr === null || Number.isFinite(d.metrics.rr)).toBe(true);
  });
  test("NaN / Infinity → NO TRADE y ningún valor final no finito", () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const d = run("REVERSION", best("REVERSION"), { capital: 10000, riskPct: 1, entry: bad, stop: 95, target: 120 });
      expect(d.globalInvalidationIds).toContain("non_finite");
      expect(d.finalState).toBe("NO TRADE");
      expect(Number.isFinite(d.score)).toBe(true);
      for (const v of [d.metrics.rr, d.metrics.riskMoney, d.metrics.positionSize])
        expect(v === null || Number.isFinite(v)).toBe(true);
    }
  });
  test("riesgo por encima del límite → NO TRADE", () => {
    expect(gi({ entry: 100, stop: 95, target: 120, riskPct: 1.5 }, "LONG", 1)).toContain("risk_over_limit");
  });
  test("un dato pendiente no es invalidación", () => {
    expect(gi({ entry: 100 }, "LONG")).toEqual([]);
    expect(gi({}, "SHORT")).toEqual([]);
  });
});

describe("9) estados", () => {
  test("incompleta → BORRADOR", () => {
    expect(run("REVERSION", {}).finalState).toBe("BORRADOR");
    expect(state(100, { complete: false, globalInvalidation: true })).toBe("BORRADOR");
  });
  test("completa + pending → CONDICIONAL; score<80 → CONDICIONAL; gates → CONDICIONAL", () => {
    expect(state(100, { pendingConditions: true })).toBe("CONDICIONAL");
    expect(state(70)).toBe("CONDICIONAL");
    expect(state(100, { gatesOk: false })).toBe("CONDICIONAL");
  });
  test("globalInvalidation → NO TRADE", () => {
    expect(state(100, { globalInvalidation: true })).toBe("NO TRADE");
  });
});

describe("10) regresión crítica V2: factor 0 nunca produce NO TRADE", () => {
  for (const S of EVALUATION_SETUP_IDS) {
    test(`${S}: cada reactivo en factor 0 → nunca NO TRADE`, () => {
      const base = best(S);
      for (const q of getActiveQuestionsBySetup(S)) {
        for (const o of q.options.filter((x) => x.pts === 0)) {
          const d = run(S, { ...base, [q.id]: o.v });
          expect(d.globalInvalidation).toBe(false);
          expect(d.finalState).not.toBe("NO TRADE");
        }
      }
    });
  }
});

describe("11) dominancia de la invalidación global", () => {
  test("score alto + gates OK + R:R 1.99 → NO TRADE", () => {
    expect(state(99.99, { globalInvalidation: true })).toBe("NO TRADE");
    expect(run("CONTINUACION", best("CONTINUACION"), RR_199).finalState).toBe("NO TRADE");
  });
  test("score 100 + geometría inválida → NO TRADE", () => {
    const d = run("ZONA_FIBONACCI", best("ZONA_FIBONACCI"), { capital: 10000, riskPct: 1, entry: 100, stop: 105, target: 120 });
    expect(d.score).toBe(100);
    expect(d.finalState).toBe("NO TRADE");
  });
  test("score 95 + Entry = SL → NO TRADE", () => {
    expect(state(95, { globalInvalidation: true })).toBe("NO TRADE");
  });
});

describe("12) manipulación del frontend", () => {
  test("el motor ignora score, estado, gates y breakdown enviados por el cliente", () => {
    const d = evaluate({
      answers: worst("REVERSION"),
      risk: VALID_LONG,
      setup: "REVERSION",
      direction: "LONG",
      maxRiskPct: 1,
      // @ts-expect-error campos derivados no aceptados
      score: 100,
      classification: "SETUP A+",
      finalState: "APROBADA",
      gates: true,
      globalInvalidation: false,
      breakdown: { estructura: { percent: 100 } },
    });
    expect(d.score).toBeLessThan(80);
    expect(d.finalState).toBe("CONDICIONAL");
    expect(d.classification).toBe("CONDICIONAL");
  });
  test("el servidor valida sólo datos fuente y recalcula los derivados", () => {
    const src = readFileSync(new URL("../src/lib/evaluations.functions.ts", import.meta.url), "utf8");
    const schema = src.slice(src.indexOf("saveEvaluationInputSchema = z.object"), src.indexOf("export type SaveEvaluationInput"));
    for (const f of ["score", "classification", "finalState", "final_state", "breakdown", "gates", "globalInvalidation"])
      expect(schema.includes(`${f}:`)).toBe(false);
    expect(src).toContain("evaluate({");
  });
});

describe("13–14) aislamiento y ausencia de HARD reactivo", () => {
  test("cada setup carga sólo su matriz", () => {
    const prefix: Record<string, RegExp> = {
      REVERSION: /^S01_/, CONTINUACION: /^S02_/, RUPTURA_RETESTEO: /^S03_/, ZONA_FIBONACCI: /^S04_/, IMPULSO_PULLBACK: /^S05_/,
    };
    for (const S of EVALUATION_SETUP_IDS) {
      const ids = [...activeQuestionIds(S, best(S))];
      for (const [other, re] of Object.entries(prefix)) if (other !== S) expect(ids.some((id) => re.test(id))).toBe(false);
    }
  });
  test("el motor no contiene mapeo reactivo → HARD para decidir el estado", () => {
    const src = readFileSync(new URL("../src/lib/scoring.ts", import.meta.url), "utf8");
    expect(src).not.toMatch(/HARD_RULES\s*[:=]/);
    expect(src).not.toMatch(/hardRules\s*:/);
    const d = run("REVERSION", best("REVERSION"));
    expect("hardRules" in d).toBe(false);
  });
});
