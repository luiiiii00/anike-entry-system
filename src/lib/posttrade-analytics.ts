/**
 * ANIKE EJEPIKA — POST-TRADE ANALYTICS
 *
 * Analítica de operaciones YA CERRADAS. Sólo mide y describe lo registrado.
 * NO toca el motor de entrada (pesos, gates, invalidaciones globales, score, aprobación):
 * ninguna función de este archivo se usa para aprobar o clasificar una entrada.
 *
 * Reglas de seguridad numérica: todo valor no finito (NaN / Infinity), nulo o
 * indefinido se convierte en `null` y se presenta como "No disponible".
 * No se redondea internamente: el redondeo es exclusivo de presentación.
 */

export type Direction = "LONG" | "SHORT";

/** Estado de un aspecto analizado: nunca se inventa un juicio sin datos. */
export type Verdict = "ok" | "warn" | "bad" | "unknown";

export type DeviationKind =
  | "entry_early"
  | "entry_late"
  | "entry_match"
  | "stop_moved"
  | "stop_match"
  | "target_moved"
  | "target_match"
  | "close_early"
  | "close_late"
  | "close_at_plan"
  | "risk_exceeded"
  | "risk_respected";

export type Deviation = {
  kind: DeviationKind;
  label: string;
  detail: string;
  verdict: Verdict;
};

export type PlannedRef = {
  entry?: number | null | undefined;
  stopLoss?: number | null | undefined;
  takeProfit?: number | null | undefined;
  riskPct?: number | null | undefined;
  capital?: number | null | undefined;
};

export type RealRef = {
  direction?: string | null | undefined;
  entry?: number | null | undefined;
  exit?: number | null | undefined;
  stopLoss?: number | null | undefined;
  takeProfit?: number | null | undefined;
  quantity?: number | null | undefined;
  netPnl?: number | null | undefined;
  grossPnl?: number | null | undefined;
  fees?: number | null | undefined;
  riskAmount?: number | null | undefined;
  riskPercent?: number | null | undefined;
  plannedRr?: number | null | undefined;
  resultR?: number | null | undefined;
  capital?: number | null | undefined;
  leverage?: number | null | undefined;
  margin?: number | null | undefined;
  notionalValue?: number | null | undefined;
  /** EMA 50 en el momento de la operación (opcional, post-trade). */
  ema50?: number | null | undefined;
  /** EMA 50 en el momento del cierre (opcional, post-trade). */
  ema50Close?: number | null | undefined;
  /** Precio máximo favorable alcanzado (MFE), si se registró. */
  maxFavorablePrice?: number | null | undefined;
  /** Precio máximo adverso alcanzado (MAE), si se registró. */
  maxAdversePrice?: number | null | undefined;
  /** Reflexión / disciplina ya registradas en el journal. */
  followedPlan?: string | null | undefined;
  emotionalStop?: boolean | null | undefined;
  hardRules?: string[] | null | undefined;
};

/** Convierte a número finito o null. Bloquea NaN, Infinity, "", null. */
export const finite = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

const dirOf = (d: string | null | undefined): Direction | null =>
  d === "LONG" || d === "SHORT" ? d : null;

/** Tolerancia relativa (0,05 % del precio de referencia) para comparar precios. */
const tolerance = (ref: number | null) => (ref === null || ref === 0 ? 0 : Math.abs(ref) * 0.0005);

const near = (a: number, b: number, ref: number | null) => Math.abs(a - b) <= tolerance(ref);

/* --------------------------- MÓDULO 1: RESULTADO --------------------------- */

export type ResultAnalysis = {
  direction: Direction | null;
  stopDistance: number | null;
  targetDistance: number | null;
  closeDistance: number | null;
  plannedRiskMoney: number | null;
  plannedRewardMoney: number | null;
  grossPnl: number | null;
  costs: number | null;
  netPnl: number | null;
  percentOnCapital: number | null;
  resultR: number | null;
  /** Riesgo realizado / riesgo planificado, en %. */
  riskUsedPercentOfPlan: number | null;
  status: "GANANCIA" | "PÉRDIDA" | "BREAK-EVEN" | null;
};

