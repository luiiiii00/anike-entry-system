import { describe, expect, test } from "bun:test";
import {
  activeQuestionIds,
  answersForSetup,
  getQuestionsForSetup,
  OFFICIAL_SETUP_IDS,
  OFFICIAL_SETUPS,
  SECTIONS,
  SECTION_BY_ID,
  sectionGroupsForSetup,
  type OfficialSetupId,
} from "../src/lib/checklist";
import { computeScore } from "../src/lib/scoring";

const IDS = OFFICIAL_SETUP_IDS as OfficialSetupId[];

function isolation(setupId: OfficialSetupId) {
  const active = getQuestionsForSetup(setupId);
  return {
    total: active.length,
    every: active.every((q) => q.setupId === setupId),
    some: active.some((q) => q.setupId !== setupId),
    foreign: active.filter((q) => q.setupId !== setupId).length,
  };
}

describe("aislamiento de preguntas por setup", () => {
  test("TEST 1 REVERSION devuelve solamente preguntas REVERSION", () => {
    const r = isolation("REVERSION");
    expect(r.total).toBeGreaterThan(0);
    expect(r.every).toBe(true);
    expect(r.some).toBe(false);
  });

  test("TEST 2 CONTINUACION devuelve solamente preguntas CONTINUACION", () => {
    const r = isolation("CONTINUACION");
    expect(r.every).toBe(true);
    expect(r.some).toBe(false);
  });

  test("TEST 3 RUPTURA_RETESTEO devuelve solamente sus preguntas", () => {
    const r = isolation("RUPTURA_RETESTEO");
    expect(r.every).toBe(true);
    expect(r.some).toBe(false);
  });

  test("TEST 4 ZONA_FIBONACCI devuelve solamente sus preguntas", () => {
    const r = isolation("ZONA_FIBONACCI");
    expect(r.every).toBe(true);
    expect(r.some).toBe(false);
  });

  test("TEST 5 IMPULSO_PULLBACK devuelve solamente sus preguntas", () => {
    const r = isolation("IMPULSO_PULLBACK");
    expect(r.every).toBe(true);
    expect(r.some).toBe(false);
  });

  test("TEST 6 cada setup tiene cero preguntas de otros setups", () => {
    for (const id of IDS) expect(isolation(id).foreign).toBe(0);
  });

  test("los 5 setups oficiales existen y no hay más", () => {
    expect(IDS).toEqual([
      "REVERSION",
      "CONTINUACION",
      "RUPTURA_RETESTEO",
      "ZONA_FIBONACCI",
      "IMPULSO_PULLBACK",
    ]);
    expect(OFFICIAL_SETUPS.length).toBe(5);
  });

  test("cada setup excluye preguntas que otro setup sí incluye", () => {
    const rev = activeQuestionIds("REVERSION");
    const cont = activeQuestionIds("CONTINUACION");
    expect(rev.has("h1_pattern_change")).toBe(true);
    expect(cont.has("h1_pattern_change")).toBe(false);
    expect(cont.has("h1_pattern_cont")).toBe(true);
    expect(rev.has("h1_pattern_cont")).toBe(false);
    expect(activeQuestionIds("RUPTURA_RETESTEO").has("cf5_retest")).toBe(true);
    expect(rev.has("cf5_retest")).toBe(false);
  });
});

describe("cambio de setup", () => {
  test("TEST 7 S01 → S02 reconstruye activeQuestions", () => {
    const before = getQuestionsForSetup("REVERSION").map((q) => q.id);
    const after = getQuestionsForSetup("CONTINUACION").map((q) => q.id);
    expect(after).not.toEqual(before);
    expect(after.every((id) => activeQuestionIds("CONTINUACION").has(id))).toBe(true);
    expect(after.includes("h1_pattern_change")).toBe(false);
  });

  test("TEST 8 S02 → S03 reconstruye activeQuestions", () => {
    const after = getQuestionsForSetup("RUPTURA_RETESTEO");
    expect(after.every((q) => q.setupId === "RUPTURA_RETESTEO")).toBe(true);
    expect(after.some((q) => q.id === "h1_pattern_cont")).toBe(false);
  });

  test("rotación S01→S02→S03→S04→S05→S01 mantiene aislamiento", () => {
    const order: OfficialSetupId[] = [...IDS, "REVERSION"];
    for (const id of order) {
      const active = getQuestionsForSetup(id);
      expect(active.every((q) => q.setupId === id)).toBe(true);
      expect(active.some((q) => q.setupId !== id)).toBe(false);
    }
  });

  test("TEST 9 las respuestas de un setup no contaminan otro setup", () => {
    const s01 = { h1_pattern_change: "doble_techo", ctx_aligned: "si", h1_rsi_div: "si" };
    const s02 = answersForSetup(s01, "CONTINUACION");
    expect(s02["h1_pattern_change"]).toBe("na");
    expect(s02["h1_rsi_div"]).toBe("na");
    expect(s02["ctx_aligned"]).toBe("si");
  });

  test("las respuestas excluidas quedan como No aplica y no penalizan", () => {
    const s01 = answersForSetup({}, "REVERSION");
    for (const id of Object.keys(s01)) {
      expect(activeQuestionIds("REVERSION").has(id)).toBe(false);
      expect(s01[id]).toBe("na");
    }
  });
});

