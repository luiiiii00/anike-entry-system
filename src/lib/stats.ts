import type { Evaluation } from "./db";
import { isEmotional } from "./scoring";

export type Stats = {
  /** Evaluaciones finalizadas (no borradores). No son operaciones ejecutadas. */
  total: number;
  /**
   * Evaluaciones cuya clasificación fue válida (≠ NO TRADE). Incluye CONDICIONAL,
   * por lo que NO representa operaciones ejecutadas.
   */
  classificationValid: number;
  /** Evaluaciones con estado final APROBADA (sin advertencias condicionales). */
  approved: number;
  /** Evaluaciones con estado final CONDICIONAL. */
  conditional: number;
  noTrade: number;
  /** Operaciones realmente llevadas al mercado. */
  registered: number;
  /** Operaciones registradas y cerradas con resultado. Base de las métricas financieras. */
  closed: number;
  wins: number;
  winRate: number | null;
  avgR: number | null;
  avgScore: number | null;
  totalR: number;
  totalMoney: number;
  impulsive: number;
  offPlan: number;
  bestSetup: string | null;
  worstSetup: string | null;
  losses: number;
  breakEven: number;
  netPnl: number;
  avgRoi: number | null;
  avgMoney: number | null;
  bestR: number | null;
  worstR: number | null;
  bestTrade: number | null;
  worstTrade: number | null;
};


/* ------------------------ Fuente única de verdad ------------------------ */

/** Evaluación finalizada (no borrador). */
export const isCompleted = (e: Evaluation) => e.status === "completed";

/** Operación realmente llevada al mercado. */
export const isRegistered = (e: Evaluation) => isCompleted(e) && e.decision === "registrado";

/** Operación descartada por el sistema o por el trader. */
export const isNoTrade = (e: Evaluation) =>
  isCompleted(e) && (e.decision === "no_trade" || e.classification === "NO TRADE");

const finite = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Operación cerrada: registrada Y con resultado en R numérico. */
export const isClosed = (e: Evaluation) =>
  isRegistered(e) && !isNoTrade(e) && finite(e.result_r) !== null;

/** Listas derivadas usadas por todos los cálculos. */
export function partition(list: Evaluation[]) {
  const done = list.filter(isCompleted);
  const registered = done.filter(isRegistered).filter((e) => !isNoTrade(e));
  const closed = registered.filter(isClosed);
  return { done, registered, closed };
}

export function computeStats(list: Evaluation[]): Stats {
  const { done, registered, closed } = partition(list);

  const rs = closed.map((e) => finite(e.result_r)!);
  const wins = rs.filter((r) => r > 0).length;

  // Sólo evaluaciones con score real: un score ausente no vale 0.
  const scores = done.map((e) => finite(e.score)).filter((n): n is number => n !== null);

  const bySetup = new Map<string, number[]>();
  for (const e of closed) {
    const key = e.setup ?? "Sin setup";
    bySetup.set(key, [...(bySetup.get(key) ?? []), finite(e.result_r)!]);
  }
  const setupAvgs = [...bySetup.entries()]
    .map(([setup, values]) => ({ setup, avg: avg(values)!, n: values.length }))
    .sort((a, b) => b.avg - a.avg);

  // Dinero y ROI sólo de operaciones cerradas con valor real registrado.
  const pnls = closed.map((e) => finite(e.net_pnl)).filter((n): n is number => n !== null);
  const rois = closed.map((e) => finite(e.roi_margin)).filter((n): n is number => n !== null);
  const monies = closed.map((e) => finite(e.result_money)).filter((n): n is number => n !== null);

  return {
    losses: rs.filter((r) => r < 0).length,
    breakEven: rs.filter((r) => r === 0).length,
    netPnl: round(sum(pnls), 2),
    avgRoi: avg(rois) === null ? null : round(avg(rois)!, 2),
    avgMoney: avg(monies) === null ? null : round(avg(monies)!, 2),
    bestR: rs.length ? round(Math.max(...rs), 2) : null,
    worstR: rs.length ? round(Math.min(...rs), 2) : null,
    bestTrade: monies.length ? round(Math.max(...monies), 2) : null,
    worstTrade: monies.length ? round(Math.min(...monies), 2) : null,
    total: done.length,
    // Aprobadas = evaluaciones cuya clasificación no fue NO TRADE (validez del setup,
    // independiente de si finalmente se registró la operación).
    approved: done.filter((e) => e.classification && e.classification !== "NO TRADE").length,
    noTrade: done.filter(isNoTrade).length,
    registered: registered.length,
    closed: closed.length,
    wins,
    winRate: closed.length ? Math.round((wins / closed.length) * 100) : null,
    avgR: avg(rs) === null ? null : round(avg(rs)!, 2),
    avgScore: avg(scores) === null ? null : Math.round(avg(scores)!),
    totalR: round(sum(rs), 2),
    totalMoney: round(sum(monies), 2),
    impulsive: done.filter((e) => e.emotional_stop || isEmotional(e.answers ?? {})).length,
    offPlan: done.filter((e) => (e.hard_rules ?? []).length > 0).length,
    bestSetup: setupAvgs[0]?.setup ?? null,
    worstSetup: setupAvgs.length > 1 ? setupAvgs[setupAvgs.length - 1]!.setup : null,
  };
}

function sum(values: number[]) {
  return values.reduce((a, b) => a + b, 0);
}

function avg(values: number[]) {
  if (!values.length) return null;
  return sum(values) / values.length;
}