export function analyzeResult(real: RealRef, planned: PlannedRef = {}): ResultAnalysis {
  const dir = dirOf(real.direction);
  const entry = finite(real.entry);
  const exit = finite(real.exit);
  const stop = finite(real.stopLoss) ?? finite(planned.stopLoss);
  const target = finite(real.takeProfit) ?? finite(planned.takeProfit);
  const qty = finite(real.quantity);
  const capital = finite(real.capital) ?? finite(planned.capital);

  const stopDistance = entry !== null && stop !== null ? Math.abs(entry - stop) : null;
  const targetDistance = entry !== null && target !== null ? Math.abs(entry - target) : null;
  // Distancia con signo según dirección: LONG = Close - Entry, SHORT = Entry - Close.
  const closeDistance =
    entry !== null && exit !== null && dir !== null
      ? dir === "LONG"
        ? exit - entry
        : entry - exit
      : null;

  const riskFromTrade = finite(real.riskAmount);
  const plannedRiskFromPct =
    capital !== null &&
    capital > 0 &&
    finite(planned.riskPct) !== null &&
    finite(planned.riskPct)! > 0
      ? (capital * finite(planned.riskPct)!) / 100
      : null;
  const plannedRiskMoney =
    riskFromTrade !== null && riskFromTrade > 0
      ? riskFromTrade
      : stopDistance !== null && stopDistance > 0 && qty !== null && qty > 0
        ? stopDistance * qty
        : plannedRiskFromPct;

  const plannedRewardMoney =
    targetDistance !== null && targetDistance > 0 && qty !== null && qty > 0
      ? targetDistance * qty
      : null;

  const grossPnl =
    finite(real.grossPnl) ??
    (closeDistance !== null && qty !== null && qty > 0 ? closeDistance * qty : null);
  const costs = finite(real.fees);
  const netPnl = finite(real.netPnl) ?? (grossPnl !== null ? grossPnl - (costs ?? 0) : null);

  const percentOnCapital =
    netPnl !== null && capital !== null && capital > 0 ? (netPnl / capital) * 100 : null;

  // R real: sólo si el riesgo planificado es estrictamente > 0 (evita /0 e Infinity).
  const resultR =
    netPnl !== null && plannedRiskMoney !== null && plannedRiskMoney > 0
      ? netPnl / plannedRiskMoney
      : finite(real.resultR);

  const realizedRisk = riskFromTrade;
  const riskUsedPercentOfPlan =
    realizedRisk !== null &&
    realizedRisk > 0 &&
    plannedRiskFromPct !== null &&
    plannedRiskFromPct > 0
      ? (realizedRisk / plannedRiskFromPct) * 100
      : null;

  const status =
    netPnl === null ? null : netPnl > 0 ? "GANANCIA" : netPnl < 0 ? "PÉRDIDA" : "BREAK-EVEN";

  return {
    direction: dir,
    stopDistance,
    targetDistance,
    closeDistance,
    plannedRiskMoney,
    plannedRewardMoney,
    grossPnl,
    costs,
    netPnl,
    percentOnCapital,
    resultR: resultR === null || !Number.isFinite(resultR) ? null : resultR,
    riskUsedPercentOfPlan,
    status,
  };
}

/* -------------------------- MÓDULO 3: APALANCAMIENTO ---------------------- */

export type LeverageAnalysis = {
  capital: number | null;
  notional: number | null;
  leverage: number | null;
  margin: number | null;
  /** Exposición sobre capital (veces). */
  exposureRatio: number | null;
};