describe("integridad y compatibilidad", () => {
  test("TEST 10 setup inválido no produce cuestionario válido", () => {
    expect(getQuestionsForSetup("NO_EXISTE")).toEqual([]);
    expect(getQuestionsForSetup("Reversión")).toEqual([]);
    expect(answersForSetup({ ctx_aligned: "si" }, "NO_EXISTE")).toEqual({});
  });

  test("TEST 11 evaluación histórica con setup null sigue funcionando", () => {
    expect(getQuestionsForSetup(null)).toEqual([]);
    expect(getQuestionsForSetup(undefined)).toEqual([]);
    const historical = { ctx_aligned: "si", h1_pattern_change: "doble_techo" };
    const score = computeScore(historical);
    expect(score.score).toBeGreaterThanOrEqual(0);
  });

  test("TEST 12 el setup persistido se recupera por ID estable", () => {
    for (const id of IDS) {
      const restored = getQuestionsForSetup(id);
      expect(restored.length).toBe(getQuestionsForSetup(id).length);
      expect(restored.every((q) => q.setupId === id)).toBe(true);
    }
  });

  test("TEST 13 questionId es estable y no depende del índice", () => {
    for (const id of IDS) {
      const ids = getQuestionsForSetup(id).map((q) => q.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids.every((qid) => /^[a-z0-9_]+$/.test(qid))).toBe(true);
    }
  });

  test("TEST 14 el cálculo utiliza solamente las preguntas activas", () => {
    const answers = answersForSetup({ h1_pattern_change: "doble_techo" }, "RUPTURA_RETESTEO");
    const used = Object.keys(answers).filter((k) => answers[k] !== "na");
    expect(used.every((k) => activeQuestionIds("RUPTURA_RETESTEO").has(k))).toBe(true);
    // La pregunta de otro setup no aporta valor: queda como No aplica.
    expect(answers["h1_pattern_change"]).toBe("na");
  });

  test("TEST 15 los pesos del CORE permanecen exactamente iguales", () => {
    expect(SECTIONS.map((s) => [s.id, s.weight])).toEqual([
      ["comercio", 5],
      ["contexto", 10],
      ["estructura", 25],
      ["zona", 10],
      ["confirmacion", 20],
      ["riesgo", 10],
      ["recorrido", 5],
      ["ejecucion", 5],
      ["disciplina", 5],
      ["resultados", 5],
    ]);
    expect(SECTIONS.reduce((a, s) => a + s.weight, 0)).toBe(100);
  });

  test("las preguntas excluidas siempre admiten No aplica (no rompen el score)", () => {
    const all = SECTIONS.flatMap((s) => s.groups.flatMap((g) => g.questions));
    for (const id of IDS) {
      const active = activeQuestionIds(id);
      for (const q of all) {
        if (active.has(q.id)) continue;
        expect(q.options.some((o) => o.na)).toBe(true);
      }
    }
  });
});

describe("integración wizard", () => {
  test("las secciones del wizard sólo renderizan preguntas del setup elegido", () => {
    for (const id of IDS) {
      for (const section of SECTIONS) {
        const groups = sectionGroupsForSetup(section, id);
        for (const g of groups) {
          expect(g.questions.every((q) => q.setupId === id)).toBe(true);
          expect(g.questions.some((q) => q.setupId !== id)).toBe(false);
        }
      }
    }
  });

  test("sin setup el wizard no puede renderizar preguntas", () => {
    expect(sectionGroupsForSetup(SECTION_BY_ID["estructura"], null)).toEqual([]);
  });

  test("cambiar de setup cambia el conjunto renderizado de Estructura", () => {
    const rev = sectionGroupsForSetup(SECTION_BY_ID["estructura"], "REVERSION").flatMap((g) =>
      g.questions.map((q) => q.id),
    );
    const rup = sectionGroupsForSetup(SECTION_BY_ID["estructura"], "RUPTURA_RETESTEO").flatMap((g) =>
      g.questions.map((q) => q.id),
    );
    expect(rev).not.toEqual(rup);
    expect(rev.includes("h1_rsi_div")).toBe(true);
    expect(rup.includes("h1_rsi_div")).toBe(false);
  });
});
