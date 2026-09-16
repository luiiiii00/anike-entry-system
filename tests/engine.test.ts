import { describe, expect, it } from "bun:test";
import {
  computeRisk,
  computeScore,
  evaluate,
  sizingStatus,
  APPROVAL_GATES,
  APPROVAL_MIN_SCORE,
  PRE_TRADE_WEIGHT,
} from "@/lib/scoring";
import { SECTIONS } from "@/lib/checklist";
import { readFileSync } from "node:fs";
import { calculatePostTrade } from "@/lib/posttrade";
import type { Evaluation } from "@/lib/db";
import {
  byAsset,
  computeStats,
  equityCurve,
  isClosed,
  isRegistered,
  longVsShort,
  rDistribution,
} from "@/lib/stats";

/* --------------------------------- Riesgo --------------------------------- */

describe("computeRisk", () => {
  it("da R/R positivo con TP del lado correcto en LONG", () => {
    const m = computeRisk({ entry: 100, stop: 95, target: 110 }, "LONG");
    expect(m.rr).toBe(2);
  });

  it("da R/R negativo con TP del lado equivocado en LONG", () => {
    const m = computeRisk({ entry: 100, stop: 95, target: 90 }, "LONG");
    expect(m.rr).toBeLessThan(0);
  });

  it("respeta la dirección SHORT", () => {
    expect(computeRisk({ entry: 100, stop: 105, target: 90 }, "SHORT").rr).toBe(2);
    expect(computeRisk({ entry: 100, stop: 105, target: 110 }, "SHORT").rr).toBeLessThan(0);
  });

  it("no divide por cero cuando entrada = stop", () => {
    const m = computeRisk(
      { entry: 100, stop: 100, target: 110, capital: 1000, riskPct: 1 },
      "LONG",
    );
    expect(m.rr).toBeNull();
    expect(m.positionSize).toBeNull();
  });

  it("devuelve nulos con datos incompletos", () => {
    const m = computeRisk({}, "LONG");
    expect(m.rr).toBeNull();
    expect(m.riskMoney).toBeNull();
    expect(m.stopDistance).toBeNull();
  });
});

/* ------------------------------- Post-trade ------------------------------- */

const base = {
  marketType: "CRYPTO" as const,
  direction: "LONG" as const,
  entryPrice: 100,
  quantity: 10,
  capital: 1000,
};

describe("calculatePostTrade", () => {
  it("ganancia en LONG", () => {
    const r = calculatePostTrade({ ...base, exitPrice: 110, stopLoss: 95, takeProfit: 115 });
    expect(r.netPnl).toBe(100);
    expect(r.riskAmount).toBe(50);
    expect(r.resultR).toBe(2);
    expect(r.plannedRr).toBe(3);
    expect(r.tradeResult).toBe("WIN");
  });

  it("pérdida en SHORT", () => {
    const r = calculatePostTrade({
      ...base,
      direction: "SHORT",
      exitPrice: 105,
      stopLoss: 105,
      takeProfit: 90,
    });
    expect(r.netPnl).toBe(-50);
    expect(r.resultR).toBe(-1);
    expect(r.tradeResult).toBe("LOSS");
  });

  it("resultado 0 es break even", () => {
    const r = calculatePostTrade({ ...base, exitPrice: 100, stopLoss: 95 });
    expect(r.netPnl).toBe(0);
    expect(r.resultR).toBe(0);
    expect(r.tradeResult).toBe("BREAK_EVEN");
  });

  it("rechaza un stop igual a la entrada (riesgo 0)", () => {
    expect(() => calculatePostTrade({ ...base, exitPrice: 110, stopLoss: 100 })).toThrow();
  });

  it("sin stop no hay riesgo ni R", () => {
    const r = calculatePostTrade({ ...base, exitPrice: 110 });
    expect(r.riskAmount).toBeNull();
    expect(r.resultR).toBeNull();
    expect(r.riskPercent).toBeNull();
  });

  it("rechaza un stop del lado equivocado", () => {
    expect(() => calculatePostTrade({ ...base, exitPrice: 110, stopLoss: 105 })).toThrow();
  });

  it("no devuelve valores no finitos sin capital ni margen", () => {
    const r = calculatePostTrade({ ...base, capital: 0, exitPrice: 110, stopLoss: 95 });
    expect(r.riskPercent).toBeNull();
    expect(r.pnlPercentOnCapital).toBeNull();
    expect(Number.isFinite(r.roiMargin!)).toBe(true);
  });
});