export function analyzeLeverage(input: {
  capital?: number | null | undefined;
  notional?: number | null | undefined;
  leverage?: number | null | undefined;
  margin?: number | null | undefined;
}): LeverageAnalysis {
  const capital = finite(input.capital);
  const notional = finite(input.notional);
  const leverage = finite(input.leverage);
  const givenMargin = finite(input.margin);

  const margin =
    givenMargin !== null && givenMargin > 0
      ? givenMargin
      : notional !== null && notional > 0 && leverage !== null && leverage > 0
        ? notional / leverage
        : null;

  const exposureRatio =
    notional !== null && notional > 0 && capital !== null && capital > 0
      ? notional / capital
      : null;

  return {
    capital,
    notional,
    leverage: leverage !== null && leverage > 0 ? leverage : null,
    margin: margin !== null && Number.isFinite(margin) && margin > 0 ? margin : null,
    exposureRatio,
  };
}

export const LEVERAGE_NOTE =
  "El apalancamiento modifica el margen requerido; el riesgo de la operación debe estar determinado por el tamaño de posición y el SL.";

/* --------------------------- MÓDULO 4: PLAN vs REAL ----------------------- */

export function analyzeDeviations(planned: PlannedRef, real: RealRef): Deviation[] {
  const out: Deviation[] = [];
  const dir = dirOf(real.direction);
  const pEntry = finite(planned.entry);
  const pStop = finite(planned.stopLoss);
  const pTarget = finite(planned.takeProfit);
  const rEntry = finite(real.entry);
  const rStop = finite(real.stopLoss);
  const rTarget = finite(real.takeProfit);
  const exit = finite(real.exit);

  // Entrada: se compara el precio real con el planificado según la dirección.
  // Convención documentada: en LONG un precio real por debajo del planificado se
  // considera entrada anticipada; por encima, entrada tardía. En SHORT, inverso.
  if (pEntry !== null && rEntry !== null) {
    if (near(pEntry, rEntry, pEntry)) {
      out.push({
        kind: "entry_match",
        label: "Entrada según plan",
        detail: "El precio de entrada coincide con el planificado.",
        verdict: "ok",
      });
    } else if (dir === null) {
      out.push({
        kind: "entry_match",
        label: "Entrada",
        detail: "No disponible: falta la dirección de la operación.",
        verdict: "unknown",
      });
    } else {
      const early = dir === "LONG" ? rEntry < pEntry : rEntry > pEntry;
      out.push(
        early
          ? {
              kind: "entry_early",
              label: "Entrada anticipada",
              detail: "Se entró antes del precio planificado.",
              verdict: "warn",
            }
          : {
              kind: "entry_late",
              label: "Entrada tardía",
              detail: "Se entró después del precio planificado.",
              verdict: "warn",
            },
      );
    }
  }

  if (pStop !== null && rStop !== null) {
    out.push(
      near(pStop, rStop, pStop)
        ? {
            kind: "stop_match",
            label: "Stop respetado",
            detail: "El Stop Loss coincide con el planificado.",
            verdict: "ok",
          }
        : {
            kind: "stop_moved",
            label: "Stop movido",
            detail: "El Stop Loss registrado difiere del planificado.",
            verdict: "warn",
          },
    );
  }

  if (pTarget !== null && rTarget !== null) {
    out.push(
      near(pTarget, rTarget, pTarget)
        ? {
            kind: "target_match",
            label: "Objetivo respetado",
            detail: "El Take Profit coincide con el planificado.",
            verdict: "ok",
          }
        : {
            kind: "target_moved",
            label: "Objetivo movido",
            detail: "El Take Profit registrado difiere del planificado.",
            verdict: "warn",
          },
    );
  }

  // Cierre: se mide el recorrido alcanzado frente al nivel del plan que aplica.
  const target = rTarget ?? pTarget;
  const stop = rStop ?? pStop;
  const entry = rEntry ?? pEntry;
  if (exit !== null && entry !== null && dir !== null) {
    const favorable = dir === "LONG" ? exit - entry : entry - exit;
    const level = favorable >= 0 ? target : stop;
    if (level === null) {
      out.push({
        kind: "close_at_plan",
        label: "Cierre",
        detail: "No disponible: falta el nivel planificado de salida.",
        verdict: "unknown",
      });
    } else {
      const levelDistance =
        favorable >= 0
          ? dir === "LONG"
            ? level - entry
            : entry - level
          : dir === "LONG"
            ? entry - level
            : level - entry;
      const reached = Math.abs(favorable);
      if (near(reached, Math.abs(levelDistance), entry)) {
        out.push({
          kind: "close_at_plan",
          label: "Cierre en el nivel del plan",
          detail: "La salida se produjo en el nivel previsto.",
          verdict: "ok",
        });
      } else if (reached < Math.abs(levelDistance)) {
        out.push({
          kind: "close_early",
          label: "Cierre anticipado",
          detail: "La salida ocurrió antes del nivel previsto.",
          verdict: "warn",
        });
      } else {
        out.push({
          kind: "close_late",
          label: "Cierre posterior al plan",
          detail: "La salida ocurrió más allá del nivel previsto.",
          verdict: "warn",
        });
      }
    }
  }

  // Riesgo: sólo se declara excedido con datos suficientes en ambos lados.
  const capital = finite(real.capital) ?? finite(planned.capital);
  const plannedPct = finite(planned.riskPct);
  const realPct =
    finite(real.riskPercent) ??
    (finite(real.riskAmount) !== null && capital !== null && capital > 0
      ? (finite(real.riskAmount)! / capital) * 100
      : null);
  if (plannedPct !== null && plannedPct > 0 && realPct !== null) {
    out.push(
      realPct > plannedPct * 1.05
        ? {
            kind: "risk_exceeded",
            label: "Riesgo excedido",
            detail: `Riesgo asumido ${realPct.toFixed(2)}% frente al planificado ${plannedPct.toFixed(2)}%.`,
            verdict: "bad",
          }
        : {
            kind: "risk_respected",
            label: "Riesgo respetado",
            detail: `Riesgo asumido ${realPct.toFixed(2)}% dentro del planificado ${plannedPct.toFixed(2)}%.`,
            verdict: "ok",
          },
    );
  }

  return out;
}

