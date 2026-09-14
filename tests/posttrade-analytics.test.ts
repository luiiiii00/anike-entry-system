import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import {
  analyzeEma50,
  analyzeExcursions,
  analyzePostTradeAll,
  analyzeResult,
  buildAiPostTradeContext,
  finite,
  type PlannedRef,
  type RealRef,
} from "@/lib/posttrade-analytics";
import { computeRisk, evaluate, sizingStatus } from "@/lib/scoring";

/**
 * POST-TRADE ANALYTICS — pruebas de exactitud, seguridad numérica y aislamiento
 * respecto al motor de aprobación de entrada (score, gates, HARD, estados).
 */

const planned: PlannedRef = { entry: 100, stopLoss: 95, takeProfit: 110, riskPct: 1, capital: 1000 };

const real = (over: Partial<RealRef> = {}): RealRef => ({
  direction: "LONG",
  entry: 100,
  exit: 110,
  stopLoss: 95,
  takeProfit: 110,
  quantity: 2,
  capital: 1000,
  ...over,
});

/* ------------------------------ 1-4: resultado ---------------------------- */

describe("resultado por dirección", () => {
  it("1. LONG rentable", () => {
    const r = analyzeResult(real(), planned);
    expect(r.closeDistance).toBe(10);
    expect(r.netPnl).toBe(20);
    expect(r.resultR).toBe(2);
    expect(r.status).toBe("GANANCIA");
  });

  it("2. LONG perdedora", () => {
    const r = analyzeResult(real({ exit: 95 }), planned);
    expect(r.netPnl).toBe(-10);
    expect(r.resultR).toBe(-1);
    expect(r.status).toBe("PÉRDIDA");
  });

  it("3. SHORT rentable", () => {
    const r = analyzeResult(
      real({ direction: "SHORT", entry: 100, exit: 90, stopLoss: 105, takeProfit: 90 }),
      {},
    );
    expect(r.closeDistance).toBe(10);
    expect(r.netPnl).toBe(20);
    expect(r.resultR).toBe(2);
  });

  it("4. SHORT perdedora", () => {
    const r = analyzeResult(
      real({ direction: "SHORT", entry: 100, exit: 105, stopLoss: 105, takeProfit: 90 }),
      {},
    );
    expect(r.netPnl).toBe(-10);
    expect(r.resultR).toBe(-1);
  });
});

/* --------------------------- 5-11: casos límite --------------------------- */

describe("geometría y seguridad numérica", () => {
  it("5. cierre exactamente en la entrada es break-even", () => {
    const r = analyzeResult(real({ exit: 100 }), planned);
    expect(r.netPnl).toBe(0);
    expect(r.status).toBe("BREAK-EVEN");
    expect(r.resultR).toBe(0);
  });

  it("6. SL = Entry no produce R (riesgo cero, nunca Infinity)", () => {
    const r = analyzeResult(real({ stopLoss: 100, riskAmount: null }), { entry: 100 });
    expect(r.stopDistance).toBe(0);
    expect(r.resultR).toBe(null);
  });

  it("7. TP = Entry no produce reward planificado", () => {
    const r = analyzeResult(real({ takeProfit: 100 }), {});
    expect(r.targetDistance).toBe(0);
    expect(r.plannedRewardMoney).toBe(null);
  });

  it("8. dirección desconocida no asume LONG", () => {
    const r = analyzeResult(real({ direction: "" }), planned);
    expect(r.direction).toBe(null);
    expect(r.closeDistance).toBe(null);
  });

  it("9. NaN se trata como dato ausente", () => {
    expect(finite(NaN)).toBe(null);
    const r = analyzeResult(real({ exit: NaN }), planned);
    expect(r.netPnl).toBe(null);
    expect(r.status).toBe(null);
  });

  it("10. Infinity nunca se propaga", () => {
    const r = analyzeResult(real({ quantity: Infinity, exit: -Infinity }), planned);
    expect(r.netPnl === null || Number.isFinite(r.netPnl)).toBe(true);
    expect(r.resultR === null || Number.isFinite(r.resultR)).toBe(true);
  });

  it("11. null/undefined no se convierten silenciosamente a 0", () => {
    const r = analyzeResult({ direction: "LONG", entry: null, exit: undefined }, {});
    expect(r.netPnl).toBe(null);
    expect(r.percentOnCapital).toBe(null);
  });
});

/* -------------------------------- 12: costes ------------------------------ */

describe("comisiones", () => {
  it("12a. con comisión, el neto la descuenta", () => {
    const r = analyzeResult(real({ fees: 4 }), planned);
    expect(r.grossPnl).toBe(20);
    expect(r.netPnl).toBe(16);
  });

  it("12b. sin comisión, neto = bruto", () => {
    const r = analyzeResult(real(), planned);
    expect(r.costs).toBe(null);
    expect(r.netPnl).toBe(r.grossPnl);
  });
});

/* ----------------------------- 13-15: lotaje ------------------------------ */

describe("precisión del lotaje", () => {
  it("13. EXACTO en CRYPTO con entrada y stop", () => {
    const m = computeRisk({ capital: 1000, riskPct: 1, entry: 100, stop: 95 }, "LONG", {
      market: "CRYPTO",
    });
    expect(m.sizingPrecision).toBe("exact");
    expect(sizingStatus(m).label).toBe("EXACTO");
  });

  it("14. ORIENTATIVO en FUTURES sin especificación de contrato", () => {
    const m = computeRisk({ capital: 1000, riskPct: 1, entry: 100, stop: 95 }, "LONG", {
      market: "FUTURES",
      contractSize: null,
    });
    expect(m.sizingPrecision).toBe("orientative");
    expect(sizingStatus(m).label).toContain("NO EJECUTABLE");
  });

  it("15. NO DISPONIBLE sin datos suficientes", () => {
    const m = computeRisk({ capital: 1000, riskPct: 1 }, "LONG", { market: "CRYPTO" });
    expect(m.sizingPrecision).toBe("unavailable");
    expect(m.positionSize).toBe(null);
    expect(sizingStatus(m).label).toBe("NO DISPONIBLE");
  });
});

