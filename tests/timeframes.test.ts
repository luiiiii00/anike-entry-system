import { describe, expect, test } from "bun:test";
import {
  applyChecklistOverlay,
  buildChecklistCatalog,
  EVALUATION_SETUP_IDS,
  getActiveQuestionsBySetup,
  questionTimeframe,
  SECTIONS,
  SECTION_TIMEFRAME,
  TIMEFRAMES,
  activeQuestionIds,
  type EvaluationSetupId,
  type Timeframe,
} from "../src/lib/checklist";
import { computeScore } from "../src/lib/scoring";

const ALL = EVALUATION_SETUP_IDS as EvaluationSetupId[];

describe("multi-timeframe 1D → 1H → 5M", () => {
  test("las temporalidades oficiales existen y los bloques del flujo las declaran", () => {
    expect(TIMEFRAMES).toEqual(["1D", "1H", "5M"]);
    expect(SECTION_TIMEFRAME.contexto).toBe("1D");
    expect(SECTION_TIMEFRAME.estructura).toBe("1H");
    expect(SECTION_TIMEFRAME.zona).toBe("1H");
    expect(SECTION_TIMEFRAME.confirmacion).toBe("5M");
    expect(SECTION_TIMEFRAME.ejecucion).toBe("5M");
  });

  test("cada pregunta de un bloque temporal lleva su timeframe asociado", () => {
    for (const section of SECTIONS) {
      const expected = SECTION_TIMEFRAME[section.id];
      for (const q of section.groups.flatMap((g) => g.questions)) {
        if (!expected) continue;
        expect(q.timeframe).toBe(questionTimeframe(q.id, section.id) as Timeframe);
        expect(TIMEFRAMES).toContain(q.timeframe as Timeframe);
      }
    }
  });

  test("SETUP LIBRE y S01–S05 analizan varias temporalidades", () => {
    for (const id of ALL) {
      const tfs = new Set(
        getActiveQuestionsBySetup(id)
          .map((q) => q.timeframe)
          .filter(Boolean),
      );
      expect(tfs.has("1D")).toBe(true);
      expect(tfs.has("1H")).toBe(true);
      expect(tfs.has("5M")).toBe(true);
    }
  });

  test("SETUP LIBRE conserva sus criterios 1H y 5M históricos", () => {
    const free = activeQuestionIds("FREE");
    for (const id of ["h1_zone", "h1_react", "m5_signal", "m5_break"]) {
      if (free.has(id)) expect(questionTimeframe(id, "zona")).toBeDefined();
    }
    expect(questionTimeframe("m5_signal", "confirmacion")).toBe("5M");
    expect(questionTimeframe("h1_zone", "zona")).toBe("1H");
  });

  test("el timeframe no duplica preguntas ni cambia el CORE", () => {
    for (const id of ALL) {
      const ids = getActiveQuestionsBySetup(id).map((q) => q.id);
      expect(new Set(ids).size).toBe(ids.length);
      const answers: Record<string, string> = {};
      for (const q of getActiveQuestionsBySetup(id)) {
        const best = [...q.options].sort((a, b) => b.pts - a.pts)[0];
        if (best) answers[q.id] = best.v;
      }
      expect(computeScore(answers, activeQuestionIds(id)).score).toBe(100);
    }
  });

  test("una pregunta añadida por el editor hereda el timeframe de su bloque", () => {
    const catalog = buildChecklistCatalog({
      version: 1,
      edits: {},
      disabled: [],
      added: [
        {
          id: "custom_tf",
          sectionId: "confirmacion",
          owner: "COMMON",
          label: "¿Hay confirmación en 5M?",
          options: [
            { v: "si", label: "Sí", pts: 1 },
            { v: "no", label: "No", pts: 0 },
          ],
        },
      ],
    });
    const q = catalog.sections
      .flatMap((s) => s.groups.flatMap((g) => g.questions))
      .find((x) => x.id === "custom_tf");
    expect(q?.timeframe).toBe("5M");
    applyChecklistOverlay(null);
  });
});
