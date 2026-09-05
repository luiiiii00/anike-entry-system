import { describe, expect, it } from "bun:test";
import { computeRisk } from "@/lib/scoring";
import { calculatePostTrade } from "@/lib/posttrade";
import type { Evaluation } from "@/lib/db";
import { byAsset, computeStats, isClosed, longVsShort, rDistribution } from "@/lib/stats";

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