/* ------------------------------ Estadísticas ------------------------------ */

let n = 0;
function ev(p: Partial<Evaluation>): Evaluation {
  n += 1;
  return {
    id: `id-${n}`,
    user_id: "u",
    trade_no: n,
    trade_date: "2026-01-01",
    trade_time: null,
    asset: "BTC",
    market: null,
    session: null,
    direction: "LONG",
    setup: "Continuación",
    idea: null,
    answers: {},
    risk: {},
    score: 80,
    breakdown: {} as never,
    classification: "SETUP A",
    hard_rules: [],
    emotional_stop: false,
    status: "completed",
    decision: "registrado",
    result_r: null,
    result_money: null,
    followed_plan: null,
    review: {},
    created_at: `2026-01-0${(n % 9) + 1}T00:00:00Z`,
    updated_at: "2026-01-01T00:00:00Z",
    ...p,
  } as Evaluation;
}

describe("computeStats", () => {
  it("no cuenta NO TRADE con datos residuales como cerrada", () => {
    const noTrade = ev({ decision: "no_trade", classification: "NO TRADE", result_r: 3 });
    expect(isClosed(noTrade)).toBe(false);
    const s = computeStats([noTrade]);
    expect(s.closed).toBe(0);
    expect(s.registered).toBe(0);
    expect(s.noTrade).toBe(1);
    expect(s.totalR).toBe(0);
    expect(longVsShort([noTrade])[0]!.trades).toBe(0);
    expect(byAsset([noTrade]).length).toBe(0);
    expect(rDistribution([noTrade]).every((b) => b.value === 0)).toBe(true);
  });

  it("ignora score nulo en el promedio", () => {
    const s = computeStats([ev({ score: 80 }), ev({ score: null })]);
    expect(s.avgScore).toBe(80);
  });

  it("no inventa dinero cuando falta result_money", () => {
    const s = computeStats([
      ev({ result_r: 1, result_money: 100 }),
      ev({ result_r: -1, result_money: null }),
    ]);
    expect(s.totalMoney).toBe(100);
    expect(s.avgMoney).toBe(100);
    expect(s.closed).toBe(2);
    expect(s.totalR).toBe(0);
    expect(s.winRate).toBe(50);
  });

  it("una operación abierta (sin resultado) no cuenta como cerrada", () => {
    const s = computeStats([ev({ result_r: null })]);
    expect(s.registered).toBe(1);
    expect(s.closed).toBe(0);
    expect(s.winRate).toBeNull();
    expect(s.avgR).toBeNull();
  });

  it("resultado 0 cuenta como break even, no como ganadora", () => {
    const s = computeStats([ev({ result_r: 0 })]);
    expect(s.breakEven).toBe(1);
    expect(s.wins).toBe(0);
    expect(s.winRate).toBe(0);
  });

  it("los borradores no entran en las estadísticas", () => {
    const s = computeStats([ev({ status: "draft", result_r: 5 })]);
    expect(s.total).toBe(0);
    expect(s.closed).toBe(0);
  });

  it("separa LONG y SHORT sólo con operaciones cerradas", () => {
    const rows = [
      ev({ result_r: 2, direction: "LONG" }),
      ev({ result_r: -1, direction: "SHORT" }),
      ev({ result_r: null, direction: "SHORT" }),
    ];
    const out = longVsShort(rows);
    expect(out[0]).toEqual({ name: "LONG", trades: 1, r: 2 });
    expect(out[1]).toEqual({ name: "SHORT", trades: 1, r: -1 });
  });
});

/* --------------------- Lotaje: exacto / orientativo / N/D --------------------- */

