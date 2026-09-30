import { afterEach, describe, expect, it, vi } from "vitest";
import { isDemoMode } from "@/lib/demo-mode";
import { createDemoRepo } from "@/lib/database/demo";
import { getDemoAdminContext, startDemoSession } from "@/lib/services/demo-admin-auth";
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
});
