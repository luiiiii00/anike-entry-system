/**
 * Pruebas de autorización NO DESTRUCTIVAS.
 *
 * LIMITACIÓN DECLARADA: en este entorno no existe una base PostgreSQL local ni
 * dos sesiones reales de usuarios distintos, por lo que NO se ejecutan las
 * políticas RLS vivas. Estas pruebas verifican los guardas reales del código
 * (middleware de autenticación, alcance por user_id, ausencia de cliente admin
 * en rutas de datos de usuario) y el SQL de las migraciones aplicadas que
 * define el aislamiento entre usuarios y el requisito de acceso activo.
 * No escriben ni leen datos reales de ningún usuario.
 */
import { describe, expect, it } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(p, "utf8");

const USER_FUNCTIONS = [
  "src/lib/evaluations.functions.ts",
  "src/lib/posttrade.functions.ts",
  "src/lib/ai.functions.ts",
];

const migrations = readdirSync("supabase/migrations")
  .filter((f) => f.endsWith(".sql"))
  .map((f) => read(join("supabase/migrations", f)))
  .join("\n");

describe("guardas de las funciones de servidor", () => {
  for (const file of USER_FUNCTIONS) {
    const src = read(file);

    it(`${file} exige sesión autenticada en cada función`, () => {
      const fns = src.match(/createServerFn\(/g) ?? [];
      const guards = src.match(/requireSupabaseAuth/g) ?? [];
      expect(fns.length).toBeGreaterThan(0);
      // Un requireSupabaseAuth por función + el import.
      expect(guards.length).toBeGreaterThanOrEqual(fns.length);
    });

    it(`${file} nunca confía en un user_id enviado por el cliente`, () => {
      expect(src).not.toMatch(/data\.user_?[Ii]d/);
      expect(src).not.toMatch(/data\.userId/);
    });

    it(`${file} no usa el cliente admin para datos de usuario`, () => {
      expect(src).not.toContain("client.server");
      expect(src).not.toContain("supabaseAdmin");
    });
  }

  it("usuario A no puede leer ni cerrar la evaluación de B: todo va filtrado por su propio userId", () => {
    for (const file of ["src/lib/evaluations.functions.ts", "src/lib/posttrade.functions.ts"]) {
      const src = read(file);
      const byId = src.match(/\.eq\("id",/g) ?? [];
      const byUser = src.match(/\.eq\("user_id",\s*(context\.)?userId\)/g) ?? [];
      expect(byId.length).toBeGreaterThan(0);
      // Cada acceso por id va acompañado de un filtro por el usuario de la sesión.
      expect(byUser.length).toBeGreaterThanOrEqual(byId.length);
    }
  });
});

describe("políticas de base de datos aplicadas", () => {
  it("las evaluaciones están aisladas por usuario y exigen acceso activo", () => {
    expect(migrations).toContain("has_active_access");
    expect(migrations).toMatch(/evaluations[\s\S]*auth\.uid\(\) = user_id/);
  });

  it("la biblioteca y las revisiones de IA exigen acceso activo o admin", () => {
    expect(migrations).toMatch(/library_documents[\s\S]*has_active_access/);
    expect(migrations).toMatch(/ai_reviews[\s\S]*has_active_access/);
  });

  it("los campos derivados del motor están protegidos por trigger, no por el cliente", () => {
    expect(migrations).toContain("protect_evaluation_fields");
  });

  it("la numeración se asigna en servidor con unicidad por usuario", () => {
    expect(migrations).toContain("next_trade_no");
    expect(migrations).toMatch(/UNIQUE INDEX[\s\S]*evaluations[\s\S]*user_id, trade_no/i);
  });
});