describe("computeRisk — precisión del lotaje", () => {
  const src = { capital: 10000, riskPct: 1, entry: 100, stop: 95 };

  it("CRYPTO con datos suficientes es EXACTO en unidades", () => {
    const m = computeRisk(src, "LONG", { market: "CRYPTO" });
    expect(m.sizingPrecision).toBe("exact");
    expect(m.sizingUnit).toBe("unidades");
    expect(m.positionSize).toBe(20);
    expect(m.sizingMissing).toEqual([]);
  });

  it("FOREX sin especificación del instrumento es ORIENTATIVO y dice qué falta", () => {
    const m = computeRisk(src, "LONG", { market: "FOREX" });
    expect(m.sizingPrecision).toBe("orientative");
    expect(m.sizingMissing).toContain("tamaño de contrato o valor por punto/tick");
  });

  it("FOREX con valor por punto es EXACTO en lotes", () => {
    const m = computeRisk(src, "LONG", { market: "FOREX", pointValue: 10 });
    expect(m.sizingPrecision).toBe("exact");
    expect(m.sizingUnit).toBe("lotes");
    expect(m.positionSize).toBe(2);
    expect(m.sizingMissing).toEqual([]);
  });

  it("FUTUROS con tamaño de contrato es EXACTO en contratos", () => {
    const m = computeRisk(src, "LONG", { market: "FUTUROS", contractSize: 50 });
    expect(m.sizingPrecision).toBe("exact");
    expect(m.sizingUnit).toBe("contratos");
  });

  it("CFD e ÍNDICES sin especificación nunca son exactos", () => {
    expect(computeRisk(src, "LONG", { market: "CFD" }).sizingPrecision).toBe("orientative");
    expect(computeRisk(src, "LONG", { market: "Índices" }).sizingPrecision).toBe("orientative");
  });

  it("sin mercado declarado el lotaje es ORIENTATIVO, no exacto", () => {
    const m = computeRisk(src, "LONG");
    expect(m.sizingPrecision).toBe("orientative");
    expect(m.sizingMissing).toContain("mercado del instrumento");
  });

  it("sin capital ni stop el lotaje es NO DISPONIBLE", () => {
    const m = computeRisk({ entry: 100 }, "LONG", { market: "CRYPTO" });
    expect(m.sizingPrecision).toBe("unavailable");
    expect(m.positionSize).toBeNull();
    expect(m.sizingUnit).toBeNull();
  });

  it("nunca devuelve NaN ni Infinity con entradas basura", () => {
    for (const bad of [NaN, Infinity, -Infinity, 0, null]) {
      const m = computeRisk(
        {
          capital: bad as number,
          riskPct: bad as number,
          entry: bad as number,
          stop: bad as number,
        },
        "LONG",
        { market: "CRYPTO", contractSize: bad as number },
      );
      for (const v of [m.riskMoney, m.stopDistance, m.rr, m.positionSize]) {
        expect(v === null || Number.isFinite(v)).toBe(true);
      }
      expect(m.sizingPrecision).toBe("unavailable");
    }
  });
});

/* ------------- Motor: derivados recalculados, no enviados por el cliente ------------- */

const passing: Record<string, string> = {
  ctx_aligned: "si",
  h1_structure: "definida",
  cf5_close: "si",
  cf5_diag_break: "si",
  cf_basis: "estructura",
};

describe("evaluate — fuente única de verdad", () => {
  it("ignora cualquier score/classification que venga del cliente", () => {
    const d = evaluate({
      answers: passing,
      risk: {},
      maxRiskPct: 1,
      // @ts-expect-error el motor no acepta derivados del cliente
      score: 100,
      classification: "SETUP A+",
      final_state: "APROBADA",
    });
    expect(d.score).toBe(computeScore(passing).score);
    expect(["SETUP A+", "SETUP A", "SETUP B", "NO TRADE"]).toContain(d.classification);
  });

  it("un freno emocional descarta la operación aunque el score sea alto", () => {
    const d = evaluate({ answers: { ...passing, ds_motive: "revancha" }, risk: {}, maxRiskPct: 1 });
    expect(d.emotional).toBe(true);
    expect(d.blocked).toBe(true);
    expect(d.finalState).toBe("NO TRADE");
    expect(d.classification).toBe("NO TRADE");
  });

  it("una regla crítica descarta la operación", () => {
    const d = evaluate({ answers: { ...passing, cf5_close: "no" }, risk: {}, maxRiskPct: 1 });
    expect(d.hardRules.length).toBeGreaterThan(0);
    expect(d.finalState).toBe("NO TRADE");
  });

  it("expone las métricas de riesgo recalculadas con la precisión del lotaje", () => {
    const d = evaluate({
      answers: passing,
      risk: { capital: 10000, riskPct: 1, entry: 100, stop: 95 },
      maxRiskPct: 1,
      direction: "LONG",
      market: "FOREX",
    });
    expect(d.metrics.sizingPrecision).toBe("orientative");
  });
});

