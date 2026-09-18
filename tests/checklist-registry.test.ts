import { describe, expect, it } from "vitest";
import {
  CORE_WEIGHTS,
  POST_TRADE_CORE_WEIGHT,
  PRE_TRADE_CORE_WEIGHT,
  buildRegistry,
  registryBySetup,
  registryIssues,
  registrySummary,
} from "@/lib/checklist-registry";
import { EVALUATION_SETUP_IDS } from "@/lib/checklist";

const records = buildRegistry();

describe("registro técnico maestro ANIKE EJEPIKA", () => {
  it("no presenta problemas de integridad", () => {
    expect(registryIssues(records)).toEqual([]);
  });

  it("registra las 6 matrices con reactivos", () => {
    const bySetup = registryBySetup();
    for (const setupId of EVALUATION_SETUP_IDS) {
      expect(bySetup[setupId].length).toBeGreaterThan(0);
    }
  });

  it("IDs únicos por setup", () => {
    for (const setupId of EVALUATION_SETUP_IDS) {
      const ids = records.filter((r) => r.setup_id === setupId).map((r) => r.question_id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("todo reactivo puntuable COMPLETO usa los 5 factores oficiales en orden descendente", () => {
    const scorable = records.filter(
      (r) =>
        r.status === "COMPLETO" &&
        ["SCORE", "SCORE_VALIDATION", "CONDITIONAL_SCORE", "VALIDATION", "HARD"].includes(r.type),
    );
    expect(scorable.length).toBeGreaterThan(0);
    for (const r of scorable) {
      expect(r.options.map((o) => o.factor)).toEqual([1, 0.75, 0.5, 0.25, 0]);
    }
  });

  it("METADATA / AUTO no se fuerzan a 5 opciones puntuables", () => {
    for (const r of records.filter((r) => r.type === "METADATA" || r.type === "AUTO")) {
      expect(r.internal_weight).toBe(0);
    }
  });

  it("no existe ninguna opción 'No aplica'", () => {
    for (const r of records) {
      expect(r.options.some((o) => o.value === "na" || /no aplica/i.test(o.label))).toBe(false);
    }
  });

  it("los pesos CORE se mantienen intactos", () => {
    expect(CORE_WEIGHTS).toEqual({
      comercio: 5,
      contexto: 10,
      estructura: 25,
      zona: 10,
      confirmacion: 20,
      riesgo: 10,
      recorrido: 5,
      ejecucion: 5,
      disciplina: 5,
      resultados: 5,
    });
    const pre = Object.entries(CORE_WEIGHTS)
      .filter(([id]) => id !== "resultados")
      .reduce((a, [, w]) => a + w, 0);
    expect(pre).toBe(PRE_TRADE_CORE_WEIGHT);
    expect(CORE_WEIGHTS.resultados).toBe(POST_TRADE_CORE_WEIGHT);
  });

  it("aislamiento absoluto por setup", () => {
    const prefixes: Record<string, string> = {
      REVERSION: "s01_",
      CONTINUACION: "s02_",
      RUPTURA_RETESTEO: "s03_",
      ZONA_FIBONACCI: "s04_",
      IMPULSO_PULLBACK: "s05_",
    };
    for (const r of records) {
      for (const [setupId, prefix] of Object.entries(prefixes)) {
        if (r.question_id.startsWith(prefix)) expect(r.setup_id).toBe(setupId);
      }
    }
  });

  it("las variantes condicionales de S03 nunca puntúan a la vez", () => {
    const variants = records.filter(
      (r) => r.type === "CONDITIONAL_SCORE" && r.setup_id === "RUPTURA_RETESTEO",
    );
    expect(variants.length).toBe(2);
    expect(new Set(variants.map((v) => v.condition))).toEqual(
      new Set(["s03_break_variant = MOMENTUM", "s03_break_variant = THREE_BODY"]),
    );
  });

  it("el criterio de giro de S04 sólo aplica con execution_mode = GIRO", () => {
    const giro = records.find((r) => r.question_id === "s04_execution_direction_change");
    expect(giro?.condition).toBe("s04_execution_mode = GIRO");
  });

  it("R:R es AUTO calculado por el motor en todas las matrices", () => {
    for (const setupId of EVALUATION_SETUP_IDS) {
      const auto = records.find((r) => r.setup_id === setupId && r.question_id === "auto_rr");
      expect(auto?.type).toBe("AUTO_VALIDATION");
      expect(auto?.options).toEqual([]);
    }
  });

  it("el tipo de pullback de S05 es METADATA y el pullback profundo no es HARD", () => {
    expect(records.find((r) => r.question_id === "s05_pullback_type")?.type).toBe("METADATA");
    expect(records.find((r) => r.question_id === "s05_deep_pullback")?.type).toBe("VALIDATION");
  });

  it("el resumen cuadra COMPLETO + PENDIENTE_DE_FUENTE", () => {
    const s = registrySummary(records);
    expect(s.complete + s.pending).toBe(s.total);
  });
});
