import { describe, expect, test } from "bun:test";
import {
  activeQuestionIds,
  answersForSetup,
  belongsExplicitlyToSetup,
  blockComplete,
  COMMON_QUESTION_IDS,
  EVALUATION_SETUPS,
  EVALUATION_SETUP_IDS,
  evaluationBlocks,
  FREE_SETUP,
  getActiveQuestionsBySetup,
  getQuestionsForSetup,
  HISTORICAL_NA_VALUE,
  isMetadataQuestion,
  METADATA_QUESTION_IDS,
  missingActiveAnswers,
  missingInBlock,
  OFFICIAL_SETUP_IDS,
  scorableQuestionIds,
  SECTIONS,
  SECTION_BY_ID,
  SETUP_EXCLUSIVE_QUESTIONS,
  SETUP_MATRIX,
  sectionGroupsForSetup,
  setupLabel,
  UNUSED_QUESTION_IDS,
  validateSetupQuestionMatrix,
  type EvaluationSetupId,
  type OfficialSetupId,
} from "../src/lib/checklist";
import { computeScore } from "../src/lib/scoring";

const OFFICIAL = OFFICIAL_SETUP_IDS as OfficialSetupId[];
const ALL = EVALUATION_SETUP_IDS as EvaluationSetupId[];
const BLOCK_ORDER = ["00", "01", "02", "03", "04", "05", "06", "07", "08"];

function allBaseQuestions() {
  return SECTIONS.flatMap((s) => s.groups.flatMap((g) => g.questions));
}

