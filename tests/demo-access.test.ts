import { afterEach, describe, expect, it, vi } from "vitest";
import { isDemoMode } from "@/lib/demo-mode";
import { isMemoryRepo, MemoryRepo } from "@/lib/database/memory-repo";
import { createDemoRepo } from "@/lib/database/demo";
import { getDemoAdminContext, startDemoSession } from "@/lib/services/demo-admin-auth";
import { pickDemoAccount, pickDemoUser } from "@/lib/demo/enter";
import { can } from "@/lib/security/rbac";

vi.mock("server-only", () => ({}));

const ENV_KEYS = ["DEMO_MODE", "VERCEL_ENV", "APP_STAGE"] as const;
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

  it("se enciende con DEMO_MODE=true en desarrollo y preview", () => {
    process.env.DEMO_MODE = "true";
    delete process.env.VERCEL_ENV;
    expect(isDemoMode()).toBe(true);
    process.env.VERCEL_ENV = "preview";
    expect(isDemoMode()).toBe(true);
  });

  it("se enciende en Vercel Preview sin variable DEMO_MODE (runtime)", () => {
    delete process.env.DEMO_MODE;
    delete process.env.APP_STAGE;
    process.env.VERCEL_ENV = "preview";
    expect(isDemoMode()).toBe(true);
  });

  it("sigue en demo en Preview aunque APP_STAGE diga production (variables compartidas en Vercel)", () => {
    delete process.env.DEMO_MODE;
    process.env.VERCEL_ENV = "preview";
    process.env.APP_STAGE = "production";
    expect(isDemoMode()).toBe(true);
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
    const token = startDemoSession(repo, exporter!.id);
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
