import { SECTIONS, type SectionId } from "./checklist";

export type Answers = Record<string, string>;

export type RiskData = {
  capital?: number;
  riskPct?: number;
  entry?: number;
  stop?: number;
  target?: number;
};

export type RiskMetrics = {
  riskMoney: number | null;
  stopDistance: number | null;
  rr: number | null;
  positionSize: number | null;
  riskPctUsed: number | null;
};

export function computeRisk(r: RiskData): RiskMetrics {
  const capital = num(r.capital);
  const pct = num(r.riskPct);
  const entry = num(r.entry);
  const stop = num(r.stop);
  const target = num(r.target);

  const riskMoney = capital !== null && pct !== null ? (capital * pct) / 100 : null;
  const stopDistance = entry !== null && stop !== null ? Math.abs(entry - stop) : null;
  const rewardDistance = entry !== null && target !== null ? Math.abs(target - entry) : null;
  const rr =
    stopDistance && rewardDistance && stopDistance > 0
      ? round(rewardDistance / stopDistance, 2)
      : null;
  const positionSize =
    riskMoney !== null && stopDistance !== null && stopDistance > 0
      ? round(riskMoney / stopDistance, 4)
      : null;

  return { riskMoney: riskMoney === null ? null : round(riskMoney, 2), stopDistance: stopDistance === null ? null : round(stopDistance, 6), rr, positionSize, riskPctUsed: pct };
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function round(n: number, d: number) {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}

export type Breakdown = Record<SectionId, { earned: number; weight: number; answered: number; total: number }>;

export function computeScore(answers: Answers): { score: number; breakdown: Breakdown } {
  const breakdown = {} as Breakdown;
  let total = 0;

  for (const section of SECTIONS) {
    const questions = section.groups.flatMap((g) => g.questions);
    let got = 0;
    let max = 0;
    let answered = 0;
    for (const q of questions) {
      const best = Math.max(...q.options.map((o) => o.pts));
      max += best;
      const value = answers[q.id];
      if (value !== undefined) {
        answered += 1;
        const opt = q.options.find((o) => o.v === value);
        got += opt ? opt.pts : 0;
      }
    }
    const earned = max > 0 ? round((got / max) * section.weight, 2) : 0;
    breakdown[section.id] = { earned, weight: section.weight, answered, total: questions.length };
    total += earned;
  }

  return { score: Math.max(0, Math.min(100, Math.round(total))), breakdown };
}

export type Classification = "SETUP A+" | "SETUP A" | "SETUP B" | "NO TRADE";
export type Light = "ok" | "warn" | "stop";

export function classify(score: number): { classification: Classification; light: Light; message: string } {
  if (score >= 85)
    return {
      classification: "SETUP A+",
      light: "ok",
      message: "Entrada válida si cumple las reglas de riesgo.",
    };
  if (score >= 75)
    return { classification: "SETUP A", light: "ok", message: "Entrada permitida." };
  if (score >= 65)
    return { classification: "SETUP B", light: "warn", message: "Esperar confirmación adicional." };
  return { classification: "NO TRADE", light: "stop", message: "No ejecutar." };
}

export const HARD_RULES: { id: string; label: string; test: (ctx: HardRuleCtx) => boolean }[] = [
  {
    id: "no_invalidation",
    label: "No existe un punto claro de invalidación.",
    test: ({ a }) => a["r_invalidation"] === "no" || a["r_stop_logic"] === "por_poner",
  },
  {
    id: "risk_over_limit",
    label: "El riesgo supera el límite establecido.",
    test: ({ risk, maxRiskPct }) =>
      risk.riskPctUsed !== null && risk.riskPctUsed !== undefined && risk.riskPctUsed > maxRiskPct,
  },
  {
    id: "no_room",
    label: "No existe espacio suficiente hacia el objetivo.",
    test: ({ a }) => a["r_space"] === "no" || a["rc_room"] === "no",
  },
  {
    id: "intuition",
    label: "La entrada depende exclusivamente de intuición.",
    test: ({ a }) => a["cf_basis"] === "intuicion",
  },
  {
    id: "fomo",
    label: "La operación está motivada por FOMO.",
    test: ({ a }) => a["ds_motive"] === "fomo",
  },
  {
    id: "revenge",
    label: "La operación busca recuperar una pérdida.",
    test: ({ a }) => a["ds_motive"] === "revancha",
  },
  {
    id: "before_confirmation",
    label: "Se está entrando antes de la confirmación definida.",
    test: ({ a }) => a["m5_timing"] === "antes",
  },
  {
    id: "off_plan",
    label: "El setup no pertenece al plan operativo.",
    test: ({ a, setup, preferredSetups }) =>
      a["ds_plan"] === "forzando" ||
      (preferredSetups.length > 0 && !!setup && !preferredSetups.includes(setup)),
  },
];

export type HardRuleCtx = {
  a: Answers;
  risk: RiskMetrics;
  maxRiskPct: number;
  setup?: string | null | undefined;
  preferredSetups: string[];
};

export function checkHardRules(ctx: HardRuleCtx) {
  return HARD_RULES.filter((r) => r.test(ctx)).map((r) => r.label);
}

export function isEmotional(a: Answers) {
  return (
    a["ds_why"] === "impulso" ||
    a["ds_motive"] === "fomo" ||
    a["ds_motive"] === "revancha" ||
    a["ds_motive"] === "aburrimiento"
  );
}

export type Decision = {
  score: number;
  breakdown: Breakdown;
  classification: Classification;
  light: Light;
  message: string;
  hardRules: string[];
  emotional: boolean;
  blocked: boolean;
};

export function evaluate(input: {
  answers: Answers;
  risk: RiskData;
  maxRiskPct: number;
  setup?: string | null;
  preferredSetups?: string[];
}): Decision {
  const { score, breakdown } = computeScore(input.answers);
  const metrics = computeRisk(input.risk);
  const hardRules = checkHardRules({
    a: input.answers,
    risk: metrics,
    maxRiskPct: input.maxRiskPct,
    setup: input.setup,
    preferredSetups: input.preferredSetups ?? [],
  });
  const emotional = isEmotional(input.answers);
  const blocked = hardRules.length > 0 || emotional;
  const base = classify(score);

  if (blocked) {
    return {
      score,
      breakdown,
      classification: "NO TRADE",
      light: "stop",
      message: "No ejecutar.",
      hardRules,
      emotional,
      blocked,
    };
  }

  return { score, breakdown, ...base, hardRules, emotional, blocked };
}