/* ----------------------------- MÓDULO 5: EMA 50 --------------------------- */

export type Ema50Analysis = {
  ema50: number | null;
  /** EMA 50 en el cierre, si se registró. */
  ema50AtClose: number | null;
  entryDistance: number | null;
  initialTarget: number | null;
  closePrice: number | null;
  /** Diferencia entre el TP planificado y la EMA 50 (absoluta). */
  targetVsEma: number | null;
  /** true / false sólo con datos; null = no disponible. */
  reachedBeforeClose: boolean | null;
  capturedMove: number | null;
  potentialMove: number | null;
  /** Recorrido que faltaba hasta la EMA 50 en el momento del cierre. */
  remainingMove: number | null;
  capturedPercentOfPotential: number | null;
};

export function analyzeEma50(real: RealRef, planned: PlannedRef = {}): Ema50Analysis {
  const dir = dirOf(real.direction);
  const ema = finite(real.ema50);
  const entry = finite(real.entry);
  const exit = finite(real.exit);
  const target = finite(real.takeProfit) ?? finite(planned.takeProfit);
  const mfe = finite(real.maxFavorablePrice);

  const entryDistance = ema !== null && entry !== null ? Math.abs(ema - entry) : null;
  const captured =
    entry !== null && exit !== null && dir !== null
      ? dir === "LONG"
        ? exit - entry
        : entry - exit
      : null;
  const potentialSigned =
    entry !== null && ema !== null && dir !== null
      ? dir === "LONG"
        ? ema - entry
        : entry - ema
      : null;
  const potential = potentialSigned !== null && potentialSigned > 0 ? potentialSigned : null;

  let reached: boolean | null = null;
  if (ema !== null && dir !== null) {
    const best = mfe ?? exit;
    if (best !== null) {
      reached = dir === "LONG" ? best >= ema : best <= ema;
      // Sin MFE, un precio de cierre que no alcanzó la EMA no permite afirmar
      // que el precio no la tocó durante la operación.
      if (reached === false && mfe === null) reached = null;
    }
  }

  const emaClose = finite(real.ema50Close);
  const remaining =
    potential !== null && captured !== null && potential - captured > 0
      ? potential - captured
      : null;

  return {
    ema50: ema,
    ema50AtClose: emaClose,
    entryDistance,
    initialTarget: target,
    closePrice: exit,
    targetVsEma: ema !== null && target !== null ? Math.abs(target - ema) : null,
    reachedBeforeClose: reached,
    capturedMove: captured,
    potentialMove: potential,
    remainingMove: remaining,
    capturedPercentOfPotential:
      captured !== null && potential !== null && potential > 0
        ? (captured / potential) * 100
        : null,
  };
}

