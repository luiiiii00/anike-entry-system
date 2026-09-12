/**
 * ANIKE EJEPIKA — POST-TRADE ANALYTICS
 *
 * Analítica de operaciones YA CERRADAS. Sólo mide y describe lo registrado.
 * NO toca el motor de entrada (pesos, gates, HARD rules, score, aprobación):
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
const tolerance = (ref: number | null) =>
  ref === null || ref === 0 ? 0 : Math.abs(ref) * 0.0005;

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
    capital !== null && capital > 0 && finite(planned.riskPct) !== null && finite(planned.riskPct)! > 0
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
  const netPnl =
    finite(real.netPnl) ?? (grossPnl !== null ? grossPnl - (costs ?? 0) : null);

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
    notional !== null && notional > 0 && capital !== null && capital > 0 ? notional / capital : null;

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

  return {
    ema50: ema,
    entryDistance,
    initialTarget: target,
    closePrice: exit,
    reachedBeforeClose: reached,
    capturedMove: captured,
    potentialMove: potential,
    capturedPercentOfPotential:
      captured !== null && potential !== null && potential > 0 ? (captured / potential) * 100 : null,
  };
}

/* --------------------------- MÓDULO 6: SCORECARD -------------------------- */

export type ScorecardItem = { area: string; verdict: Verdict; label: string };

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
  };

  const technical: ScorecardItem = kinds.has("entry_match")
    ? { area: "RESULTADO TÉCNICO", verdict: "ok", label: "Entrada correcta" }
    : kinds.has("entry_early") || kinds.has("entry_late")
      ? { area: "RESULTADO TÉCNICO", verdict: "warn", label: "Desviación de entrada" }
      : { area: "RESULTADO TÉCNICO", verdict: "unknown", label: "Datos insuficientes" };

  const management: ScorecardItem = kinds.has("risk_exceeded")
    ? { area: "GESTIÓN", verdict: "bad", label: "Riesgo excedido" }
    : kinds.has("risk_respected")
      ? { area: "GESTIÓN", verdict: "ok", label: "Riesgo respetado" }
      : { area: "GESTIÓN", verdict: "unknown", label: "Datos insuficientes" };

  const exitItem: ScorecardItem = kinds.has("close_at_plan")
    ? { area: "SALIDA", verdict: "ok", label: "Plan respetado" }
    : kinds.has("close_early")
      ? { area: "SALIDA", verdict: "warn", label: "Salida anticipada" }
      : kinds.has("close_late")
        ? { area: "SALIDA", verdict: "warn", label: "Salida posterior al plan" }
        : { area: "SALIDA", verdict: "unknown", label: "Datos insuficientes" };

  const followed = (real.followedPlan ?? "").toLowerCase();
  const hardRules = (real.hardRules ?? []).length > 0;
  const discipline: ScorecardItem =
    hardRules || real.emotionalStop === true
      ? { area: "DISCIPLINA", verdict: "bad", label: "Desviación de protocolo" }
      : followed.startsWith("sí")
        ? { area: "DISCIPLINA", verdict: "ok", label: "Cumplió protocolo" }
        : followed === ""
          ? { area: "DISCIPLINA", verdict: "unknown", label: "Datos insuficientes" }
          : { area: "DISCIPLINA", verdict: "warn", label: "Desviación de protocolo" };

  return [financial, technical, management, exitItem, discipline];
}

/* -------------------------- MÓDULO 7: DIAGNÓSTICO ------------------------- */

export function buildDiagnosis(
  result: ResultAnalysis,
  deviations: Deviation[],
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
  scorecard: ScorecardItem[];
  diagnosis: { text: string; verdict: Verdict };
};

export function analyzePostTradeAll(planned: PlannedRef, real: RealRef): PostTradeAnalytics {
  const result = analyzeResult(real, planned);
  const deviations = analyzeDeviations(planned, real);
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
    scorecard: buildScorecard(result, deviations, real),
    diagnosis: buildDiagnosis(result, deviations),
  };
}
