import { describe, expect, test } from "bun:test";
import {
  activeQuestionIds,
  answersForSetup,
  EVALUATION_SETUP_IDS,
  getActiveQuestionsBySetup,
  pruneInactiveAnswers,
  type EvaluationSetupId,
} from "../src/lib/checklist";
import { computeScore, evaluate } from "../src/lib/scoring";
import { CORE_WEIGHTS } from "../src/lib/checklist-registry";

const PREFIX: Record<string, RegExp> = {
  REVERSION: /^s01_/i,
  CONTINUACION: /^s02_/i,
  RUPTURA_RETESTEO: /^s03_/i,
  ZONA_FIBONACCI: /^s04_/i,
  IMPULSO_PULLBACK: /^s05_/i,
};
const q = (setup: EvaluationSetupId, id: string) =>
  getActiveQuestionsBySetup(setup).find((x) => x.id === id);

describe("aislamiento de setups (especificación maestra)", () => {
  test("cada setup carga exclusivamente su matriz", () => {
    for (const setup of EVALUATION_SETUP_IDS) {
      const ids = getActiveQuestionsBySetup(setup).map((x) => x.id);
      expect(ids.length).toBeGreaterThan(0);
      for (const [other, re] of Object.entries(PREFIX)) {
        if (other === setup) continue;
        expect(ids.some((id) => re.test(id))).toBe(false);
      }
    }
  });
  test("las preguntas antiguas s0x_ no están en ninguna matriz activa", () => {
    for (const setup of EVALUATION_SETUP_IDS)
      for (const x of getActiveQuestionsBySetup(setup)) expect(/^s0[1-5]_/.test(x.id)).toBe(false);
  });
  test("cambiar de setup limpia las respuestas incompatibles", () => {
    const next = answersForSetup({ S01_CTX_01: "excelente", co_instrument: "BTC" }, "CONTINUACION");
    expect(next["S01_CTX_01"]).toBeUndefined();
  });
});

describe("S03 RUPTURA", () => {
  const S = "RUPTURA_RETESTEO" as const;
  test("MOMENTUM y THREE_BODY son METADATA y no puntúan", () => {
    const v = q(S, "S03_BREAK_VARIANT")!;
    expect(v.meta).toBe(true);
    expect(v.options.map((o) => o.v)).toEqual(["MOMENTUM", "THREE_BODY"]);
    expect(v.options.every((o) => o.pts === 0)).toBe(true);
  });
  test("MOMENTUM sólo activa sus preguntas", () => {
    const ids = activeQuestionIds(S, { S03_BREAK_VARIANT: "MOMENTUM" });
    expect(ids.has("S03_STR_02") && ids.has("S03_CONF_01")).toBe(true);
    expect(ids.has("S03_STR_03") || ids.has("S03_CONF_02")).toBe(false);
  });
  test("THREE_BODY sólo activa sus preguntas", () => {
    const ids = activeQuestionIds(S, { S03_BREAK_VARIANT: "THREE_BODY" });
    expect(ids.has("S03_STR_03") && ids.has("S03_CONF_02")).toBe(true);
    expect(ids.has("S03_STR_02") || ids.has("S03_CONF_01")).toBe(false);
  });
  test("cambiar de variante limpia las respuestas incompatibles", () => {
    const a = pruneInactiveAnswers(
      { S03_BREAK_VARIANT: "THREE_BODY", S03_STR_02: "excelente", S03_CONF_01: "si" },
      S,
    );
    expect(a["S03_STR_02"]).toBeUndefined();
    expect(a["S03_CONF_01"]).toBeUndefined();
    const b = pruneInactiveAnswers(
      { S03_BREAK_VARIANT: "MOMENTUM", S03_STR_03: "excelente", S03_CONF_02: "si" },
      S,
    );
    expect(b["S03_STR_03"]).toBeUndefined();
    expect(b["S03_CONF_02"]).toBeUndefined();
  });
  test("las confirmaciones de variante son VALIDATION sin escala", () => {
    for (const id of ["S03_CONF_01", "S03_CONF_02"]) {
      const x = getActiveQuestionsBySetup(S).find((y) => y.id === id)!;
      expect(x.validationOnly).toBe(true);
      expect(x.options.length).toBe(2);
    }
  });
});