/* ------------------------- MÓDULO 5b: MFE / MAE --------------------------- */

export type ExcursionAnalysis = {
  /** Máxima excursión favorable en precio (siempre >= 0 o null). */
  mfeMove: number | null;
  /** Máxima excursión adversa en precio (siempre >= 0 o null). */
  maeMove: number | null;
  mfeMoney: number | null;
  maeMoney: number | null;
  mfeR: number | null;
  maeR: number | null;
  /** Resultado realizado / MFE monetario, en % (sólo si MFE > 0). */
  captureEfficiency: number | null;
  /** Causas técnicas de indisponibilidad (uso interno / soporte). */
  missing: string[];
};

/**
 * MFE / MAE a partir de los precios extremos intratrade registrados.
 * Si no se registraron, se devuelve null y la causa: nunca se reconstruyen.
 */
export function analyzeExcursions(real: RealRef, result: ResultAnalysis): ExcursionAnalysis {
  const missing: string[] = [];
  const dir = dirOf(real.direction);
  const entry = finite(real.entry);
  const qty = finite(real.quantity);
  const mfePrice = finite(real.maxFavorablePrice);
  const maePrice = finite(real.maxAdversePrice);

  if (dir === null) missing.push("direction");
  if (entry === null) missing.push("entry");
  if (mfePrice === null) missing.push("maxFavorablePrice");
  if (maePrice === null) missing.push("maxAdversePrice");
  if (qty === null || qty <= 0) missing.push("quantity");

  const signed = (price: number | null, favorable: boolean) => {
    if (price === null || entry === null || dir === null) return null;
    const move = favorable === (dir === "LONG") ? price - entry : entry - price;
    // Geometría inválida (p. ej. "máximo favorable" peor que la entrada): no se asume 0.
    return move >= 0 ? move : null;
  };

  const mfeMove = signed(mfePrice, true);
  const maeMove = signed(maePrice, false);
  if (mfePrice !== null && mfeMove === null) missing.push("mfe_geometry");
  if (maePrice !== null && maeMove === null) missing.push("mae_geometry");

  const money = (move: number | null) =>
    move !== null && qty !== null && qty > 0 ? move * qty : null;
  const mfeMoney = money(mfeMove);
  const maeMoney = money(maeMove);

  const risk = result.plannedRiskMoney;
  const inR = (m: number | null) => (m !== null && risk !== null && risk > 0 ? m / risk : null);
  if (risk === null || risk <= 0) missing.push("plannedRiskMoney");

  const net = result.netPnl;
  const captureEfficiency =
    net !== null && mfeMoney !== null && mfeMoney > 0 ? (net / mfeMoney) * 100 : null;

  return {
    mfeMove,
    maeMove,
    mfeMoney,
    maeMoney,
    mfeR: inR(mfeMoney),
    maeR: inR(maeMoney),
    captureEfficiency,
    missing,
  };
}

/* --------------------------- MÓDULO 6: SCORECARD -------------------------- */

export type ScorecardItem = { area: string; verdict: Verdict; label: string; detail: string };

/**
 * Scorecard POST-TRADE. Es una métrica de proceso sobre lo ya ocurrido y
 * NO tiene ninguna relación con el score de aprobación previo a la entrada.
 */
