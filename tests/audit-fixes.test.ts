import { afterEach, describe, expect, test } from "bun:test";
import {
  applyChecklistOverlay,
  activeQuestionIds,
  checklistOverlayIssues,
  EMPTY_OVERLAY,
  getActiveQuestionsBySetup,
  lockOverlayMethodology,
  overlayMethodologyIssues,
  type ChecklistOverlay,
} from "../src/lib/checklist";
import { checkCompletion } from "../src/lib/evaluation-completion";
import { isCompleted } from "../src/lib/stats";
import { checkPendingConditions, evaluate } from "../src/lib/scoring";
import { INTERNAL_WEIGHT_TABLE } from "../src/lib/internal-weights";
import { readFileSync } from "node:fs";
import type { Evaluation } from "../src/lib/db";

const ov = (p: Partial<ChecklistOverlay>): ChecklistOverlay => ({ ...EMPTY_OVERLAY, ...p });
afterEach(() => applyChecklistOverlay(null));

function best(S: string) {
  const a: Record<string, string> = {};
  for (const q of getActiveQuestionsBySetup(S as never)) {
    const top = [...q.options].sort((x, y) => y.pts - x.pts)[0];
    if (top) a[q.id] = top.v;
  }
  return a;
}
const risk = { capital: 10000, riskPct: 1, entry: 100, stop: 90, target: 120 };
const run = (S: string, answers: Record<string, string>) =>
  evaluate({ answers, risk, setup: S, direction: "LONG", maxRiskPct: 1 });

describe("FIX 1 — completed + BORRADOR", () => {
  test("incompleta + completed → rechazada (permanece BORRADOR)", () => {
    const a = best("REVERSION");
    delete a[Object.keys(a)[0]!];
    const d = run("REVERSION", a);
    expect(d.complete).toBe(false);
    expect(d.finalState).toBe("BORRADOR");
    for (const decision of ["registrado", "no_trade"] as const) {
      const c = checkCompletion({
        status: "completed",
        decision,
        asset: "EURUSD",
        complete: d.complete,
        rejected: d.globalInvalidation,
        finalState: d.finalState,
      });
      expect(c).toEqual({ ok: false, code: "incomplete_cannot_complete" });
    }
  });
  test("completa + completed → permitido según estado calculado", () => {
    const d = run("REVERSION", best("REVERSION"));
    expect(d.finalState).toBe("APROBADA");
    const base = {
      status: "completed" as const,
      asset: "EURUSD",
      complete: d.complete,
      rejected: d.globalInvalidation,
      finalState: d.finalState,
    };
    expect(checkCompletion({ ...base, decision: "registrado" }).ok).toBe(true);
    expect(checkCompletion({ ...base, decision: "no_trade" }).ok).toBe(true);
    expect(checkCompletion({ ...base, finalState: "CONDICIONAL", decision: "registrado" })).toEqual(
      { ok: false, code: "conditional_cannot_register" },
    );
  });
  test("draft siempre se acepta como borrador", () => {
    expect(
      checkCompletion({ status: "draft", complete: false, rejected: false, finalState: "BORRADOR" })
        .ok,
    ).toBe(true);
  });
  test("el servidor usa la regla de finalización", () => {
    const src = readFileSync("src/lib/evaluations.functions.ts", "utf8");
    expect(src).toContain("checkCompletion(");
  });
  test("incompleta no cuenta como finalizada en estadísticas", () => {
    const e = (s: string, f: string | null) =>
      ({ status: s, final_state: f }) as unknown as Evaluation;
    expect(isCompleted(e("completed", "BORRADOR"))).toBe(false);
    expect(isCompleted(e("draft", null))).toBe(false);
    expect(isCompleted(e("completed", "APROBADA"))).toBe(true);
    expect(isCompleted(e("completed", null))).toBe(true); // histórico
  });
});