describe("S04 ZONA + FIBONACCI", () => {
  const S = "ZONA_FIBONACCI" as const;
  test("ORDEN LÍMITE oculta S04_CONF_02 y GIRO la exige", () => {
    expect(activeQuestionIds(S, { S04_EXEC_MODE: "LIMIT" }).has("S04_CONF_02")).toBe(false);
    expect(activeQuestionIds(S, { S04_EXEC_MODE: "GIRO" }).has("S04_CONF_02")).toBe(true);
  });
  test("GIRO → ORDEN LÍMITE limpia la respuesta incompatible", () => {
    const a = pruneInactiveAnswers({ S04_EXEC_MODE: "LIMIT", S04_CONF_02: "si" }, S);
    expect(a["S04_CONF_02"]).toBeUndefined();
  });
  test("métodos exclusivos ORDEN LÍMITE y GIRO (metadata)", () => {
    const m = q(S, "S04_EXEC_MODE")!;
    expect(m.meta).toBe(true);
    expect(m.options.map((o) => o.label)).toEqual(["ORDEN LÍMITE", "GIRO"]);
  });
  test("S04_DISC_01 es VALIDATION sin score", () => {
    const d = q(S, "S04_DISC_01")!;
    expect(d.validationOnly).toBe(true);
    const base = computeScore({}, activeQuestionIds(S)).breakdown.disciplina.total;
    const withD = getActiveQuestionsBySetup(S).filter(
      (x) => x.sectionId === "disciplina" && !x.meta && !x.validationOnly,
    ).length;
    expect(base).toBe(withD);
  });
  test("0.618 zona, 0.618–0.75 SL, 1.618 extensión (no 1.618R)", () => {
    expect(q(S, "S04_ZONE_02")!.label).toContain("0.618");
    expect(q(S, "S04_RISK_01")!.label).toContain("0.618 y 0.75");
    expect(q(S, "S04_PATH_02")!.label).toContain("extensión 1.618");
    expect(q(S, "S04_PATH_02")!.hint).toContain("no 1.618R");
  });
  test("ZONE_02 y CONF_01 son preguntas distintas en bloques distintos", () => {
    expect(q(S, "S04_ZONE_02")!.sectionId).toBe("zona");
    expect(q(S, "S04_CONF_01")!.sectionId).toBe("confirmacion");
  });
  test("S04_ZONE_04 usa las opciones exactas", () => {
    expect(q(S, "S04_ZONE_04")!.options.map((o) => o.label)).toEqual([
      "Correctamente",
      "Casi completamente",
      "Parcialmente",
      "Débilmente",
      "Se considera un precio exacto",
    ]);
  });
});

describe("S05 IMPULSO + PULLBACK", () => {
  const S = "IMPULSO_PULLBACK" as const;
  test("IP3 en Contexto e IP7 en Estructura como SCORE", () => {
    expect(q(S, "S05_CTX_03")!.sectionId).toBe("contexto");
    const ip7 = q(S, "S05_STR_04")!;
    expect(ip7.sectionId).toBe("estructura");
    expect(ip7.meta).toBeUndefined();
    expect(ip7.options.map((o) => o.pts)).toEqual([1, 0.75, 0.5, 0]);
  });
  test("pullback profundo no genera HARD", () => {
    const answers: Record<string, string> = {};
    for (const x of getActiveQuestionsBySetup(S)) {
      const best = [...x.options].sort((a, b) => b.pts - a.pts)[0];
      if (best) answers[x.id] = best.v;
    }
    answers["S05_STR_04"] = "profundo";
    const d = evaluate({ answers, risk: {}, setup: S });
    expect(d.globalInvalidation).toBe(false);
    expect(d.finalState).not.toBe("NO TRADE");
  });
  test("IP4/IP5, IP8/IP13 e IP18/IP20 son preguntas independientes", () => {
    for (const [a, b] of [
      ["S05_STR_01", "S05_STR_02"],
      ["S05_ZONE_01", "S05_CONF_03"],
      ["S05_EXEC_01", "S05_EXEC_03"],
    ])
      expect(q(S, a!)!.id).not.toBe(q(S, b!)!.id);
  });
});

describe("CORE y score", () => {
  test("CORE = 100, pre-trade 95, post-trade 5", () => {
    const total = Object.values(CORE_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(total).toBe(100);
    expect(total - CORE_WEIGHTS.resultados).toBe(95);
    expect(CORE_WEIGHTS.resultados).toBe(5);
  });
  test("score visible = floor del interno", () => {
    for (const [i, v] of [
      [79.99, 79],
      [80, 80],
      [80.99, 80],
    ])
      expect(Math.floor(i!)).toBe(v!);
  });
  test("una validación no cumplida deja CONDICIONAL (no NO TRADE)", () => {
    const S = "ZONA_FIBONACCI" as const;
    const answers: Record<string, string> = {};
    for (const x of getActiveQuestionsBySetup(S)) {
      const best = [...x.options].sort((a, b) => b.pts - a.pts)[0];
      if (best) answers[x.id] = best.v;
    }
    answers["S04_DISC_01"] = "no";
    const d = evaluate({ answers, risk: {}, setup: S });
    expect(d.finalState).toBe("CONDICIONAL");
  });
});