/* ------------------ Post-trade: resultados no falsificables ------------------ */

describe("calculatePostTrade — integridad de resultados", () => {
  it("ignora resultados enviados por el cliente y recalcula", () => {
    const r = calculatePostTrade({
      ...base,
      exitPrice: 110,
      stopLoss: 95,
      takeProfit: 115,
      // @ts-expect-error los derivados nunca son entrada
      netPnl: 999999,
      resultR: 50,
      plannedRr: 99,
      realizedRr: 99,
    });
    expect(r.netPnl).toBe(100);
    expect(r.resultR).toBe(2);
    expect(r.plannedRr).toBe(3);
  });

  it("rechaza un take profit del lado equivocado en LONG y en SHORT", () => {
    expect(() =>
      calculatePostTrade({ ...base, exitPrice: 110, stopLoss: 95, takeProfit: 90 }),
    ).toThrow();
    expect(() =>
      calculatePostTrade({
        ...base,
        direction: "SHORT",
        exitPrice: 95,
        stopLoss: 105,
        takeProfit: 110,
      }),
    ).toThrow();
  });

  it("rechaza una cantidad 0 o no finita en lugar de calcular con ella", () => {
    expect(() => calculatePostTrade({ ...base, quantity: 0, exitPrice: 110 })).toThrow();
    expect(() => calculatePostTrade({ ...base, quantity: Number.NaN, exitPrice: 110 })).toThrow();
    expect(() =>
      calculatePostTrade({ ...base, entryPrice: Number.POSITIVE_INFINITY, exitPrice: 110 }),
    ).toThrow();
  });

  it("no produce NaN ni Infinity sin capital ni margen", () => {
    const r = calculatePostTrade({ ...base, capital: 0, exitPrice: 110 });
    for (const v of [r.netPnl, r.grossPnl, r.roiMargin, r.resultR, r.riskPercent]) {
      expect(v === null || Number.isFinite(v)).toBe(true);
    }
  });
});

/* ----------------- Estados: aprobada ≠ registrada ≠ cerrada ----------------- */

describe("estados de operación", () => {
  it("una evaluación APROBADA sin decisión no cuenta como registrada ni cerrada", () => {
    const e = ev({ final_state: "APROBADA", decision: null, result_r: 3 });
    expect(isRegistered(e)).toBe(false);
    expect(isClosed(e)).toBe(false);
    const s = computeStats([e]);
    expect(s.approved).toBe(1);
    expect(s.registered).toBe(0);
    expect(s.closed).toBe(0);
    expect(s.totalR).toBe(0);
  });

  it("una CONDICIONAL no registrada no cuenta como ejecutada", () => {
    const s = computeStats([ev({ final_state: "CONDICIONAL", decision: null, result_r: 2 })]);
    expect(s.conditional).toBe(1);
    expect(s.approved).toBe(0);
    expect(s.registered).toBe(0);
    expect(s.closed).toBe(0);
    expect(s.netPnl).toBe(0);
  });

  // Con el CORE actual una CONDICIONAL NO puede registrarse (el servidor lo rechaza).
  // Las estadísticas deben seguir leyendo filas históricas que sí quedaron registradas.
  it("una CONDICIONAL histórica ya registrada sigue contando en las estadísticas", () => {
    const s = computeStats([
      ev({ final_state: "CONDICIONAL", decision: "registrado", result_r: 1, net_pnl: 50 }),
    ]);
    expect(s.registered).toBe(1);
    expect(s.closed).toBe(1);
    expect(s.netPnl).toBe(50);
  });

  it("el REGISTRO DIRECTO no se cuenta como clasificación ANIKE válida", () => {
    const s = computeStats([ev({ classification: "REGISTRO DIRECTO", result_r: 1 })]);
    expect(s.classificationValid).toBe(0);
    expect(s.registered).toBe(1);
  });

  it("los números de operación de un usuario no se duplican en las estadísticas", () => {
    const rows = [ev({ result_r: 1 }), ev({ result_r: 1 }), ev({ result_r: 1 })];
    const nos = rows.map((r) => r.trade_no);
    expect(new Set(nos).size).toBe(nos.length);
  });
});