export function buildScorecard(
  result: ResultAnalysis,
  deviations: Deviation[],
  real: RealRef,
): ScorecardItem[] {
  const kinds = new Set(deviations.map((d) => d.kind));

  const financial: ScorecardItem = {
    area: "RESULTADO FINANCIERO",
    verdict:
      result.status === null
        ? "unknown"
        : result.status === "GANANCIA"
          ? "ok"
          : result.status === "PÉRDIDA"
            ? "warn"
            : "ok",
    label:
      result.status === null
        ? "Datos insuficientes"
        : result.status === "GANANCIA"
          ? "Resultado positivo"
          : result.status === "PÉRDIDA"
            ? "Resultado negativo"
            : "Break-even",
    detail: "Resultado neto de la operación en dinero y en R sobre el riesgo planificado.",
  };

  const technical: ScorecardItem = kinds.has("entry_match")
    ? {
        area: "RESULTADO TÉCNICO",
        verdict: "ok",
        label: "Entrada correcta",
        detail: "El precio de entrada real coincide con el nivel planificado.",
      }
    : kinds.has("entry_early") || kinds.has("entry_late")
      ? {
          area: "RESULTADO TÉCNICO",
          verdict: "warn",
          label: "Desviación de entrada",
          detail: "La entrada real se ejecutó a un precio distinto del planificado.",
        }
      : {
          area: "RESULTADO TÉCNICO",
          verdict: "unknown",
          label: "Datos insuficientes",
          detail: "Falta el precio de entrada planificado o el real para comparar.",
        };

  const management: ScorecardItem = kinds.has("risk_exceeded")
    ? {
        area: "GESTIÓN DE RIESGO",
        verdict: "bad",
        label: "Riesgo excedido",
        detail: "El riesgo asumido superó el riesgo planificado para la operación.",
      }
    : kinds.has("risk_respected")
      ? {
          area: "GESTIÓN DE RIESGO",
          verdict: "ok",
          label: "Riesgo respetado",
          detail: "El riesgo asumido se mantuvo dentro del límite planificado.",
        }
      : {
          area: "GESTIÓN DE RIESGO",
          verdict: "unknown",
          label: "Datos insuficientes",
          detail: "Falta el riesgo planificado o el riesgo realmente asumido.",
        };

  const exitItem: ScorecardItem = kinds.has("close_at_plan")
    ? {
        area: "GESTIÓN DE SALIDA",
        verdict: "ok",
        label: "Plan respetado",
        detail: "La salida se produjo en el nivel previsto por el plan.",
      }
    : kinds.has("close_early")
      ? {
          area: "GESTIÓN DE SALIDA",
          verdict: "warn",
          label: "Salida anticipada",
          detail: "Se cerró antes del nivel previsto: parte del recorrido quedó sin capturar.",
        }
      : kinds.has("close_late")
        ? {
            area: "GESTIÓN DE SALIDA",
            verdict: "warn",
            label: "Salida posterior al plan",
            detail: "El cierre ocurrió más allá del nivel previsto por el plan.",
          }
        : {
            area: "GESTIÓN DE SALIDA",
            verdict: "unknown",
            label: "Datos insuficientes",
            detail: "Falta el nivel de salida planificado o el precio de cierre.",
          };

  const followed = (real.followedPlan ?? "").toLowerCase();
  const hardRules = (real.hardRules ?? []).length > 0;
  const discipline: ScorecardItem =
    hardRules || real.emotionalStop === true
      ? {
          area: "DISCIPLINA",
          verdict: "bad",
          label: "Desviación de protocolo",
          detail: "Se registraron reglas duras activadas o freno emocional en la evaluación.",
        }
      : followed.startsWith("sí")
        ? {
            area: "DISCIPLINA",
            verdict: "ok",
            label: "Cumplió protocolo",
            detail: "El operador declaró haber seguido el plan definido antes de entrar.",
          }
        : followed === ""
          ? {
              area: "DISCIPLINA",
              verdict: "unknown",
              label: "Datos insuficientes",
              detail: "Aún no se registró la reflexión sobre el cumplimiento del plan.",
            }
          : {
              area: "DISCIPLINA",
              verdict: "warn",
              label: "Desviación de protocolo",
              detail: "El operador declaró no haber seguido el plan por completo.",
            };

  const deviationCount = deviations.filter(
    (d) => d.verdict === "warn" || d.verdict === "bad",
  ).length;
  const planVsReal: ScorecardItem =
    deviations.length === 0
      ? {
          area: "PLAN vs REAL",
          verdict: "unknown",
          label: "Datos insuficientes",
          detail: "No hay datos del plan suficientes para comparar con la ejecución real.",
        }
      : deviationCount === 0
        ? {
            area: "PLAN vs REAL",
            verdict: "ok",
            label: "Ejecución alineada",
            detail: "No se detectaron desviaciones entre el plan registrado y la ejecución.",
          }
        : {
            area: "PLAN vs REAL",
            verdict: deviationCount > 1 ? "bad" : "warn",
            label: `${deviationCount} desviación${deviationCount > 1 ? "es" : ""}`,
            detail: "Diferencias objetivas entre lo planificado y lo realmente ejecutado.",
          };

  return [financial, technical, management, exitItem, discipline, planVsReal];
}

