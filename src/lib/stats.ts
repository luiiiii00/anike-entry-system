import type { Evaluation } from "./db";
import { isEmotional } from "./scoring";

export type Stats = {
  total: number;
  approved: number;
  noTrade: number;
  registered: number;
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
};

const completed = (e: Evaluation) => e.status === "completed";

export function computeStats(list: Evaluation[]): Stats {
  const done = list.filter(completed);
  const registered = done.filter((e) => e.decision === "registrado");
  const closed = registered.filter((e) => e.result_r !== null && e.result_r !== undefined);
  const wins = closed.filter((e) => (e.result_r ?? 0) > 0).length;
  const scores = done.map((e) => e.score ?? 0);
  const rs = closed.map((e) => Number(e.result_r));

  const bySetup = new Map<string, number[]>();
  for (const e of closed) {
    const key = e.setup ?? "Sin setup";
    bySetup.set(key, [...(bySetup.get(key) ?? []), Number(e.result_r)]);
  }
  const setupAvgs = [...bySetup.entries()]
    .map(([setup, values]) => ({ setup, avg: avg(values)!, n: values.length }))
    .sort((a, b) => b.avg - a.avg);

  return {
    total: done.length,
    approved: done.filter((e) => e.classification && e.classification !== "NO TRADE").length,
    noTrade: done.filter((e) => e.classification === "NO TRADE").length,
    registered: registered.length,
    closed: closed.length,
    wins,
    winRate: closed.length ? Math.round((wins / closed.length) * 100) : null,
    avgR: avg(rs) === null ? null : round(avg(rs)!, 2),
    avgScore: avg(scores) === null ? null : Math.round(avg(scores)!),
    totalR: round(rs.reduce((a, b) => a + b, 0), 2),
    totalMoney: round(
      closed.reduce((a, e) => a + Number(e.result_money ?? 0), 0),
      2,
    ),
    impulsive: done.filter((e) => e.emotional_stop || isEmotional(e.answers ?? {})).length,
    offPlan: done.filter((e) => (e.hard_rules ?? []).length > 0).length,
    bestSetup: setupAvgs[0]?.setup ?? null,
    worstSetup: setupAvgs.length > 1 ? setupAvgs[setupAvgs.length - 1]!.setup : null,
  };
}

function avg(values: number[]) {
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function round(n: number, d: number) {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}

export function equityCurve(list: Evaluation[]) {
  const closed = list
    .filter((e) => e.status === "completed" && e.result_r !== null && e.result_r !== undefined)
    .slice()
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  let acc = 0;
  return closed.map((e, i) => {
    acc = round(acc + Number(e.result_r), 2);
    return { name: `#${e.trade_no ?? i + 1}`, r: acc };
  });
}

export function setupDistribution(list: Evaluation[]) {
  const map = new Map<string, number>();
  for (const e of list.filter(completed)) {
    const key = e.setup ?? "Sin setup";
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return [...map.entries()].map(([name, value]) => ({ name, value }));
}

export function scoreVsResult(list: Evaluation[]) {
  return list
    .filter((e) => e.status === "completed" && e.result_r !== null && e.score !== null)
    .map((e) => ({ score: e.score as number, r: Number(e.result_r) }));
}

export function longVsShort(list: Evaluation[]) {
  const out = [
    { name: "LONG", trades: 0, r: 0 },
    { name: "SHORT", trades: 0, r: 0 },
  ];
  for (const e of list.filter(completed)) {
    const row = e.direction === "SHORT" ? out[1]! : out[0]!;
    row.trades += 1;
    row.r = round(row.r + Number(e.result_r ?? 0), 2);
  }
  return out;
}

export function buildInsights(list: Evaluation[], stats: Stats): string[] {
  const insights: string[] = [];
  const done = list.filter(completed);
  if (done.length < 3) {
    insights.push(
      "Aún hay pocas evaluaciones registradas. Con más datos podrás observar patrones reales en tu proceso.",
    );
    return insights;
  }

  const closed = done.filter((e) => e.result_r !== null);
  const aPlus = closed.filter((e) => e.classification === "SETUP A+" || e.classification === "SETUP A");
  const b = closed.filter((e) => e.classification === "SETUP B");
  if (aPlus.length >= 2 && b.length >= 2) {
    const avgA = mean(aPlus.map((e) => Number(e.result_r)));
    const avgB = mean(b.map((e) => Number(e.result_r)));
    insights.push(
      avgA > avgB
        ? `Tus operaciones con clasificación A/A+ muestran un promedio de ${avgA.toFixed(2)}R frente a ${avgB.toFixed(2)}R en las B.`
        : `Tus operaciones B muestran un promedio de ${avgB.toFixed(2)}R frente a ${avgA.toFixed(2)}R en las A/A+. Revisa qué cambia en tu ejecución.`,
    );
  }

  const rev = closed.filter((e) => e.setup === "Reversión");
  if (rev.length >= 3) {
    insights.push(
      `Tus operaciones de reversión promedian ${mean(rev.map((e) => Number(e.result_r))).toFixed(2)}R en ${rev.length} registros.`,
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
  return values.reduce((a, b) => a + b, 0) / (values.length || 1);
}