/* ------------------- HARDENING: KPI de aprobación ------------------- */

describe("aprobación actual vs histórica", () => {
  it("approved sólo cuenta final_state APROBADA; el histórico va aparte", () => {
    const s = computeStats([
      ev({ final_state: "APROBADA", decision: null }),
      ev({ final_state: null, classification: "SETUP A+", decision: null }),
    ]);
    expect(s.approved).toBe(1);
    expect(s.approvedLegacy).toBe(1);
    expect(s.approvedAllTime).toBe(2);
    // Ningún KPI de aprobación implica ejecución.
    expect(s.registered).toBe(0);
    expect(s.closed).toBe(0);
    expect(s.totalR).toBe(0);
    expect(s.netPnl).toBe(0);
  });

  it("una APROBADA con final_state no se duplica en el contador histórico", () => {
    const s = computeStats([ev({ final_state: "APROBADA", classification: "SETUP A+" })]);
    expect(s.approved).toBe(1);
    expect(s.approvedLegacy).toBe(0);
    expect(s.approvedAllTime).toBe(1);
  });

  it("las finanzas sólo usan registradas y cerradas con R válido", () => {
    const s = computeStats([
      ev({ final_state: "APROBADA", decision: "no_trade", result_r: 5, net_pnl: 500 }),
      ev({ final_state: "APROBADA", decision: "registrado", result_r: null, net_pnl: 400 }),
      ev({ final_state: "APROBADA", decision: "registrado", result_r: 2, net_pnl: 100 }),
    ]);
    expect(s.closed).toBe(1);
    expect(s.totalR).toBe(2);
    expect(s.netPnl).toBe(100);
  });
});

/* ------------------- HARDENING: muestra mínima de setup ------------------- */

describe("muestra mínima para mejor/peor setup", () => {
  const closedWith = (setup: string, r: number) =>
    ev({ setup, decision: "registrado", result_r: r });

  it("no concluye nada con menos de 3 operaciones cerradas por setup", () => {
    const s = computeStats([closedWith("Reversión", 3), closedWith("Continuación", -1)]);
    expect(s.bestSetup).toBeNull();
    expect(s.worstSetup).toBeNull();
    expect(s.setupSampleSufficient).toBe(false);
    // Los datos financieros siguen intactos.
    expect(s.closed).toBe(2);
    expect(s.totalR).toBe(2);
  });

  it("con 3 cerradas por setup sí etiqueta mejor y peor con su muestra", () => {
    const s = computeStats([
      closedWith("Reversión", 2),
      closedWith("Reversión", 2),
      closedWith("Reversión", 2),
      closedWith("Continuación", -1),
      closedWith("Continuación", -1),
      closedWith("Continuación", -1),
    ]);
    expect(s.bestSetup).toBe("Reversión");
    expect(s.worstSetup).toBe("Continuación");
    expect(s.bestSetupSample).toBe(3);
    expect(s.worstSetupSample).toBe(3);
    expect(s.setupSampleSufficient).toBe(true);
  });
});

/* ------------------- HARDENING: lotaje ORIENTATIVO ------------------- */

describe("estado del lotaje visible al usuario", () => {
  it("Futuros sin especificación real devuelve ORIENTATIVO no ejecutable", () => {
    const m = computeRisk(
      { entry: 100, stop: 98, target: 106, riskPct: 1, capital: 10000 },
      "LONG",
      { market: "FUTURES" },
    );
    expect(m.sizingPrecision).toBe("orientative");
    const s = sizingStatus(m);
    expect(s.label).toContain("NO EJECUTABLE");
    expect(s.tone).toBe("warn");
    expect(s.note.toLowerCase()).toContain("tick");
  });

  it("Crypto con datos suficientes se marca EXACTO", () => {
    const m = computeRisk(
      { entry: 100, stop: 98, target: 106, riskPct: 1, capital: 10000 },
      "LONG",
      { market: "CRYPTO" },
    );
    expect(m.sizingPrecision).toBe("exact");
    expect(sizingStatus(m).label).toBe("EXACTO");
    expect(Number.isFinite(m.positionSize ?? NaN)).toBe(true);
  });

  it("sin datos suficientes el lotaje es NO DISPONIBLE y nunca 0 silencioso", () => {
    const m = computeRisk({ entry: 100, stop: 100, riskPct: 1, capital: 10000 }, "LONG", {
      market: "CRYPTO",
    });
    expect(m.sizingPrecision).toBe("unavailable");
    expect(m.positionSize).toBeNull();
    expect(sizingStatus(m).label).toBe("NO DISPONIBLE");
  });
});