/* -------------------------- MÓDULO 7: DIAGNÓSTICO ------------------------- */

export function buildDiagnosis(
  result: ResultAnalysis,
  deviations: Deviation[],
  excursions?: ExcursionAnalysis,
): { text: string; verdict: Verdict } {
  const kinds = new Set(deviations.map((d) => d.kind));

  if (result.status === null) {
    return {
      text: "No hay datos suficientes para emitir un diagnóstico completo.",
      verdict: "unknown",
    };
  }
  if (kinds.has("risk_exceeded")) {
    return {
      text: "La principal desviación fue de gestión de riesgo: el riesgo real superó el riesgo planificado.",
      verdict: "bad",
    };
  }
  const capture = excursions?.captureEfficiency ?? null;
  if (result.status === "GANANCIA" && capture !== null && capture < 50) {
    return {
      text: "Operación rentable, pero se capturó una parte reducida del recorrido favorable. La principal oportunidad de mejora está en la gestión de salida.",
      verdict: "warn",
    };
  }
  if (result.status === "GANANCIA" && kinds.has("close_early")) {
    return {
      text: "La operación fue rentable, pero la salida anticipada redujo el recorrido capturado.",
      verdict: "warn",
    };
  }
  if (result.status === "GANANCIA") {
    return { text: "Resultado positivo con ejecución alineada al plan.", verdict: "ok" };
  }
  if (result.status === "PÉRDIDA" && kinds.has("risk_respected")) {
    return {
      text: "La operación terminó en pérdida dentro del riesgo planificado. El resultado financiero por sí solo no implica una falla de disciplina.",
      verdict: "ok",
    };
  }
  if (result.status === "PÉRDIDA") {
    return {
      text: "La operación terminó en pérdida. Revisa entrada, stop y gestión con los datos registrados.",
      verdict: "warn",
    };
  }
  return {
    text: "Operación cerrada en break-even: el recorrido no compensó costes ni riesgo asumido.",
    verdict: "warn",
  };
}

/* ------------------------------ Agregado total ---------------------------- */

export type PostTradeAnalytics = {
  result: ResultAnalysis;
  leverage: LeverageAnalysis;
  deviations: Deviation[];
  ema50: Ema50Analysis;
  excursions: ExcursionAnalysis;
  scorecard: ScorecardItem[];
  diagnosis: { text: string; verdict: Verdict };
};

/**
 * Fuente ÚNICA de las referencias plan/real a partir de una fila de evaluación
 * ya guardada en el servidor. La usan la interfaz post-trade y ANIKE IA para no
 * duplicar el mapeo de campos. No calcula nada: sólo normaliza a número finito.
 */
