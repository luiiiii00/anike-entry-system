/**
 * Biblioteca — subida de PDF por administrador.
 *
 * Cubre: validación del archivo/título/sección, ruta asociada a la sección,
 * lectura existente intacta y las barreras del servidor (RLS de la tabla,
 * política de Storage y restricciones CHECK). Las barreras del servidor se
 * comprueban en el SQL aplicado y, cuando hay red, con llamadas directas al
 * backend sin sesión de administrador (deben ser rechazadas).
 */
import { describe, expect, it, mock } from "bun:test";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

mock.module("@/integrations/supabase/client", () => ({ supabase: {} }));
const lib = await import("../src/lib/library");

const pdf = (over: Partial<{ name: string; type: string; size: number }> = {}) => ({
  name: "Manual.pdf",
  type: "application/pdf",
  size: 1024,
  ...over,
});

const sqlFiles = ["supabase/migrations", "drizzle/migrations"]
  .filter(existsSync)
  .flatMap((d) =>
    readdirSync(d)
      .filter((f) => f.endsWith(".sql"))
      .map((f) => readFileSync(join(d, f), "utf8")),
  )
  .join("\n");

describe("validación de la subida", () => {
  it("PDF válido con sección y título es aceptado", () => {
    expect(lib.validateLibraryUpload({ block: "03", title: "Fibonacci", description: "", file: pdf() })).toBeNull();
  });

  it("archivo no PDF es rechazado (tipo o extensión)", () => {
    const base = { block: "02", title: "Doc", description: "" };
    expect(lib.validateLibraryUpload({ ...base, file: pdf({ type: "image/png", name: "a.png" }) })).toMatch(/PDF/);
    expect(lib.validateLibraryUpload({ ...base, file: pdf({ name: "a.exe" }) })).toMatch(/PDF/);
    expect(lib.validateLibraryUpload({ ...base, file: pdf({ type: "text/plain" }) })).toMatch(/PDF/);
  });

  it("firma real %PDF- obligatoria", async () => {
    expect(await lib.hasPdfSignature(new Blob(["%PDF-1.7 ..."]))).toBe(true);
    expect(await lib.hasPdfSignature(new Blob(["MZ fake pdf"]))).toBe(false);
  });

  it("título, sección, tamaño y archivo vacío se validan", () => {
    expect(lib.validateLibraryUpload({ block: "02", title: " a ", description: "", file: pdf() })).toMatch(/título/);
    expect(lib.validateLibraryUpload({ block: "02", title: "x".repeat(201), description: "", file: pdf() })).toMatch(/título/);
    expect(lib.validateLibraryUpload({ block: "07", title: "Doc", description: "", file: pdf() })).toMatch(/sección/);
    expect(lib.validateLibraryUpload({ block: "02", title: "Doc", description: "", file: pdf({ size: 0 }) })).toMatch(/vacío/);
    expect(lib.validateLibraryUpload({ block: "02", title: "Doc", description: "", file: pdf({ size: 31 * 1024 * 1024 }) })).toMatch(/30 MB/);
    expect(lib.validateLibraryUpload({ block: "02", title: "Doc", description: "", file: null })).toMatch(/PDF/);
  });
});

describe("asociación a la sección", () => {
  it("las seis secciones oficiales se mantienen", () => {
    expect(lib.LIBRARY_BLOCK_IDS).toEqual(["01", "02", "03", "04", "05", "06"]);
  });

  it("la ruta en Storage queda dentro de la carpeta de la sección elegida", () => {
    for (const b of lib.LIBRARY_BLOCK_IDS) {
      const p = lib.libraryStoragePath(b, "Mi archivo (v2).PDF", 1);
      expect(p.split("/")[0]).toBe(b);
      expect(p).toBe(`${b}/1-Mi_archivo_v2_.pdf`);
    }
  });
});

describe("lectura existente de la Biblioteca", () => {
  it("se conservan los materiales estáticos de cada bloque", () => {
    const counts = lib.LIBRARY_BLOCKS.map((b) => b.docs.length);
    expect(counts).toEqual([0, 2, 4, 2, 1, 0]);
  });

  it("la lectura sigue usando URL firmada temporal (bucket privado)", () => {
    const src = readFileSync("src/lib/library.ts", "utf8");
    expect(src).toMatch(/createSignedUrl\(path, 60 \* 30\)/);
    expect(src).not.toMatch(/getPublicUrl/);
  });
});