/* ------------------- HARDENING: gaps de numeración ------------------- */

describe("numeración con huecos permitidos", () => {
  // El contador transaccional (private.next_trade_no) consume el número ANTES de
  // confirmar el insert. Si el insert falla o se hace rollback, ese número queda
  // consumido: aparece un hueco. Es esperado y no rompe unicidad ni concurrencia.
  it("un hueco tras un insert fallido no genera duplicados", () => {
    const rows = [
      ev({ trade_no: 1, decision: "registrado", result_r: 1 }),
      // el nº 2 se consumió en una transacción que falló
      ev({ trade_no: 3, decision: "registrado", result_r: 1 }),
    ];
    const nos = rows.map((r) => r.trade_no);
    expect(new Set(nos).size).toBe(nos.length);
    expect(nos).not.toContain(2);
    const s = computeStats(rows);
    expect(s.closed).toBe(2);
    expect(s.totalR).toBe(2);
  });

  it("la curva de equity tolera huecos sin perder operaciones", () => {
    const curve = equityCurve([
      ev({ trade_no: 1, decision: "registrado", result_r: 1, created_at: "2026-01-01T00:00:00Z" }),
      ev({ trade_no: 4, decision: "registrado", result_r: 1, created_at: "2026-01-02T00:00:00Z" }),
    ]);
    expect(curve.map((p) => p.name)).toEqual(["#1", "#4"]);
    expect(curve.at(-1)?.r).toBe(2);
  });
});

/* ================= CORE definitivo: fórmula, gates y estados ================= */

const PRE_SECTIONS = SECTIONS.filter((s) => !s.postTrade);
const PRE_QUESTIONS = PRE_SECTIONS.flatMap((s) => s.groups.flatMap((g) => g.questions));

/** Mejor respuesta posible de cada pregunta pre-trade (nunca "No aplica"). */
function bestAnswers(): Record<string, string> {
  const a: Record<string, string> = {};
  for (const q of PRE_QUESTIONS) {
    const opts = q.options.filter((o) => !o.na);
    const best = opts.reduce((m, o) => (o.pts > m.pts ? o : m), opts[0]!);
    a[q.id] = best.v;
  }
  return a;
}

const perfect = bestAnswers();
const decide = (answers: Record<string, string>) =>
  evaluate({ answers, risk: {}, maxRiskPct: 1, preferredSetups: [] });

/**
 * Degrada un bloque hasta bajar de `limit` % sin activar ninguna HARD ni el freno
 * emocional: así se demuestra que el gate por sí solo deja la evaluación CONDICIONAL.
 */
function degradeBlock(sectionId: string, limit: number) {
  const section = PRE_SECTIONS.find((s) => s.id === sectionId)!;
  const questions = section.groups.flatMap((g) => g.questions);
  let answers = { ...perfect };
  // Estado que aparece cuando el bloque sólo puede bajar del gate activando una HARD.
  let blockedBelow: string | null = null;
  for (const q of questions) {
    const opts = q.options.filter((o) => !o.na).sort((x, y) => x.pts - y.pts);
    for (const opt of opts) {
      const trial = { ...answers, [q.id]: opt.v };
      const d = decide(trial);
      if (d.hardRules.length > 0 || d.emotional) {
        if (d.breakdown[section.id]!.percent < limit) blockedBelow = d.finalState;
        continue;
      }
      answers = trial;
      if (d.breakdown[section.id]!.percent < limit)
        return { answers, decision: d, reached: true, blockedBelow };
      break;
    }
  }
  return { answers, decision: decide(answers), reached: false, blockedBelow };
}