export function refsFromRow(
  row: Record<string, unknown>,
  capitalFallback?: number | null,
): { planned: PlannedRef; real: RealRef } {
  const risk = (row["risk"] ?? {}) as Record<string, unknown>;
  const saved = (row["post_trade_inputs"] ?? {}) as Record<string, unknown>;
  const direction = row["direction"];
  return {
    planned: {
      entry: finite(risk["entry"]),
      stopLoss: finite(risk["stop"]) ?? finite(risk["slFibo"]),
      takeProfit: finite(risk["target"]),
      riskPct: finite(risk["riskPct"]),
      capital: finite(risk["capital"]),
    },
    real: {
      direction: direction === "SHORT" ? "SHORT" : direction === "LONG" ? "LONG" : null,
      entry: finite(row["entry_price"]),
      exit: finite(row["exit_price"]),
      stopLoss: finite(row["stop_loss"]),
      takeProfit: finite(row["take_profit"]),
      quantity: finite(row["quantity"]),
      netPnl: finite(row["net_pnl"]),
      grossPnl: finite(row["gross_pnl"]),
      fees: finite(row["fees"]),
      riskAmount: finite(row["risk_amount"]),
      riskPercent: finite(row["risk_percent"]),
      plannedRr: finite(row["planned_rr"]),
      resultR: finite(row["result_r"]),
      capital: finite(saved["capital"]) ?? finite(capitalFallback),
      leverage: finite(row["leverage"]),
      margin: finite(row["margin"]),
      notionalValue: finite(row["notional_value"]),
      ema50: finite(saved["ema50"]),
      ema50Close: finite(saved["ema50Close"]),
      maxFavorablePrice: finite(saved["maxFavorablePrice"]),
      maxAdversePrice: finite(saved["maxAdversePrice"]),
      followedPlan: (row["followed_plan"] ?? null) as string | null,
      emotionalStop: (row["emotional_stop"] ?? null) as boolean | null,
      hardRules: (row["hard_rules"] ?? null) as string[] | null,
    },
  };
}

export function analyzePostTradeAll(planned: PlannedRef, real: RealRef): PostTradeAnalytics {
  const result = analyzeResult(real, planned);
  const deviations = analyzeDeviations(planned, real);
  const excursions = analyzeExcursions(real, result);
  return {
    result,
    leverage: analyzeLeverage({
      capital: real.capital ?? planned.capital,
      notional: real.notionalValue,
      leverage: real.leverage,
      margin: real.margin,
    }),
    deviations,
    ema50: analyzeEma50(real, planned),
    excursions,
    scorecard: buildScorecard(result, deviations, real),
    diagnosis: buildDiagnosis(result, deviations, excursions),
  };
}

/**
 * Datos estructurados y sólo de lectura para que ANIKE IA pueda responder
 * qué funcionó, qué falló, qué se aprendió y qué hacer distinto.
 * No contiene score, gates, invalidaciones globales ni clasificación de entrada: el motor
 * de aprobación queda fuera de este payload por diseño.
 */
export function buildAiPostTradeContext(a: PostTradeAnalytics) {
  return {
    result: {
      status: a.result.status,
      netPnl: a.result.netPnl,
      resultR: a.result.resultR,
      percentOnCapital: a.result.percentOnCapital,
      costs: a.result.costs,
    },
    deviations: a.deviations.map((d) => ({ kind: d.kind, label: d.label, verdict: d.verdict })),
    excursions: {
      mfeR: a.excursions.mfeR,
      maeR: a.excursions.maeR,
      captureEfficiency: a.excursions.captureEfficiency,
    },
    ema50: {
      registered: a.ema50.ema50 !== null,
      reachedBeforeClose: a.ema50.reachedBeforeClose,
      capturedPercentOfPotential: a.ema50.capturedPercentOfPotential,
    },
    scorecard: a.scorecard.map((s) => ({ area: s.area, verdict: s.verdict, label: s.label })),
    diagnosis: a.diagnosis.text,
  };
}
