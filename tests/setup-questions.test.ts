import { describe, expect, test } from "bun:test";
import {
  activeQuestionIds,
  answersForSetup,
  belongsExplicitlyToSetup,
  COMMON_QUESTION_IDS,
  SETUP_EXCLUSIVE_QUESTIONS,
  UNUSED_QUESTION_IDS,
  validateSetupQuestionMatrix,
  getQuestionsForSetup,
  HISTORICAL_NA_VALUE,
  missingActiveAnswers,
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
    expect(activeQuestionIds("RUPTURA_RETESTEO").has("s03_retest_on_level")).toBe(true);
    expect(rev.has("s03_retest_on_level")).toBe(false);

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
    expect("h1_pattern_change" in s02).toBe(false);
    expect("h1_rsi_div" in s02).toBe(false);
    expect(s02["ctx_aligned"]).toBe("si");
  });

  test("la reconstrucción de respuestas no inyecta ningún valor", () => {
    expect(answersForSetup({}, "REVERSION")).toEqual({});
    const out = answersForSetup({ ctx_aligned: "si", cf5_retest: "si" }, "REVERSION");
    expect(out).toEqual({ ctx_aligned: "si" });
    expect(Object.values(out).includes("na")).toBe(false);
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
    // Todas las preguntas activas respondidas con la mejor opción → 100,
    // aunque las preguntas de otros setups no existan en las respuestas.
    for (const id of IDS) {
      const answers: Record<string, string> = {};
      for (const q of getQuestionsForSetup(id)) {
        const best = [...q.options].sort((a, b) => b.pts - a.pts)[0];
        if (best) answers[q.id] = best.v;
      }
      expect(computeScore(answers, activeQuestionIds(id)).score).toBe(100);
    }
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

  test("la solución no añade opciones No aplica / N/A / na a ninguna pregunta", () => {
    // Ninguna pregunta exclusiva de un setup depende de una opción "na" para
    // quedar fuera del cuestionario de otro setup: el filtrado es estructural.
    const exclusive = IDS.flatMap((id) => SETUP_EXCLUSIVE_QUESTIONS[id]);
    for (const id of exclusive) {
      for (const other of IDS) {
        if (SETUP_EXCLUSIVE_QUESTIONS[other].includes(id)) continue;
        expect(activeQuestionIds(other).has(id)).toBe(false);
        expect(answersForSetup({ [id]: "na" }, other)).toEqual({});
      }
    }
  });

  test("MATRIZ: cada pregunta del CORE está declarada exactamente una vez", () => {
    expect(validateSetupQuestionMatrix()).toEqual([]);
    const all = SECTIONS.flatMap((s) => s.groups.flatMap((g) => g.questions)).map((q) => q.id);
    const exclusive = IDS.flatMap((id) => SETUP_EXCLUSIVE_QUESTIONS[id]);
    expect(new Set(exclusive).size).toBe(exclusive.length);
    expect(COMMON_QUESTION_IDS.length + exclusive.length + UNUSED_QUESTION_IDS.length).toBe(
      all.length,
    );
  });

  test("AUDITORÍA: una pregunta sin mapping NO entra por fallback en ningún setup", () => {
    const orphan = "pregunta_no_mapeada";
    for (const id of IDS) {
      expect(belongsExplicitlyToSetup(orphan, id)).toBe(false);
      expect(activeQuestionIds(id).has(orphan)).toBe(false);
    }
    // Simula quitar una pregunta del mapping: deja de pertenecer a todos.
    const removed = COMMON_QUESTION_IDS[0]!;
    const withoutIt = COMMON_QUESTION_IDS.filter((q) => q !== removed);
    const belongs = (qid: string, setup: string) =>
      withoutIt.includes(qid) ||
      SETUP_EXCLUSIVE_QUESTIONS[setup as (typeof IDS)[number]].includes(qid);
    for (const id of IDS) expect(belongs(removed, id)).toBe(false);
  });

  test("cada pregunta activa pertenece explícitamente al setup", () => {
    for (const id of IDS) {
      expect(getQuestionsForSetup(id).every((q) => belongsExplicitlyToSetup(q.id, id))).toBe(true);
    }
  });

  test("las comunes están en los 5 setups y las exclusivas sólo en el suyo", () => {
    for (const qid of COMMON_QUESTION_IDS) {
      for (const id of IDS) expect(activeQuestionIds(id).has(qid)).toBe(true);
    }
    for (const id of IDS) {
      for (const qid of SETUP_EXCLUSIVE_QUESTIONS[id]) {
        expect(activeQuestionIds(id).has(qid)).toBe(true);
        for (const other of IDS.filter((o) => o !== id))
          expect(activeQuestionIds(other).has(qid)).toBe(false);
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
    const rup = sectionGroupsForSetup(SECTION_BY_ID["estructura"], "RUPTURA_RETESTEO").flatMap(
      (g) => g.questions.map((q) => q.id),
    );
    expect(rev).not.toEqual(rup);
    expect(rev.includes("h1_pattern_change")).toBe(true);
    expect(rup.includes("h1_pattern_change")).toBe(false);

  });
});

describe("regla ANIKE: el cuestionario activo no admite No aplica", () => {
  const NA_LABELS = ["no aplica", "n/a", "na", "no disponible"];

  test("ninguna pregunta activa de los 5 setups ofrece opción na", () => {
    for (const id of IDS) {
      for (const q of getQuestionsForSetup(id)) {
        expect(q.options.some((o) => o.na)).toBe(false);
        expect(q.options.some((o) => o.v === "na" || o.v === "no_disponible")).toBe(false);
        expect(q.options.some((o) => NA_LABELS.includes(o.label.trim().toLowerCase()))).toBe(false);
        expect(q.options.length).toBeGreaterThan(1);
      }
    }
  });

  test("ninguna pregunta del CORE conserva opciones na", () => {
    const all = SECTIONS.flatMap((s) => s.groups.flatMap((g) => g.questions));
    expect(all.flatMap((q) => q.options).filter((o) => o.na).length).toBe(0);
  });

  test("cf5_volume exige respuesta real (Sí / No / Dudoso)", () => {
    const q = SECTIONS.flatMap((s) => s.groups.flatMap((g) => g.questions)).find(
      (x) => x.id === "cf5_volume",
    )!;
    expect(q.options.map((o) => o.v)).toEqual(["si", "no", "dudoso"]);
  });

  test("answersForSetup no inyecta ningún valor na", () => {
    for (const id of IDS) {
      const out = answersForSetup({}, id);
      expect(out).toEqual({});
      expect(Object.values(answersForSetup({ ctx_aligned: "si" }, id))).not.toContain("na");
    }
  });

  test("pregunta activa sin respuesta ⇒ evaluación incompleta", () => {
    for (const id of IDS) {
      const active = getQuestionsForSetup(id);
      const answers: Record<string, string> = {};
      for (const q of active) answers[q.id] = q.options[0]!.v;
      expect(missingActiveAnswers(answers, id)).toEqual([]);
      const partial = { ...answers };
      delete partial["ctx_aligned"];
      expect(missingActiveAnswers(partial, id)).toEqual(["ctx_aligned"]);
      expect(missingActiveAnswers({}, id).length).toBeGreaterThan(0);
    }
  });

  test("las respuestas históricas con na se leen sin romper", () => {
    const historical = { ctx_aligned: "si", h1_pattern_change: HISTORICAL_NA_VALUE };
    const q = SECTIONS.flatMap((s) => s.groups.flatMap((g) => g.questions)).find(
      (x) => x.id === "h1_pattern_change",
    )!;
    const label = q.options.find((o) => o.v === historical["h1_pattern_change"])?.label ?? "na";
    expect(label).toBe("na");
    const score = computeScore(historical);
    expect(Number.isFinite(score.score)).toBe(true);
    expect(score.score).toBeGreaterThanOrEqual(0);
  });
});

describe("matriz definitiva S01–S05 (documento maestro)", () => {
  const EXPECTED_EXCLUSIVE: Record<OfficialSetupId, number> = {
    REVERSION: 13,
    CONTINUACION: 12,
    RUPTURA_RETESTEO: 12,
    ZONA_FIBONACCI: 13,
    IMPULSO_PULLBACK: 12,
  };

  test("cada setup declara exactamente sus criterios específicos", () => {
    for (const id of IDS) {
      expect(SETUP_EXCLUSIVE_QUESTIONS[id].length).toBe(EXPECTED_EXCLUSIVE[id]);
    }
  });

  test("los criterios específicos de un setup no aparecen en otro", () => {
    for (const id of IDS) {
      for (const qid of SETUP_EXCLUSIVE_QUESTIONS[id]) {
        for (const other of IDS.filter((o) => o !== id)) {
          expect(activeQuestionIds(other).has(qid)).toBe(false);
        }
      }
    }
  });

  test("el CORE común mínimo no arrastra criterios técnicos de un setup", () => {
    for (const qid of [
      "z_type",
      "z_reacted",
      "h1_fibo",
      "h1_rsi_div",
      "cf5_retest",
      "cf5_volume",
      "cf_price_action",
      "rc_target",
    ]) {
      expect(COMMON_QUESTION_IDS.includes(qid)).toBe(false);
    }
  });

  test("los criterios retirados sólo se conservan para lectura histórica", () => {
    for (const qid of UNUSED_QUESTION_IDS) {
      for (const id of IDS) expect(activeQuestionIds(id).has(qid)).toBe(false);
    }
  });

  test("los criterios nuevos usan la escala oficial 1 / 0,75 / 0,50 / 0,25 / 0", () => {
    const all = SECTIONS.flatMap((s) => s.groups.flatMap((g) => g.questions));
    const specific = all.filter((q) => /^s0[1-5]_/.test(q.id));
    expect(specific.length).toBe(56);
    for (const q of specific) {
      expect(q.options.map((o) => o.pts)).toEqual([1, 0.75, 0.5, 0.25, 0]);
      expect(q.options.some((o) => o.na)).toBe(false);
    }
  });

  test("cada setup mantiene criterios en todos los bloques con gate", () => {
    for (const id of IDS) {
      for (const sectionId of ["estructura", "zona", "confirmacion", "riesgo", "recorrido"]) {
        const inSection = getQuestionsForSetup(id).filter((q) => q.sectionId === sectionId);
        expect(inSection.length).toBeGreaterThan(0);
        expect(inSection.some((q) => q.id.startsWith(`s0`))).toBe(true);
      }
    }
  });

  test("los pesos, gates y umbral del CORE no cambian con la nueva matriz", () => {
    expect(SECTIONS.reduce((a, s) => a + s.weight, 0)).toBe(100);
    for (const id of IDS) {
      const answers: Record<string, string> = {};
      for (const q of getQuestionsForSetup(id)) {
        const best = [...q.options].sort((a, b) => b.pts - a.pts)[0];
        if (best) answers[q.id] = best.v;
      }
      expect(computeScore(answers, activeQuestionIds(id)).score).toBe(100);
    }
  });
});
