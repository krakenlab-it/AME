import { afterEach, describe, expect, it, vi } from "vitest";
import { assertSupabaseConfigured, isDemoMode } from "@/lib/demo-mode";
import { isMemoryRepo, MemoryRepo } from "@/lib/database/memory-repo";
import { createDemoRepo } from "@/lib/database/demo";
import { getDemoAdminContext, startDemoSession } from "@/lib/services/demo-admin-auth";
import { pickDemoAccount, pickDemoUser } from "@/lib/demo/enter";
import { can } from "@/lib/security/rbac";

vi.mock("server-only", () => ({}));

const ENV_KEYS = ["DEMO_MODE", "VERCEL_ENV", "VERCEL", "APP_STAGE", "PORTAL_E2E", "PORTAL_PREVIEW_SANDBOX_BUILD", "SANDBOX_PREVIEW_DEMO", "SANDBOX_PREVIEW_EMPTY"] as const;
const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.restoreAllMocks();
});

describe("acceso rápido de pruebas (solo modo demostración)", () => {
  it("está apagado por defecto", () => {
    delete process.env.DEMO_MODE;
    expect(isDemoMode()).toBe(false);
  });

  it("se enciende con DEMO_MODE=true solo fuera de Vercel y de producción", () => {
    process.env.DEMO_MODE = "true";
    delete process.env.VERCEL_ENV;
    delete process.env.APP_STAGE;
    expect(isDemoMode()).toBe(true);
    process.env.VERCEL_ENV = "preview";
    expect(isDemoMode()).toBe(false);
  });

  it("no se enciende en Vercel Preview aunque falte DEMO_MODE", () => {
    delete process.env.DEMO_MODE;
    delete process.env.APP_STAGE;
    process.env.VERCEL_ENV = "preview";
    expect(isDemoMode()).toBe(false);
  });

  it("no se enciende en Preview aunque APP_STAGE diga production", () => {
    delete process.env.DEMO_MODE;
    process.env.VERCEL_ENV = "preview";
    process.env.APP_STAGE = "production";
    expect(isDemoMode()).toBe(false);
  });

  it("PORTAL_E2E enciende la base en memoria solo fuera de Vercel", () => {
    delete process.env.DEMO_MODE;
    process.env.PORTAL_E2E = "true";
    delete process.env.VERCEL;
    delete process.env.VERCEL_ENV;
    delete process.env.APP_STAGE;
    expect(isDemoMode()).toBe(true);
    process.env.VERCEL_ENV = "production";
    expect(isDemoMode()).toBe(false);
  });

  it("sin Supabase y sin base de prueba, el arranque falla cerrado", () => {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.DEMO_MODE;
    delete process.env.PORTAL_E2E;
    process.env.APP_STAGE = "production";
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    try {
      expect(isDemoMode()).toBe(false);
      expect(() => assertSupabaseConfigured()).toThrow(/SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY/);
    } finally {
      if (url === undefined) delete process.env.SUPABASE_URL;
      else process.env.SUPABASE_URL = url;
      if (key === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      else process.env.SUPABASE_SERVICE_ROLE_KEY = key;
    }
  });

  it("no se enciende en Vercel Preview durante next build", () => {
    delete process.env.DEMO_MODE;
    process.env.VERCEL_ENV = "preview";
    process.env.NEXT_PHASE = "phase-production-build";
    expect(isDemoMode()).toBe(false);
  });

  it("nunca funciona en producción, aunque la variable esté puesta", () => {
    process.env.DEMO_MODE = "true";
    process.env.VERCEL_ENV = "production";
    expect(isDemoMode()).toBe(false);
    delete process.env.VERCEL_ENV;
    process.env.APP_STAGE = "production";
    expect(isDemoMode()).toBe(false);
  });

  it("en preview sandbox el repositorio demo arranca solo con la persona ancla de simulación", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    process.env.PORTAL_PREVIEW_SANDBOX_BUILD = "true";
    const repo = createDemoRepo();
    expect(repo.people.size).toBe(1);
    expect(await repo.statusCounts()).toEqual({ PENDING: 1, STARTED: 0, COMPLETED: 0, NEEDS_REVIEW: 0 });
  });

  it("el repositorio demo trae un administrador por rol y personas en varios estados", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const repo = createDemoRepo();
    const admins = await Promise.all(["admin@demo.local", "revisor@demo.local", "exportador@demo.local"].map((e) => repo.findAdminByEmail(e)));
    expect(admins.map((a) => a?.role)).toEqual(["ADMIN", "REVIEWER", "EXPORTER"]);
    const statuses = new Set([...repo.people.values()].map((p) => p.status));
    expect(statuses).toEqual(new Set(["PENDING", "STARTED", "COMPLETED", "NEEDS_REVIEW"]));
  });

  it("la sesión de atajo respeta los permisos del rol elegido", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const repo = createDemoRepo();
    const exporter = await repo.findAdminByEmail("exportador@demo.local");
    const token = startDemoSession(repo, exporter!);
    const ctx = await getDemoAdminContext(repo, token);
    expect(ctx?.admin.role).toBe("EXPORTER");
    expect(can(ctx!.admin.role, "export:create")).toBe(true);
    expect(can(ctx!.admin.role, "people:import")).toBe(false);
  });

  it("un token inventado no abre sesión", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const repo = createDemoRepo();
    expect(await getDemoAdminContext(repo, "x".repeat(43))).toBeNull();
  });

  it("la puerta de usuario abre a quien está a mitad del formulario", () => {
    const people = [
      { id: "pendiente", status: "PENDING" as const, submitted_at: null, first_names: "Ana", last_names: "Paz" },
      { id: "listo", status: "COMPLETED" as const, submitted_at: "2026-09-01", first_names: "Luis", last_names: "Paz" },
      { id: "camino", status: "STARTED" as const, submitted_at: null, first_names: "Lucía", last_names: "Paz" },
    ];
    expect(pickDemoUser(people)?.id).toBe("camino");
    expect(pickDemoUser(people.filter((person) => person.id !== "camino"))?.id).toBe("pendiente");
    expect(pickDemoUser(people.filter((person) => person.submitted_at))).toBeNull();
    expect(pickDemoAccount(people)?.id).toBe("listo");
    expect(pickDemoAccount(people.filter((person) => !person.submitted_at))).toBeNull();
  });

  it("isMemoryRepo reconoce el repositorio en memoria sin depender de instanceof", () => {
    const repo = new MemoryRepo();
    expect(isMemoryRepo(repo)).toBe(true);
    expect(isMemoryRepo({ ...repo, isMemoryRepo: undefined } as unknown as MemoryRepo)).toBe(false);
  });
});
