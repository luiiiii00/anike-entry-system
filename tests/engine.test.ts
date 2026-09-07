import { describe, expect, it } from "bun:test";
import { computeRisk, computeScore, evaluate } from "@/lib/scoring";
import { calculatePostTrade } from "@/lib/posttrade";
import type { Evaluation } from "@/lib/db";
import {
  byAsset,
  computeStats,
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
    const m = computeRisk({ entry: 100, stop: 100, target: 110, capital: 1000, riskPct: 1 }, "LONG");
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
        { capital: bad as number, riskPct: bad as number, entry: bad as number, stop: bad as number },
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
    expect(d.finalState).toBe("DESCARTADA");
    expect(d.classification).toBe("NO TRADE");
  });

  it("una regla crítica descarta la operación", () => {
    const d = evaluate({ answers: { ...passing, cf5_close: "no" }, risk: {}, maxRiskPct: 1 });
    expect(d.hardRules.length).toBeGreaterThan(0);
    expect(d.finalState).toBe("DESCARTADA");
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

  it("no produce NaN ni Infinity con ceros y valores no finitos", () => {
    const r = calculatePostTrade({
      ...base,
      capital: 0,
      quantity: 0,
      exitPrice: 110,
    });
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

  it("una CONDICIONAL sí puede registrarse y cerrarse si el trader la ejecutó", () => {
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