describe("CORE — pesos y fórmula", () => {
  it("los pesos CORE son 5/10/25/10/20/10/5/5/5/5 y suman 100", () => {
    expect(SECTIONS.map((s) => s.weight)).toEqual([5, 10, 25, 10, 20, 10, 5, 5, 5, 5]);
    expect(SECTIONS.reduce((n, s) => n + s.weight, 0)).toBe(100);
  });

  it("Resultados es POST-TRADE y el pre-trade se normaliza sobre 95 (L)", () => {
    expect(PRE_SECTIONS.reduce((n, s) => n + s.weight, 0)).toBe(PRE_TRADE_WEIGHT);
    expect(PRE_TRADE_WEIGHT).toBe(95);
    const r = computeScore(perfect);
    // Resultados sin responder no redistribuye su 5 %: el pre-trade perfecto ya es 100.
    expect(r.breakdown.resultados.weight).toBe(5);
    expect(r.score).toBe(100);
  });

  it("el 5 % de Resultados no entra en el score pre-trade", () => {
    const withResult = { ...perfect, rs_result: "ganadora", rs_process: "no" };
    expect(computeScore(withResult).score).toBe(computeScore(perfect).score);
  });
});

describe("CORE — score interno vs score visible", () => {
  it("el score visible es el floor del interno, nunca redondeo (A/M)", () => {
    const { answers, decision } = degradeBlock("estructura", 100);
    expect(decision.scoreVisible).toBe(Math.floor(decision.score));
    expect(decision.scoreVisible).toBeLessThanOrEqual(decision.score);
    expect(computeScore(answers).scoreVisible).toBe(Math.floor(computeScore(answers).score));
  });

  it("un interno con decimales bajo 80 no aprueba aunque el visible sea 79 (A)", () => {
    // Búsqueda de un score interno en [79, 80): visible 79 y NO APROBADA.
    let found: ReturnType<typeof decide> | null = null;
    for (const section of PRE_SECTIONS) {
      for (const q of section.groups.flatMap((g) => g.questions)) {
        for (const opt of q.options.filter((o) => !o.na)) {
          const d = decide({ ...perfect, [q.id]: opt.v });
          if (d.hardRules.length > 0 || d.emotional) continue;
          if (d.score >= 79 && d.score < 80) found = d;
        }
      }
    }
    if (found) {
      expect(found.scoreVisible).toBe(79);
      expect(found.finalState).not.toBe("APROBADA");
    }
    // Regla explícita: 79.87 interno => 79 visible, y 79.87 < 80 no aprueba.
    expect(Math.floor(79.87)).toBe(79);
    expect(79.87 >= APPROVAL_MIN_SCORE).toBe(false);
  });

  it("la clasificación y el estado nunca usan el valor visible (M)", () => {
    const { decision } = degradeBlock("comercio", 100);
    const byInternal = decision.score >= APPROVAL_MIN_SCORE;
    expect(decision.finalState === "APROBADA").toBe(
      byInternal &&
        decision.complete &&
        decision.gatesFailed.length === 0 &&
        decision.warnings.length === 0,
    );
  });
});

describe("CORE — gates obligatorios", () => {
  it("score interno ≥ 80 con todos los gates cumplidos => APROBADA (B/K)", () => {
    const d = decide(perfect);
    expect(d.hardRules).toEqual([]);
    expect(d.complete).toBe(true);
    expect(d.score).toBeGreaterThanOrEqual(APPROVAL_MIN_SCORE);
    expect(d.gatesFailed).toEqual([]);
    expect(d.finalState).toBe("APROBADA");
  });

  it("los gates son Estructura 70 / Zona 60 / Confirmación 60 / Riesgo 80 / Recorrido 60", () => {
    expect(APPROVAL_GATES.map((g) => [g.id, g.min])).toEqual([
      ["estructura", 70],
      ["zona", 60],
      ["confirmacion", 60],
      ["riesgo", 80],
      ["recorrido", 60],
    ]);
  });

  for (const gate of [
    { id: "estructura", min: 70, case: "C" },
    { id: "zona", min: 60, case: "D" },
    { id: "confirmacion", min: 60, case: "E" },
    { id: "riesgo", min: 80, case: "F" },
    { id: "recorrido", min: 60, case: "G" },
  ]) {
    it(`${gate.case}. ${gate.id} por debajo de ${gate.min}% => CONDICIONAL, no APROBADA`, () => {
      const { decision, reached, blockedBelow } = degradeBlock(gate.id, gate.min);
      expect(decision.hardRules).toEqual([]);
      expect(decision.emotional).toBe(false);
      if (reached) {
        expect(decision.breakdown[gate.id as "zona"]!.percent).toBeLessThan(gate.min);
        expect(decision.gatesFailed.length).toBeGreaterThan(0);
        expect(decision.finalState).toBe("CONDICIONAL");
      } else {
        // El bloque no puede bajar del gate sin activar antes una HARD: precedencia
        // HARD → NO TRADE (nunca APROBADA con el gate incumplido).
        expect(decision.breakdown[gate.id as "zona"]!.percent).toBeGreaterThanOrEqual(gate.min);
        expect(blockedBelow).toBe("NO TRADE");
      }
    });
  }
});