/* ------------------------------ 16-17: EMA 50 ----------------------------- */

describe("EMA 50", () => {
  it("16. EMA 50 disponible calcula distancias y captura", () => {
    const e = analyzeEma50(real({ exit: 105, ema50: 110, ema50Close: 108, maxFavorablePrice: 106 }));
    expect(e.ema50).toBe(110);
    expect(e.ema50AtClose).toBe(108);
    expect(e.entryDistance).toBe(10);
    expect(e.capturedMove).toBe(5);
    expect(e.potentialMove).toBe(10);
    expect(e.remainingMove).toBe(5);
    expect(e.capturedPercentOfPotential).toBe(50);
    expect(e.reachedBeforeClose).toBe(false);
  });

  it("17. EMA 50 no registrada no se reconstruye", () => {
    const e = analyzeEma50(real());
    expect(e.ema50).toBe(null);
    expect(e.entryDistance).toBe(null);
    expect(e.capturedPercentOfPotential).toBe(null);
  });
});

/* ----------------------------- 18-19: MFE/MAE ----------------------------- */

describe("MFE / MAE", () => {
  it("18. MFE y MAE disponibles dan dinero, R y eficiencia", () => {
    const r = real({ exit: 105, maxFavorablePrice: 112, maxAdversePrice: 97 });
    const res = analyzeResult(r, planned);
    const x = analyzeExcursions(r, res);
    expect(x.mfeMove).toBe(12);
    expect(x.maeMove).toBe(3);
    expect(x.mfeMoney).toBe(24);
    expect(x.maeMoney).toBe(6);
    expect(x.mfeR).toBe(2.4);
    expect(x.maeR).toBeCloseTo(0.6, 10);
    expect(x.captureEfficiency).toBeCloseTo((10 / 24) * 100, 10);
  });

  it("19. sin extremos intratrade queda NO DISPONIBLE con causa técnica", () => {
    const r = real();
    const x = analyzeExcursions(r, analyzeResult(r, planned));
    expect(x.mfeMove).toBe(null);
    expect(x.maeMove).toBe(null);
    expect(x.captureEfficiency).toBe(null);
    expect(x.missing).toContain("maxFavorablePrice");
    expect(x.missing).toContain("maxAdversePrice");
  });
});

/* ------------------- 20-25: aislamiento del motor CORE -------------------- */

const postTradeSource = readFileSync("src/lib/posttrade-analytics.ts", "utf8");
const postTradeFnSource = readFileSync("src/lib/posttrade.functions.ts", "utf8");

describe("aislamiento del motor de entrada", () => {
  it("20. la analítica no puede alterar el score de entrada", () => {
    const answers = { c1_1: "si", c1_2: "si" } as Record<string, string>;
    const before = evaluate({ answers, risk: {} });
    const a = analyzePostTradeAll(planned, real({ maxFavorablePrice: 120 }));
    const after = evaluate({ answers, risk: {} });
    expect(after.score).toBe(before.score);
    expect(after.classification).toBe(before.classification);
    // "scorecard" es análisis post-trade, no el score de entrada: no debe existir la clave exacta "score".
    expect(Object.keys(a)).not.toContain("score");
    expect(JSON.stringify(a)).not.toMatch(/"score"\s*:/);
  });

  it("21. el módulo post-trade no importa ni escribe gates/HARD/clasificación", () => {
    expect(postTradeSource).not.toMatch(/hard_rules\s*=/);
    expect(postTradeSource).not.toMatch(/classification\s*[:=]/);
    expect(postTradeSource).not.toMatch(/from "@\/lib\/checklist"/);
    expect(postTradeSource).not.toMatch(/computeScore/);
  });

  it("22. una operación CONDICIONAL no puede cerrarse sin estar registrada", () => {
    expect(postTradeFnSource).toContain('current.decision !== "registrado"');
    expect(postTradeFnSource).toContain('current.status !== "completed"');
  });

  it("23. una operación NO TRADE o con HARD no puede cerrarse", () => {
    expect(postTradeFnSource).toContain('current.classification === "NO TRADE"');
    expect(postTradeFnSource).toContain('current.final_state === "DESCARTADA"');
    expect(postTradeFnSource).toContain("current.emotional_stop === true");
    expect(postTradeFnSource).toMatch(/hard_rules\?\.length/);
  });

  it("24. el cierre recalcula en servidor y no acepta derivados del cliente", () => {
    expect(postTradeFnSource).toContain("calculatePostTrade(input)");
    expect(postTradeFnSource).toMatch(/eq\("user_id", context\.userId\)/);
  });

  it("25. el contexto para la IA no expone score, gates ni clasificación", () => {
    const ctx = buildAiPostTradeContext(analyzePostTradeAll(planned, real()));
    const json = JSON.stringify(ctx);
    expect(json).not.toMatch(/"score"\s*:/);
    expect(json).not.toContain("classification");
    expect(json).not.toContain("hard");
    expect(ctx.diagnosis.length).toBeGreaterThan(0);
  });
});
