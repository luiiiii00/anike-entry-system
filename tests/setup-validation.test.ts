import { describe, expect, test } from "bun:test";
import { EVALUATION_SETUP_IDS } from "../src/lib/checklist";
import { saveEvaluationInputSchema } from "../src/lib/evaluations.functions";
import { evaluate } from "../src/lib/scoring";

const VALID_INPUT = {
  tradeDate: "2026-10-02",
  answers: {},
  risk: {},
  status: "draft" as const,
};

describe("validación de setup en la frontera del backend", () => {
  test("acepta todos los setups actualmente reconocidos por el proyecto", () => {
    for (const setup of EVALUATION_SETUP_IDS) {
      expect(
        saveEvaluationInputSchema.safeParse({ ...VALID_INPUT, setup }).success,
      ).toBe(true);
    }
  });

  test("FREE continúa aceptado cuando forma parte del registro oficial actual", () => {
    if (!EVALUATION_SETUP_IDS.includes("FREE")) return;
    expect(
      saveEvaluationInputSchema.safeParse({ ...VALID_INPUT, setup: "FREE" }).success,
    ).toBe(true);
  });

  test("rechaza setup arbitrario, variante de setup y string vacío", () => {
    for (const setup of ["HACK", "S01_HACK", "CUALQUIER_COSA", ""]) {
      expect(
        saveEvaluationInputSchema.safeParse({ ...VALID_INPUT, setup }).success,
      ).toBe(false);
    }
  });

  test("un setup inexistente también es rechazado por el motor", () => {
    expect(() =>
      evaluate({
        answers: {},
        risk: {},
        setup: "HACK",
        direction: "LONG",
        maxRiskPct: 1,
      }),
    ).toThrow("Identificador de setup no válido.");
  });

  test("un setup específico no puede caer silenciosamente a evaluar todo", () => {
    expect(() =>
      evaluate({
        answers: {},
        risk: {},
        setup: "HACK",
        direction: "LONG",
        maxRiskPct: 1,
      }),
    ).toThrow();

    expect(
      EVALUATION_SETUP_IDS.every((setup) =>
        saveEvaluationInputSchema.safeParse({ ...VALID_INPUT, setup }).success,
      ),
    ).toBe(true);
  });
});