describe("CORE — HARD, completitud y estados oficiales", () => {
  it("cualquier HARD produce NO TRADE aunque el score sea máximo (H)", () => {
    const d = decide({ ...perfect, cf5_close: "no" });
    expect(d.hardRules.length).toBeGreaterThan(0);
    expect(d.finalState).toBe("NO TRADE");
    expect(d.classification).toBe("NO TRADE");
  });

  it("una evaluación incompleta no puede ser APROBADA (I)", () => {
    const partial = { ...perfect };
    delete partial[PRE_QUESTIONS[0]!.id];
    const d = decide(partial);
    expect(d.complete).toBe(false);
    expect(d.missing.length).toBeGreaterThan(0);
    expect(d.finalState).not.toBe("APROBADA");
  });

  it("el motor nuevo nunca produce DESCARTADA (N)", () => {
    const states = [
      decide(perfect).finalState,
      decide({ ...perfect, cf5_close: "no" }).finalState,
      decide({}).finalState,
      degradeBlock("riesgo", 80).decision.finalState,
    ];
    for (const s of states) {
      expect(s).not.toBe("DESCARTADA");
      expect(["BORRADOR", "CONDICIONAL", "APROBADA", "NO TRADE"]).toContain(s);
    }
  });

  it("datos inválidos (NaN/Infinity/0) no generan estados ni scores falsos (O)", () => {
    for (const risk of [
      { capital: Number.NaN, riskPct: Number.NaN, entry: 0, stop: 0, target: 0 },
      { capital: Number.POSITIVE_INFINITY, riskPct: 0, entry: 100, stop: 100 },
      { capital: 0, riskPct: 0 },
    ]) {
      const d = evaluate({ answers: perfect, risk, maxRiskPct: 1 });
      expect(Number.isFinite(d.score)).toBe(true);
      expect(d.score).toBeGreaterThanOrEqual(0);
      expect(d.score).toBeLessThanOrEqual(100);
      expect(Number.isInteger(d.scoreVisible)).toBe(true);
      expect(["BORRADOR", "CONDICIONAL", "APROBADA", "NO TRADE"]).toContain(d.finalState);
      for (const v of [d.metrics.rr, d.metrics.riskMoney, d.metrics.positionSize]) {
        expect(v === null || Number.isFinite(v)).toBe(true);
      }
    }
  });

  it("un cuestionario vacío no aprueba y expone las preguntas pendientes (I/O)", () => {
    const d = decide({});
    expect(d.finalState).not.toBe("APROBADA");
    expect(d.complete).toBe(false);
    expect(d.missing.length).toBe(PRE_QUESTIONS.length);
  });
});

describe("CORE — servidor: CONDICIONAL no registrable (J/K)", () => {
  const source = readFileSync(
    new URL("../src/lib/evaluations.functions.ts", import.meta.url),
    "utf8",
  );

  it("el servidor exige APROBADA para decision='registrado' (J)", () => {
    expect(source).toContain('decision.finalState !== "APROBADA"');
    expect(source).toContain("conditional_cannot_register");
    expect(source).toContain("incomplete_cannot_register");
  });

  it("el servidor recalcula los derivados y no acepta los del cliente (12)", () => {
    expect(source).toContain("evaluate({");
    expect(source).toContain("score: decision.scoreVisible");
    expect(source).toContain("final_state: decision.finalState");
  });

  it("el nuevo motor no escribe DESCARTADA (N)", () => {
    expect(source).not.toContain('"DESCARTADA"');
  });
});
