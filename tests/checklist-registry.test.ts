import { describe, expect, it } from "bun:test";
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

  it("el registro está cerrado: 0 PENDIENTE_DE_FUENTE", () => {
    const s = registrySummary(records);
    expect(s.pendingIds).toEqual([]);
    expect(s.pending).toBe(0);
    expect(s.complete).toBe(s.total);
    expect(s.bySourceStatus.PENDIENTE_DE_FUENTE).toBe(0);
    expect(s.bySourceStatus.VERIFIED + s.bySourceStatus.NORMALIZED).toBe(s.total);
  });

  it("cada registro cumple el contrato ampliado", () => {
    for (const r of records) {
      expect(r.setup_code.length).toBeGreaterThan(0);
      expect(r.setup_semantic_name.length).toBeGreaterThan(0);
      expect(r.score_behavior.length).toBeGreaterThan(0);
      expect(r.validation_behavior.length).toBeGreaterThan(0);
      expect(r.hard_behavior.length).toBeGreaterThan(0);
      expect(typeof r.active).toBe("boolean");
      expect(["NONE", "VARIANT", "MODE"]).toContain(r.condition_type);
    }
  });

  it("co_style está registrado como METADATA en los 6 setups, sin peso ni bloqueo", () => {
    for (const setupId of EVALUATION_SETUP_IDS) {
      const r = records.find((x) => x.setup_id === setupId && x.question_id === "co_style");
      expect(r?.type).toBe("METADATA");
      expect(r?.internal_weight).toBe(0);
      expect(r?.block_id).toBe("comercio");
      expect(r?.condition).toBeNull();
      expect(r?.hard_behavior.startsWith("NO_HARD")).toBe(true);
      expect(r?.options.map((o) => o.value)).toEqual(["swing", "day", "scalping"]);
      for (const o of r?.options ?? []) expect(o.factor).toBe(0);
    }
  });

  it("la columna de temporalidad registra rol, ANY para S03 o nada", () => {
    for (const r of records) {
      expect([null, "ANY", "GRANDE", "INTERMEDIA", "PEQUENA"]).toContain(r.role);
      if (r.question_id.startsWith("s03_")) expect(r.role).toBe("ANY");
      if (r.question_id === "co_style") expect(r.role).toBeNull();
      if (r.question_id === "s04_confirm_direction") expect(r.role).toBe("PEQUENA");
      if (r.question_id === "s04_five_stage_sequence") expect(r.role).toBe("INTERMEDIA");
    }
  });

  it("S03 se denomina RUPTURA aunque el ID interno sea RUPTURA_RETESTEO", () => {
    const s03 = records.find((r) => r.setup_id === "RUPTURA_RETESTEO");
    expect(s03?.setup_code).toBe("S03");
    expect(s03?.setup_semantic_name).toBe("RUPTURA");
  });

  it("Resultados es el único bloque post-trade", () => {
    for (const r of records) {
      expect(r.core_target.stage).toBe(r.block_id === "resultados" ? "POST_TRADE" : "PRE_TRADE");
    }
  });

  it("el pullback profundo de S05 nunca bloquea automáticamente", () => {
    const deep = records.find((r) => r.question_id === "s05_deep_pullback");
    expect(deep?.type).toBe("VALIDATION");
    expect(deep?.hard_behavior.startsWith("NO_HARD")).toBe(true);
  });

  it("todo reactivo SCORE/HARD/VALIDATION/CONDITIONAL_SCORE tiene 5 opciones válidas", () => {
    const scoring = ["SCORE", "SCORE_VALIDATION", "CONDITIONAL_SCORE", "VALIDATION", "HARD"];
    for (const r of records.filter((r) => scoring.includes(r.type))) {
      expect(r.options.length).toBe(5);
      for (const o of r.options) {
        expect(o.factor).toBeGreaterThanOrEqual(0);
        expect(o.factor).toBeLessThanOrEqual(1);
      }
    }
  });

  it("METADATA no puntúa: todos sus factores son 0 o descriptivos sin peso", () => {
    for (const r of records.filter((r) => r.type === "METADATA")) {
      expect(r.internal_weight).toBe(0);
    }
  });

  it("selección de setup: S01→solo S01, S02→solo S02, … S05→solo S05", () => {
    const bySetup = registryBySetup();
    const prefixes: Record<string, string> = {
      REVERSION: "s01_",
      CONTINUACION: "s02_",
      RUPTURA_RETESTEO: "s03_",
      ZONA_FIBONACCI: "s04_",
      IMPULSO_PULLBACK: "s05_",
    };
    for (const [setupId, prefix] of Object.entries(prefixes)) {
      const foreign = Object.entries(prefixes)
        .filter(([other]) => other !== setupId)
        .map(([, p]) => p);
      const ids = bySetup[setupId as keyof typeof bySetup].map((r) => r.question_id);
      expect(ids.some((id) => id.startsWith(prefix))).toBe(true);
      for (const id of ids) {
        for (const p of foreign) expect(id.startsWith(p)).toBe(false);
      }
    }
  });
});