describe("FIX 2 — bloqueo de metodología en overlays", () => {
  const id = "S01_DISC_01";
  const q = () => getActiveQuestionsBySetup("REVERSION").find((x) => x.id === id)!;
  test("cambiar factores → rechazado y neutralizado", () => {
    const opts = q().options.map((o) => ({
      v: o.v,
      label: o.label,
      pts: o.v === "ausente" ? 1 : o.pts,
    }));
    const o = ov({ edits: { [id]: { options: opts } } });
    expect(overlayMethodologyIssues(o).length).toBeGreaterThan(0);
    expect(checklistOverlayIssues(o).some((i) => i.includes(id))).toBe(true);
    expect(lockOverlayMethodology(o).edits[id]?.options).toBeUndefined();
  });
  test("retirar pregunta oficial → rechazado y neutralizado", () => {
    const o = ov({ disabled: [id] });
    expect(overlayMethodologyIssues(o).length).toBe(1);
    applyChecklistOverlay(lockOverlayMethodology(o));
    expect(getActiveQuestionsBySetup("REVERSION").some((x) => x.id === id)).toBe(true);
  });
  test("añadir pregunta puntuable sin peso oficial → rechazado", () => {
    const o = ov({
      added: [
        {
          id: "x_new",
          sectionId: "zona",
          owner: "REVERSION",
          label: "¿X?",
          options: [
            { v: "si", label: "Sí", pts: 1 },
            { v: "no", label: "No", pts: 0 },
          ],
        },
      ],
    });
    expect(overlayMethodologyIssues(o).length).toBe(1);
    expect(lockOverlayMethodology(o).added).toEqual([]);
  });
  test("cambios editoriales siguen permitidos", () => {
    const opts = q().options.map((o) => ({ v: o.v, label: `${o.label}!`, pts: o.pts }));
    const o = ov({ edits: { [id]: { label: "Nuevo enunciado", hint: "ayuda", options: opts } } });
    expect(overlayMethodologyIssues(o)).toEqual([]);
    expect(checklistOverlayIssues(o)).toEqual([]);
    applyChecklistOverlay(lockOverlayMethodology(o));
    expect(q().label).toBe("Nuevo enunciado");
    expect(q().options[0]!.label.endsWith("!")).toBe(true);
    expect(run("REVERSION", best("REVERSION")).score).toBe(100);
  });
  test("la capa publicada se aplica bloqueada", () => {
    expect(readFileSync("src/lib/checklist-overlay.ts", "utf8")).toContain(
      "lockOverlayMethodology(row.overlay)",
    );
  });
});

describe("FIX 3 — pendingConditions aislado por setup", () => {
  test("una respuesta pendiente de otro setup no afecta", () => {
    const extra = { r_sl_fibo_ok: "revision", ex_conditions: "parcial" };
    const ids = activeQuestionIds("REVERSION", best("REVERSION"));
    for (const k of Object.keys(extra)) expect(ids.has(k)).toBe(false);
    expect(checkPendingConditions(extra, ids)).toEqual([]);
    const d = run("REVERSION", { ...best("REVERSION"), ...extra });
    expect(d.warnings).toEqual([]);
    expect(d.finalState).toBe("APROBADA");
  });
  test("sólo IDs activos generan pendientes; sin setup se conserva el comportamiento global", () => {
    const extra = { r_sl_fibo_ok: "revision" };
    expect(checkPendingConditions(extra, new Set(["r_sl_fibo_ok"])).length).toBe(1);
    expect(checkPendingConditions(extra).length).toBe(1);
  });
  test("preguntas activas del setup siguen generando pendientes", () => {
    const ids = activeQuestionIds("FREE", best("FREE"));
    const active = ["r_sl_fibo_ok", "ex_conditions"].filter((k) => ids.has(k));
    expect(active.length).toBeGreaterThan(0);
    const a = { ...best("FREE"), r_sl_fibo_ok: "revision", ex_conditions: "parcial" };
    expect(checkPendingConditions(a, ids).length).toBe(active.length);
  });
});

describe("FIX 4 — pesos RAW", () => {
  test("cada bloque de cada setup suma 100 RAW; sin divisiones", () => {
    const sums: Record<string, number> = {};
    for (const e of INTERNAL_WEIGHT_TABLE) {
      if (e.id === "S03_STR_03") continue; // variante excluyente de S03_STR_02
      const k = `${e.setup}/${e.section}`;
      sums[k] = (sums[k] ?? 0) + e.w;
    }
    for (const [k, t] of Object.entries(sums)) expect(Math.abs(t - 100), k).toBeLessThan(1e-6);
  });
  test("metadata / validation-only = 0 %", () => {
    for (const S of [
      "REVERSION",
      "CONTINUACION",
      "RUPTURA_RETESTEO",
      "ZONA_FIBONACCI",
      "IMPULSO_PULLBACK",
    ])
      for (const q of getActiveQuestionsBySetup(S as never))
        if (q.meta || q.validationOnly)
          expect(INTERNAL_WEIGHT_TABLE.find((e) => e.id === q.id)?.w ?? 0).toBe(0);
  });
});