function round(n: number, d: number) {
  if (!Number.isFinite(n)) return 0;
  const f = 10 ** d;
  return Math.round(n * f) / f;
}

export function equityCurve(list: Evaluation[]) {
  const closed = partition(list)
    .closed.slice()
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  let acc = 0;
  return closed.map((e, i) => {
    acc = round(acc + finite(e.result_r)!, 2);
    return { name: `#${e.trade_no ?? i + 1}`, r: acc };
  });
}

export function setupDistribution(list: Evaluation[]) {
  const map = new Map<string, number>();
  for (const e of list.filter(isCompleted)) {
    const key = e.setup ?? "Sin setup";
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return [...map.entries()].map(([name, value]) => ({ name, value }));
}

export function scoreVsResult(list: Evaluation[]) {
  return partition(list)
    .closed.filter((e) => finite(e.score) !== null)
    .map((e) => ({ score: finite(e.score)!, r: finite(e.result_r)! }));
}

export function longVsShort(list: Evaluation[]) {
  const out = [
    { name: "LONG", trades: 0, r: 0 },
    { name: "SHORT", trades: 0, r: 0 },
  ];
  // Sólo operaciones cerradas: una evaluación sin resultado no aporta R.
  for (const e of partition(list).closed) {
    const row = e.direction === "SHORT" ? out[1]! : out[0]!;
    row.trades += 1;
    row.r = round(row.r + finite(e.result_r)!, 2);
  }
  return out;
}

export function buildInsights(list: Evaluation[], stats: Stats): string[] {
  const insights: string[] = [];
  const { done, closed } = partition(list);
  if (done.length < 3) {
    insights.push(
      "Aún hay pocas evaluaciones registradas. Con más datos podrás observar patrones reales en tu proceso.",
    );
    return insights;
  }

  const aPlus = closed.filter((e) => e.classification === "SETUP A+" || e.classification === "SETUP A");
  const b = closed.filter((e) => e.classification === "SETUP B");
  if (aPlus.length >= 2 && b.length >= 2) {
    const avgA = mean(aPlus.map((e) => finite(e.result_r)!));
    const avgB = mean(b.map((e) => finite(e.result_r)!));
    insights.push(
      avgA > avgB
        ? `Tus operaciones con clasificación A/A+ muestran un promedio de ${avgA.toFixed(2)}R frente a ${avgB.toFixed(2)}R en las B.`
        : `Tus operaciones B muestran un promedio de ${avgB.toFixed(2)}R frente a ${avgA.toFixed(2)}R en las A/A+. Revisa qué cambia en tu ejecución.`,
    );
  }

  const rev = closed.filter((e) => e.setup === "Reversión");
  if (rev.length >= 3) {
    insights.push(
      `Tus operaciones de reversión promedian ${mean(rev.map((e) => finite(e.result_r)!)).toFixed(2)}R en ${rev.length} registros.`,
    );
  }

  const weekAgo = Date.now() - 7 * 864e5;
  const recentOffPlan = done.filter(
    (e) => new Date(e.created_at).getTime() > weekAgo && (e.hard_rules ?? []).length > 0,
  ).length;
  if (recentOffPlan > 0) {
    insights.push(`Has registrado ${recentOffPlan} evaluación(es) con reglas críticas incumplidas esta semana.`);
  }

  if (stats.impulsive > 0) {
    insights.push(
      `${stats.impulsive} evaluación(es) mostraron señales de comportamiento impulsivo. Tu punto de atención reciente aparece en disciplina.`,
    );
  }

  if (closed.length < 10) {
    insights.push(
      "Con menos de 10 operaciones cerradas estos datos son solo descriptivos: no representan una ventaja estadística.",
    );
  }

  return insights;
}

function mean(values: number[]) {
  return sum(values) / (values.length || 1);
}

/** Distribución de resultados en R (independiente del tamaño monetario). */
export function rDistribution(list: Evaluation[]) {
  const buckets = [
    { name: "≤ -2R", min: -Infinity, max: -2 },
    { name: "-2R a -1R", min: -2, max: -1 },
    { name: "-1R a 0", min: -1, max: 0 },
    { name: "0 a 1R", min: 0, max: 1 },
    { name: "1R a 2R", min: 1, max: 2 },
    { name: "> 2R", min: 2, max: Infinity },
  ];
  const out = buckets.map((b) => ({ name: b.name, value: 0 }));
  for (const e of partition(list).closed) {
    const r = finite(e.result_r)!;
    const i = buckets.findIndex((b) => r > b.min && r <= b.max);
    const idx = i === -1 ? (r <= -2 ? 0 : out.length - 1) : i;
    out[idx]!.value += 1;
  }
  return out;
}

/** Resultados agregados por activo (sólo operaciones cerradas). */
export function byAsset(list: Evaluation[]) {
  const map = new Map<string, { name: string; trades: number; r: number; money: number }>();
  for (const e of partition(list).closed) {
    const key = e.asset ?? "Sin activo";
    const row = map.get(key) ?? { name: key, trades: 0, r: 0, money: 0 };
    row.trades += 1;
    row.r = round(row.r + finite(e.result_r)!, 2);
    // El dinero sólo se suma cuando existe: nunca se inventa un 0.
    const money = finite(e.result_money);
    if (money !== null) row.money = round(row.money + money, 2);
    map.set(key, row);
  }
  return [...map.values()].sort((a, b) => b.r - a.r);
}