describe("protección server-side (SQL aplicado)", () => {
  it("solo admin puede insertar/modificar/eliminar registros", () => {
    expect(sqlFiles).toMatch(/"admins manage library"[\s\S]*FOR ALL TO authenticated[\s\S]*private\.is_admin\(auth\.uid\(\)\)/);
  });

  it("Storage: insertar exige admin + .pdf + carpeta de sección existente", () => {
    expect(sqlFiles).toMatch(
      /"admins insert library files"[\s\S]*private\.is_admin\(auth\.uid\(\)\)[\s\S]*storage\.extension\(name\)\) = 'pdf'[\s\S]*'01','02','03','04','05','06'/,
    );
    expect(sqlFiles).toMatch(/"admins delete library files"[\s\S]*private\.is_admin/);
  });

  it("lectura protegida: acceso activo o admin, sin acceso anónimo", () => {
    expect(sqlFiles).toMatch(/"active access read library files"[\s\S]*has_active_access/);
    expect(sqlFiles).not.toMatch(/library_documents TO anon/);
  });

  it("restricciones CHECK de la tabla", () => {
    for (const c of ["library_documents_title_len", "library_documents_pdf_path", "library_documents_path_matches_block", "library_documents_size_range"]) {
      expect(sqlFiles).toContain(c);
    }
  });

  it("los mensajes de error no exponen detalles internos", () => {
    expect(lib.friendlyLibraryError("new row violates row-level security policy")).toMatch(/administrador/);
    expect(lib.friendlyLibraryError("weird internal")).not.toMatch(/internal/);
  });
});

const URL = process.env["VITE_SUPABASE_URL"] ?? process.env["SUPABASE_URL"];
const KEY = process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ?? process.env["SUPABASE_PUBLISHABLE_KEY"];

describe.if(!!URL && !!KEY)("llamada directa al backend sin permisos de admin", () => {
  const h = { apikey: KEY!, "Content-Type": "application/json" };

  it("no puede registrar un documento", async () => {
    const r = await fetch(`${URL}/rest/v1/library_documents`, {
      method: "POST",
      headers: { ...h, Prefer: "return=minimal" },
      body: JSON.stringify({ block: "02", title: "Hack", storage_path: "02/h.pdf", size: 10, created_by: "00000000-0000-0000-0000-000000000000" }),
    });
    expect(r.ok).toBe(false);
  });

  it("no puede subir un archivo al almacenamiento", async () => {
    const r = await fetch(`${URL}/storage/v1/object/library/02/hack-${Date.now()}.pdf`, {
      method: "POST",
      headers: { apikey: KEY!, Authorization: `Bearer ${KEY}`, "Content-Type": "application/pdf" },
      body: "%PDF-1.4 hack",
    });
    expect(r.ok).toBe(false);
  });

  it("no puede listar ni leer documentos", async () => {
    const r = await fetch(`${URL}/rest/v1/library_documents?select=id`, { headers: h });
    const rows = r.ok ? ((await r.json()) as unknown[]) : [];
    expect(rows.length).toBe(0);
  });
});

describe("ubicación del flujo administrativo", () => {
  const admin = readFileSync("src/routes/admin.tsx", "utf8");
  const libros = readFileSync("src/routes/_authenticated/libros.tsx", "utf8");
  const comp = readFileSync("src/components/AdminLibrary.tsx", "utf8");

  it("Admin > Biblioteca existe en el panel de administración (ruta con gate de rol admin)", () => {
    expect(admin).toMatch(/<AdminLibrary \/>/);
    expect(admin).toMatch(/\.eq\("role", "admin"\)/);
    expect(comp).toContain("Admin &gt; Biblioteca");
    expect(comp).toContain("Subir PDF a Biblioteca");
    expect(comp).toMatch(/uploadLibraryDoc/);
  });

  it("la Biblioteca normal no expone el control de subida", () => {
    expect(libros).not.toMatch(/uploadLibraryDoc|AdminUpload|AdminLibrary|type="file"/);
  });

  it("un solo formulario de subida en todo el proyecto", () => {
    const files = readdirSync("src", { recursive: true }) as string[];
    const users = files
      .filter((f) => /\.tsx?$/.test(f) && !f.endsWith("library.ts"))
      .filter((f) => readFileSync(join("src", f), "utf8").includes("uploadLibraryDoc("));
    expect(users).toEqual([join("components", "AdminLibrary.tsx")]);
  });
});
