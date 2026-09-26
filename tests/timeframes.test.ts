import { describe, expect, test } from "bun:test";
import {
  DEFAULT_TRADING_STYLE,
  EVALUATION_SETUP_IDS,
  QUESTION_ROLE,
  ROLE_LABEL,
  SECTIONS,
  SECTION_ROLE,
  STYLE_QUESTION_ID,
  STYLE_TIMEFRAMES,
  TIMEFRAMES,
  TIMEFRAME_ROLES,
  TRADING_STYLES,
  activeQuestionIds,
  buildChecklistCatalog,
  applyChecklistOverlay,
  getActiveQuestionsBySetup,
  isAnyTimeframeQuestion,
  questionRole,
  questionTimeframeBadge,
  resolveTradingStyle,
  roleTimeframe,
  styleTimeframes,
  tradingStyleFromAnswers,
  type EvaluationSetupId,
} from "../src/lib/checklist";
import { computeScore } from "../src/lib/scoring";

const ALL = EVALUATION_SETUP_IDS as EvaluationSetupId[];

const questionsOf = (setup: EvaluationSetupId) => getActiveQuestionsBySetup(setup);

describe("multi-timeframe por roles (GRANDE / INTERMEDIA / PEQUEÑA)", () => {
  test("los roles oficiales y las temporalidades por estilo", () => {
    expect(TIMEFRAME_ROLES).toEqual(["GRANDE", "INTERMEDIA", "PEQUENA"]);
    expect(TRADING_STYLES).toEqual(["swing", "day", "scalping"]);
    expect(TIMEFRAMES).toEqual(["1W", "1D", "1H", "5M", "1M"]);
    expect(styleTimeframes("swing")).toEqual(["1W", "1D", "1H"]);
    expect(styleTimeframes("day")).toEqual(["1D", "1H", "5M"]);
    expect(styleTimeframes("scalping")).toEqual(["1H", "5M", "1M"]);
    expect(roleTimeframe("GRANDE", "swing")).toBe("1W");
    expect(roleTimeframe("INTERMEDIA", "day")).toBe("1H");
    expect(roleTimeframe("PEQUENA", "scalping")).toBe("1M");
  });

  test("el estilo por defecto (evaluaciones históricas) es day trading 1D/1H/5M", () => {
    expect(DEFAULT_TRADING_STYLE).toBe("day");
    expect(STYLE_TIMEFRAMES[DEFAULT_TRADING_STYLE]).toEqual({
      GRANDE: "1D",
      INTERMEDIA: "1H",
      PEQUENA: "5M",
    });
    expect(tradingStyleFromAnswers({})).toBeUndefined();
    expect(tradingStyleFromAnswers(null)).toBeUndefined();
    expect(tradingStyleFromAnswers({ [STYLE_QUESTION_ID]: "swing" })).toBe("swing");
    expect(tradingStyleFromAnswers({ [STYLE_QUESTION_ID]: "inventado" })).toBeUndefined();
    expect(resolveTradingStyle(undefined)).toBe("day");
    expect(resolveTradingStyle("scalping")).toBe("scalping");
  });

  test("co_style existe en los 6 setups, es metadata y no puntúa", () => {
    for (const setup of ALL) {
      const q = questionsOf(setup).find((x) => x.id === STYLE_QUESTION_ID);
      expect(q).toBeDefined();
      expect(q?.meta).toBe(true);
      expect(q?.options.map((o) => o.v)).toEqual(["swing", "day", "scalping"]);
      for (const o of q?.options ?? []) expect(o.pts).toBe(0);
    }
  });

  test("el rol sale del bloque CORE salvo excepción declarada por pregunta", () => {
    for (const section of SECTIONS) {
      for (const q of section.groups.flatMap((g) => g.questions)) {
        if (isAnyTimeframeQuestion(q.id)) {
          expect(q.role).toBeUndefined();
          expect(q.anyTimeframe).toBe(true);
          continue;
        }
        const expected = QUESTION_ROLE[q.id] ?? SECTION_ROLE[section.id];
        expect(q.role).toBe(expected);
        expect(questionRole(q.id, section.id)).toBe(expected);
      }
    }
  });

  test("excepciones de S01, S02 y S04", () => {
    expect(questionRole("s01_pattern_confirmed", "confirmacion")).toBe("INTERMEDIA");
    expect(questionRole("s02_pattern_confirmed", "confirmacion")).toBe("INTERMEDIA");
    expect(questionRole("s04_price_reacting", "zona")).toBe("INTERMEDIA");
    expect(questionRole("s04_confirm_direction", "confirmacion")).toBe("PEQUENA");
    expect(questionRole("s04_not_only_fibo", "confirmacion")).toBe("PEQUENA");
    expect(questionRole("s04_execution_mode", "ejecucion")).toBe("PEQUENA");
    expect(questionRole("s04_execution_direction_change", "ejecucion")).toBe("PEQUENA");
    expect(questionRole("s04_five_stage_sequence", "estructura")).toBe("INTERMEDIA");
  });

  test("S03 (RUPTURA) no lleva rol y trabaja en cualquiera de las tres temporalidades", () => {
    const s03 = questionsOf("RUPTURA_RETESTEO").filter((q) => /^s03_/i.test(q.id));
    expect(s03.length).toBeGreaterThan(0);
    for (const q of s03) {
      expect(q.role).toBeUndefined();
      expect(q.anyTimeframe).toBe(true);
      expect(questionRole(q.id, "estructura")).toBeUndefined();
      expect(questionTimeframeBadge(q, "day")).toBe(
        "Temporalidad de trabajo: cualquiera de 1D · 1H · 5M",
      );
      expect(questionTimeframeBadge(q, "scalping")).toBe(
        "Temporalidad de trabajo: cualquiera de 1H · 5M · 1M",
      );
      // Sin estilo elegido se asume day trading para el badge informativo.
      expect(questionTimeframeBadge(q)).toBe("Temporalidad de trabajo: cualquiera de 1D · 1H · 5M");
    }
  });

  test("el badge muestra rol + temporalidad resuelta y sólo el rol sin estilo", () => {
    const q = { id: "ctx_direction", role: "GRANDE" as const };
    expect(questionTimeframeBadge(q)).toBe(ROLE_LABEL.GRANDE);
    expect(questionTimeframeBadge(q, "swing")).toBe(`${ROLE_LABEL.GRANDE} · 1W`);
    expect(questionTimeframeBadge(q, "day")).toBe(`${ROLE_LABEL.GRANDE} · 1D`);
    expect(questionTimeframeBadge(q, "scalping")).toBe(`${ROLE_LABEL.GRANDE} · 1H`);
    // Metadata sin rol no muestra badge.
    expect(questionTimeframeBadge({ id: STYLE_QUESTION_ID })).toBeUndefined();
  });

  test("SETUP LIBRE conserva roles por bloque sin exigir las tres temporalidades", () => {
    const free = questionsOf("FREE");
    const roles = new Set(free.map((q) => q.role).filter(Boolean));
    expect(roles.size).toBeGreaterThan(0);
    expect(questionRole("h1_zone", "zona")).toBe("INTERMEDIA");
    expect(questionRole("m5_signal", "confirmacion")).toBe("PEQUENA");
    expect(activeQuestionIds("FREE").has(STYLE_QUESTION_ID)).toBe(true);
  });

  test("los textos de SETUP LIBRE no llevan temporalidad fija escrita a mano", () => {
    for (const setup of ALL) {
      for (const q of questionsOf(setup)) {
        if (q.id === STYLE_QUESTION_ID) continue;
        expect(/\b(1D|1H|5M|1W|1M)\b/.test(q.label)).toBe(false);
      }
    }
    for (const section of SECTIONS) {
      for (const g of section.groups) {
        if (g.title) expect(/\b(1D|1H|5M|1W|1M)\b/.test(g.title)).toBe(false);
      }
    }
  });

  test("el rol no duplica preguntas ni cambia el CORE: respuestas óptimas siguen dando 100", () => {
    for (const id of ALL) {
      const ids = questionsOf(id).map((q) => q.id);
      expect(new Set(ids).size).toBe(ids.length);
      const answers: Record<string, string> = {};
      for (const q of questionsOf(id)) {
        const best = [...q.options].sort((a, b) => b.pts - a.pts)[0];
        if (best) answers[q.id] = best.v;
      }
      expect(computeScore(answers, activeQuestionIds(id)).score).toBe(100);
    }
  });

  test("el estilo declarado no altera el score", () => {
    const answers: Record<string, string> = {};
    for (const q of questionsOf("FREE")) {
      const best = [...q.options].sort((a, b) => b.pts - a.pts)[0];
      if (best) answers[q.id] = best.v;
    }
    const ids = activeQuestionIds("FREE");
    const base = computeScore(answers, ids).score;
    for (const style of TRADING_STYLES) {
      expect(computeScore({ ...answers, [STYLE_QUESTION_ID]: style }, ids).score).toBe(base);
    }
  });

  test("una pregunta añadida por el editor hereda el rol de su bloque", () => {
    const catalog = buildChecklistCatalog({
      version: 1,
      edits: {},
      disabled: [],
      added: [
        {
          id: "custom_tf",
          sectionId: "confirmacion",
          owner: "COMMON",
          label: "¿Hay confirmación en la temporalidad de ejecución?",
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
    expect(q?.role).toBe("PEQUENA");
    applyChecklistOverlay(null);
  });
});
