import { afterEach, describe, expect, test } from "bun:test";
import {
  applyChecklistOverlay,
  buildChecklistCatalog,
  checklistOverlayIssues,
  EMPTY_OVERLAY,
  getQuestionsForSetup,
  validateSetupQuestionMatrix,
  type ChecklistOverlay,
} from "../src/lib/checklist";
import { computeScore } from "../src/lib/scoring";

function overlay(partial: Partial<ChecklistOverlay>): ChecklistOverlay {
  return { ...EMPTY_OVERLAY, ...partial };
}

afterEach(() => {
  applyChecklistOverlay(null);
});

describe("editor de preguntas (capa de edición)", () => {
  test("editar enunciado, ayuda y factores de una pregunta existente", () => {
    const catalog = buildChecklistCatalog(
      overlay({
        edits: {
          S01_DISC_01: {
            label: "¿Por qué entras realmente?",
            hint: "Sé honesto",
            options: [
              { v: "plan", label: "Por plan", pts: 1 },
              { v: "impulso", label: "Por impulso", pts: 0 },
            ],
          },
        },
      }),
    );
    const q = catalog.setupQuestions.REVERSION.find((x) => x.id === "S01_DISC_01")!;
    expect(q.label).toBe("¿Por qué entras realmente?");
    expect(q.hint).toBe("Sé honesto");
    expect(q.options.map((o) => o.pts)).toEqual([1, 0]);
  });

  test("retirar una pregunta la saca de todas las matrices y la deja como histórica", () => {
    const catalog = buildChecklistCatalog(overlay({ disabled: ["rs_process"] }));
    for (const setup of ["FREE", "REVERSION", "CONTINUACION", "RUPTURA_RETESTEO"] as const) {
      expect(catalog.setupQuestions[setup].some((q) => q.id === "rs_process")).toBe(false);
    }
    expect(catalog.unused).toContain("rs_process");
  });

  test("una pregunta nueva común aparece en las 6 matrices", () => {
    const catalog = buildChecklistCatalog(
      overlay({
        added: [
          {
            id: "x_nueva_comun",
            sectionId: "zona",
            owner: "COMMON",
            label: "¿La zona sigue vigente?",
            options: [
              { v: "si", label: "Sí", pts: 1 },
              { v: "no", label: "No", pts: 0 },
            ],
          },
        ],
      }),
    );
    for (const setup of Object.keys(
      catalog.setupQuestions,
    ) as (keyof typeof catalog.setupQuestions)[]) {
      expect(catalog.setupQuestions[setup].some((q) => q.id === "x_nueva_comun")).toBe(true);
    }
  });

  test("una pregunta nueva de un setup no contamina los demás", () => {
    const catalog = buildChecklistCatalog(
      overlay({
        added: [
          {
            id: "x_solo_s01",
            sectionId: "estructura",
            owner: "REVERSION",
            label: "¿Hay agotamiento del tramo previo?",
            options: [
              { v: "si", label: "Sí", pts: 1 },
              { v: "no", label: "No", pts: 0 },
            ],
          },
        ],
      }),
    );
    expect(catalog.setupQuestions.REVERSION.some((q) => q.id === "x_solo_s01")).toBe(true);
    expect(catalog.setupQuestions.CONTINUACION.some((q) => q.id === "x_solo_s01")).toBe(false);
  });

  test("activar la capa cambia el cuestionario activo y la matriz sigue siendo válida", () => {
    applyChecklistOverlay(
      overlay({
        disabled: ["S01_DISC_01"],
        added: [
          {
            id: "x_extra",
            sectionId: "disciplina",
            owner: "COMMON",
            label: "¿Respetas el tamaño de posición?",
            options: [
              { v: "si", label: "Sí", pts: 1 },
              { v: "no", label: "No", pts: 0 },
            ],
          },
        ],
      }),
    );
    const ids = getQuestionsForSetup("REVERSION").map((q) => q.id);
    expect(ids).not.toContain("S01_DISC_01");
    expect(ids).toContain("x_extra");
    expect(validateSetupQuestionMatrix()).toEqual([]);
    // Los pesos y la fórmula del CORE no cambian.
    expect(computeScore({}, new Set(ids)).breakdown.disciplina.weight).toBe(
      computeScore({}).breakdown.disciplina.weight,
    );
  });

  test("no se puede publicar una capa que deja un bloque con gate sin criterios", () => {
    const catalog = buildChecklistCatalog(EMPTY_OVERLAY);
    const riesgo = catalog.setupQuestions.REVERSION.filter((q) => q.sectionId === "riesgo").map(
      (q) => q.id,
    );
    const issues = checklistOverlayIssues(overlay({ disabled: riesgo }));
    expect(issues.some((i) => i.includes("riesgo"))).toBe(true);
  });

  test("una capa vacía no genera avisos", () => {
    expect(checklistOverlayIssues(EMPTY_OVERLAY)).toEqual([]);
  });
});