describe("seis matrices independientes (SETUP LIBRE + S01–S05)", () => {
  test("existen exactamente 6 opciones de evaluación", () => {
    expect(ALL).toEqual(["FREE", ...OFFICIAL]);
    expect(EVALUATION_SETUPS.length).toBe(6);
    expect(EVALUATION_SETUPS[0]!.id).toBe("FREE");
    expect(FREE_SETUP.label).toBe("SETUP LIBRE");
    expect(setupLabel("FREE")).toBe("SETUP LIBRE");
  });

  test("SETUP LIBRE conserva la MATRIZ ORIGINAL completa", () => {
    const free = new Set(SETUP_MATRIX.FREE);
    const exclusive = new Set(OFFICIAL.flatMap((id) => SETUP_EXCLUSIVE_QUESTIONS[id]));
    const legacy = new Set(UNUSED_QUESTION_IDS);
    const original = allBaseQuestions().filter((q) => !exclusive.has(q.id) && !legacy.has(q.id));
    for (const q of original) expect(free.has(q.id)).toBe(true);
    expect(SETUP_MATRIX.FREE.length).toBe(original.length);
  });

  test("cada setup oficial usa exclusivamente su propia matriz", () => {
    for (const id of OFFICIAL) {
      const qs = getActiveQuestionsBySetup(id);
      expect(qs.length).toBeGreaterThan(0);
      expect(qs.every((q) => q.setupId === id)).toBe(true);
      expect(qs.every((q) => SETUP_MATRIX[id].includes(q.id))).toBe(true);
    }
  });

  test("ninguna matriz repite preguntas", () => {
    for (const id of ALL) {
      const ids = SETUP_MATRIX[id];
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  test("los criterios exclusivos de un setup no aparecen en otro", () => {
    for (const id of OFFICIAL) {
      for (const qid of SETUP_EXCLUSIVE_QUESTIONS[id]) {
        expect(activeQuestionIds(id).has(qid)).toBe(true);
        for (const other of ALL.filter((o) => o !== id)) {
          expect(activeQuestionIds(other).has(qid)).toBe(false);
        }
      }
    }
  });

  test("los criterios técnicos de S01–S05 no están en el conjunto común", () => {
    for (const id of OFFICIAL) {
      for (const qid of SETUP_EXCLUSIVE_QUESTIONS[id]) {
        expect(COMMON_QUESTION_IDS.includes(qid)).toBe(false);
      }
    }
  });

  test("SETUP LIBRE no comparte criterios exclusivos con S01–S05", () => {
    const free = activeQuestionIds("FREE");
    for (const id of OFFICIAL) {
      for (const qid of SETUP_EXCLUSIVE_QUESTIONS[id]) expect(free.has(qid)).toBe(false);
    }
  });

  test("no hay fallback: la matriz es explícita y válida", () => {
    expect(validateSetupQuestionMatrix()).toEqual([]);
    // Sólo quedan fuera de toda matriz las preguntas históricas S01–S05 (lectura).
    for (const id of UNUSED_QUESTION_IDS) expect(id).toMatch(/^s0[1-5]_/);
    expect(getQuestionsForSetup("NO_EXISTE")).toEqual([]);
    expect(getQuestionsForSetup(null)).toEqual([]);
    expect(getQuestionsForSetup(undefined)).toEqual([]);
    expect(belongsExplicitlyToSetup("pregunta_inexistente", "REVERSION")).toBe(false);
  });

  test("cada pregunta activa pertenece explícitamente a su matriz", () => {
    for (const id of ALL) {
      expect(getActiveQuestionsBySetup(id).every((q) => belongsExplicitlyToSetup(q.id, id))).toBe(
        true,
      );
    }
  });
});

describe("metadata descriptiva (patrón / nivel Fibonacci)", () => {
  test("las preguntas de metadata no puntúan y están declaradas", () => {
    expect(METADATA_QUESTION_IDS.length).toBeGreaterThan(0);
    for (const qid of METADATA_QUESTION_IDS) expect(isMetadataQuestion(qid)).toBe(true);
    for (const id of ALL) {
      const scorable = scorableQuestionIds(id);
      for (const qid of METADATA_QUESTION_IDS) expect(scorable.has(qid)).toBe(false);
    }
  });

  test("elegir un patrón no aporta puntos por sí mismo", () => {
    const base: Record<string, string> = {};
    for (const q of getActiveQuestionsBySetup("REVERSION")) {
      if (q.meta) continue;
      const best = [...q.options].sort((a, b) => b.pts - a.pts)[0];
      if (best) base[q.id] = best.v;
    }
    const withPattern = { ...base, s01_pattern: "doble_techo" };
    const ids = activeQuestionIds("REVERSION");
    expect(computeScore(withPattern, ids).score).toBe(computeScore(base, ids).score);
  });
});

describe("flujo secuencial de bloques 00 → 08", () => {
  test("cada matriz expone sus bloques en orden y sin huecos", () => {
    for (const id of ALL) {
      const blocks = evaluationBlocks(id);
      expect(blocks.map((b) => b.step)).toEqual(BLOCK_ORDER);
      expect(blocks.every((b) => b.questions.length > 0)).toBe(true);
      for (const b of blocks) {
        expect(b.questions.every((q) => q.sectionId === b.id)).toBe(true);
        expect(b.questions.every((q) => activeQuestionIds(id).has(q.id))).toBe(true);
      }
    }
  });

  test("sin setup no hay bloques ni preguntas", () => {
    expect(evaluationBlocks(null)).toEqual([]);
    expect(evaluationBlocks("NO_EXISTE")).toEqual([]);
    expect(sectionGroupsForSetup(SECTION_BY_ID["estructura"], null)).toEqual([]);
  });

  test("un bloque incompleto no se puede dar por terminado", () => {
    for (const id of ALL) {
      const blocks = evaluationBlocks(id);
      const first = blocks[0]!;
      expect(blockComplete({}, id, first.id)).toBe(false);
      expect(missingInBlock({}, id, first.id).length).toBe(first.questions.length);
      const answers: Record<string, string> = {};
      for (const q of first.questions) answers[q.id] = q.options[0]!.v;
      expect(blockComplete(answers, id, first.id)).toBe(true);
      expect(missingInBlock(answers, id, first.id)).toEqual([]);
    }
  });

  test("responder un bloque no completa los siguientes", () => {
    const answers: Record<string, string> = {};
    const blocks = evaluationBlocks("REVERSION");
    for (const q of blocks[0]!.questions) answers[q.id] = q.options[0]!.v;
    expect(blockComplete(answers, "REVERSION", blocks[0]!.id)).toBe(true);
    for (const b of blocks.slice(1)) {
      expect(blockComplete(answers, "REVERSION", b.id)).toBe(false);
    }
  });

  test("volver atrás conserva las respuestas ya dadas", () => {
    const answers: Record<string, string> = {};
    for (const q of getActiveQuestionsBySetup("ZONA_FIBONACCI")) answers[q.id] = q.options[0]!.v;
    const kept = answersForSetup(answers, "ZONA_FIBONACCI");
    expect(Object.keys(kept).sort()).toEqual(Object.keys(answers).sort());
    expect(missingActiveAnswers(kept, "ZONA_FIBONACCI")).toEqual([]);
  });
});

describe("cambio de setup: sin mezcla entre matrices", () => {
  test("cambiar de matriz descarta las respuestas ajenas y no inyecta valores", () => {
    const s01: Record<string, string> = { s01_exhaustion: "excelente", co_conditions: "si" };
    const s02 = answersForSetup(s01, "CONTINUACION");
    expect("s01_exhaustion" in s02).toBe(false);
    expect(s02["co_conditions"]).toBe("si");
    expect(Object.values(s02)).not.toContain("na");
    expect(answersForSetup({}, "REVERSION")).toEqual({});
    expect(answersForSetup({ co_conditions: "si" }, "NO_EXISTE")).toEqual({});
  });

  test("rotación FREE → S01 → ... → S05 mantiene el aislamiento", () => {
    for (const id of [...ALL, "FREE" as EvaluationSetupId]) {
      const active = getActiveQuestionsBySetup(id);
      expect(active.every((q) => q.setupId === id)).toBe(true);
      expect(active.some((q) => q.setupId !== id)).toBe(false);
    }
  });

  test("el bloque Estructura cambia de contenido al cambiar de matriz", () => {
    const seen = new Set<string>();
    for (const id of ALL) {
      const ids = sectionGroupsForSetup(SECTION_BY_ID["estructura"], id)
        .flatMap((g) => g.questions.map((q) => q.id))
        .join("|");
      expect(seen.has(ids)).toBe(false);
      seen.add(ids);
    }
  });
});

describe("regla ANIKE: no existe No aplica", () => {
  const NA_LABELS = ["no aplica", "n/a", "na", "no disponible"];

  test("ninguna pregunta activa ofrece opción na", () => {
    for (const id of ALL) {
      for (const q of getActiveQuestionsBySetup(id)) {
        expect(q.options.some((o) => o.na)).toBe(false);
        expect(q.options.some((o) => o.v === "na" || o.v === "no_disponible")).toBe(false);
        expect(q.options.some((o) => NA_LABELS.includes(o.label.trim().toLowerCase()))).toBe(false);
        expect(q.options.length).toBeGreaterThan(1);
      }
    }
  });

  test("toda pregunta activa es obligatoria", () => {
    for (const id of ALL) {
      const answers: Record<string, string> = {};
      for (const q of getActiveQuestionsBySetup(id)) answers[q.id] = q.options[0]!.v;
      expect(missingActiveAnswers(answers, id)).toEqual([]);
      const partial = { ...answers };
      const dropped = Object.keys(partial)[0]!;
      delete partial[dropped];
      expect(missingActiveAnswers(partial, id)).toEqual([dropped]);
      expect(missingActiveAnswers({}, id).length).toBeGreaterThan(0);
    }
  });

  test("las respuestas históricas con na se leen sin romper", () => {
    const historical = { ctx_aligned: "si", h1_pattern_change: HISTORICAL_NA_VALUE };
    const score = computeScore(historical);
    expect(Number.isFinite(score.score)).toBe(true);
    expect(score.score).toBeGreaterThanOrEqual(0);
  });
});

describe("el CORE no cambia", () => {
  test("los pesos de los bloques permanecen exactamente iguales", () => {
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

  test("todas las matrices pueden alcanzar 100 con la mejor respuesta", () => {
    for (const id of ALL) {
      const answers: Record<string, string> = {};
      for (const q of getActiveQuestionsBySetup(id)) {
        const best = [...q.options].sort((a, b) => b.pts - a.pts)[0];
        if (best) answers[q.id] = best.v;
      }
      expect(computeScore(answers, activeQuestionIds(id)).score).toBe(100);
    }
  });

  test("los criterios específicos usan la escala oficial 1 / 0,75 / 0,50 / 0,25 / 0", () => {
    for (const id of OFFICIAL) {
      for (const q of getActiveQuestionsBySetup(id)) {
        if (q.meta || q.validationOnly || q.id === "S05_STR_04" || !/^s0[1-5]_/i.test(q.id)) continue;
        expect(q.options.map((o) => o.pts)).toEqual([1, 0.75, 0.5, 0.25, 0]);
      }
    }
  });

  test("cada matriz mantiene criterios puntuables en todos los bloques con gate", () => {
    for (const id of ALL) {
      for (const sectionId of ["estructura", "zona", "confirmacion", "riesgo", "recorrido"]) {
        const inSection = getActiveQuestionsBySetup(id).filter(
          (q) => q.sectionId === sectionId && !q.meta,
        );
        expect(inSection.length).toBeGreaterThan(0);
      }
    }
  });

  test("los identificadores son estables y no dependen del índice", () => {
    for (const id of ALL) {
      const ids = getActiveQuestionsBySetup(id).map((q) => q.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids.every((qid) => /^[A-Za-z0-9_]+$/.test(qid))).toBe(true);
    }
  });
});

