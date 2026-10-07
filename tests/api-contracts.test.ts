import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { EXPORT_PROFILES } from "@/lib/services/export";
import { can } from "@/lib/security/rbac";
import { assertDemoAllowed, isDemoMode } from "@/lib/demo-mode";
import {
  ACTION_CONTRACTS,
  EXPORT_FORMATS,
  EXPORT_PROFILE_IDS,
  HTTP_CONTRACTS,
  apiErrorSchema,
  cronAuthorized,
  exportRequestSchema,
  healthResponseSchema,
  identifyFailureSchema,
  identifySchema,
  isSameOrigin,
  parseExportRequest,
  retentionResponseSchema,
} from "@/lib/contracts/api";
import { parseAdoptSession, parseMagicLinkVerify } from "@/lib/contracts/magic-link";
import { makeCedula } from "./helpers/cedula";

const ENV_KEYS = ["DEMO_MODE", "APP_STAGE", "VERCEL_ENV"] as const;
const saved: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

function rememberEnv() {
  for (const key of ENV_KEYS) saved[key] = process.env[key];
}

function listRouteFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...listRouteFiles(full));
    else if (entry === "route.ts") out.push(full);
  }
  return out;
}

describe("catálogo de contratos", () => {
  it("cubre cada ruta de app/api y el método que exporta", () => {
    const files = listRouteFiles("app/api");
    const paths = files.map((file) => `/${path.relative("app", file).replace(/\/route\.ts$/, "").replaceAll("\\", "/")}`);
    expect(paths.sort()).toEqual(HTTP_CONTRACTS.map((contract) => contract.path).sort());
    for (const contract of HTTP_CONTRACTS) {
      const file = files.find((candidate) => candidate.replaceAll("\\", "/").endsWith(`${contract.path.slice(1)}/route.ts`));
      expect(file, contract.path).toBeTruthy();
      const source = readFileSync(file!, "utf8");
      expect(source).toMatch(new RegExp(`export (async )?function ${contract.method}\\b`));
    }
  });

  it("mantiene las acciones de verificar y del enlace de admin", () => {
    for (const contract of ACTION_CONTRACTS) {
      const source = readFileSync(contract.module, "utf8");
      expect(source).toContain(`export async function ${contract.exportName}`);
    }
    expect(ACTION_CONTRACTS.map((contract) => contract.exportName)).not.toContain("signupAction");
  });

  it("alinea perfiles y formatos con el exportador", () => {
    expect([...EXPORT_PROFILE_IDS].sort()).toEqual(Object.keys(EXPORT_PROFILES).sort());
    expect(EXPORT_FORMATS).toEqual(["xlsx", "csv"]);
  });
});

describe("formas de petición y respuesta", () => {
  it("acepta la exportación mínima y rechaza campos de más o perfiles ajenos", () => {
    const ok = parseExportRequest({ profile: "RECLAMOS", format: "csv", purpose: "Envío mensual a AIG" });
    expect(ok).toEqual({ ok: true, value: { profile: "RECLAMOS", format: "csv", purpose: "Envío mensual a AIG" } });
    expect(parseExportRequest({ profile: "RECLAMOS", format: "csv", purpose: "x", extra: true }).ok).toBe(false);
    expect(parseExportRequest({ profile: "TODO", format: "csv", purpose: "x" }).ok).toBe(false);
    expect(parseExportRequest({ profile: "REEMBOLSOS", format: "pdf", purpose: "x" }).ok).toBe(false);
    expect(exportRequestSchema.safeParse(null).success).toBe(false);
  });

  it("fija health, retención y el sobre de error", () => {
    expect(healthResponseSchema.parse({ ok: true })).toEqual({ ok: true });
    expect(healthResponseSchema.safeParse({ ok: true, env: "prod" }).success).toBe(false);
    expect(retentionResponseSchema.parse({ ok: true, anonymized: 0 })).toEqual({ ok: true, anonymized: 0 });
    expect(retentionResponseSchema.safeParse({ ok: true, anonymized: -1 }).success).toBe(false);
    expect(apiErrorSchema.parse({ error: "No autorizado" })).toEqual({ error: "No autorizado" });
  });

  it("exige el mismo origen y un secreto de cron largo", () => {
    expect(isSameOrigin("https://portal.test", "portal.test")).toBe(true);
    expect(isSameOrigin("https://evil.test", "portal.test")).toBe(false);
    expect(isSameOrigin(null, "portal.test")).toBe(false);
    expect(isSameOrigin("no es una url", "portal.test")).toBe(false);
    const secret = "c".repeat(16);
    expect(cronAuthorized(`Bearer ${secret}`, secret)).toBe(true);
    expect(cronAuthorized("Bearer corto", "corto")).toBe(false);
    expect(cronAuthorized(`Bearer ${secret}`, undefined)).toBe(false);
    expect(cronAuthorized(`Bearer ${"d".repeat(16)}`, secret)).toBe(false);
    expect(cronAuthorized(null, secret)).toBe(false);
  });

  it("la identificación del titular no acepta un id de persona enviado por el navegador", () => {
    const token = "a".repeat(32);
    const cedula = makeCedula("171003406");
    expect(identifySchema.safeParse({ token, cedula }).success).toBe(true);
    expect(identifySchema.safeParse({ token, cedula: "bh-823158" }).data?.cedula).toBe("BH823158");
    expect(identifySchema.safeParse({ token, cedula: "BA086520" }).success).toBe(true);
    expect(identifySchema.safeParse({ token, cedula: "1234567890" }).success).toBe(false);
    expect(identifySchema.safeParse({ token, cedula: "AAAAAA" }).success).toBe(false);
    expect(identifySchema.safeParse({ token, cedula, personId: "otro" }).success).toBe(false);
    expect(identifyFailureSchema.parse({ error: "Enlace no válido.", linkState: "invalid" }).linkState).toBe("invalid");
  });
});

describe("enlace de invitación", () => {
  it("canjea invitación y enlace mágico, y no sale del panel", () => {
    const invite = parseMagicLinkVerify({ tokenHash: "hash-de-invitacion", type: "invite", next: "/admin/registro" });
    expect(invite).toEqual({
      ok: true,
      verify: { method: "otp", tokenHash: "hash-de-invitacion", type: "invite", next: "/admin/registro" },
    });
    const magic = parseMagicLinkVerify({ tokenHash: "hash", type: "magiclink", next: "https://evil.test/admin" });
    expect(magic.ok).toBe(true);
    if (!magic.ok) return;
    expect(magic.verify.method).toBe("otp");
    if (magic.verify.method !== "otp") return;
    expect(magic.verify.next).toBe("/admin/registro");
    expect(parseMagicLinkVerify({ code: "pkce-code", type: "recovery" })).toEqual({
      ok: true,
      verify: { method: "code", code: "pkce-code", next: "/admin/restablecer" },
    });
  });

  it("rechaza un tipo desconocido, un hash vacío y tokens enormes", () => {
    expect(parseMagicLinkVerify({ tokenHash: "hash", type: "password" }).ok).toBe(false);
    expect(parseMagicLinkVerify({}).ok).toBe(false);
    expect(parseMagicLinkVerify({ tokenHash: " ", code: " " }).ok).toBe(false);
    expect(parseMagicLinkVerify({ tokenHash: "h".repeat(2049), type: "invite" }).ok).toBe(false);
    expect(parseAdoptSession({ accessToken: "", refreshToken: "r" }).ok).toBe(false);
    expect(parseAdoptSession({ accessToken: "a".repeat(20_001), refreshToken: "r", type: "invite" }).ok).toBe(false);
    expect(parseAdoptSession({ accessToken: "a", refreshToken: "r", type: "recovery" })).toEqual({
      ok: true,
      accessToken: "a",
      refreshToken: "r",
      next: "/admin/restablecer",
    });
  });
});

describe("límites de acceso", () => {
  it("el panel no se abre con alta pública y el revisor no exporta", () => {
    const provisioning = readFileSync("lib/services/staff-auth-admin.ts", "utf8");
    const script = readFileSync("scripts/create-admin.ts", "utf8");
    const actions = readFileSync("app/admin/auth-actions.ts", "utf8");
    const inviteActions = readFileSync("app/admin/invite-actions.ts", "utf8");
    const inviteForm = readFileSync("components/admin/invite-staff-form.tsx", "utf8");
    const registro = readFileSync("app/admin/registro/page.tsx", "utf8");
    expect(provisioning).toContain("inviteUserByEmail");
    expect(provisioning).not.toMatch(/\.signUp\(/);
    expect(script).toContain("inviteStaffMember");
    expect(script).not.toMatch(/\.signUp\(/);
    expect(actions).not.toMatch(/signUp/);
    expect(inviteActions).toContain("createServiceRoleClient");
    expect(inviteActions).toContain("staff:invite");
    expect(inviteActions).not.toMatch(/\.signUp\(/);
    expect(inviteForm).not.toContain("SERVICE_ROLE");
    expect(inviteForm).not.toContain("inviteUserByEmail");
    expect(registro).toMatch(/solo por invitación/);
    expect(can("REVIEWER", "export:create")).toBe(false);
    expect(can("EXPORTER", "export:create")).toBe(true);
    expect(can("ADMIN", "export:create")).toBe(true);
  });

  it("no abre PII a anon ni authenticated y el servidor usa service_role", () => {
    const initial = readFileSync("supabase/migrations/20260929000000_initial_schema.sql", "utf8");
    const authMigration = readFileSync("supabase/migrations/20260930164720_admin_supabase_auth.sql", "utf8");
    for (const table of ["people", "contact_information", "bank_information", "access_tokens", "admin_users"]) {
      expect(initial).toContain(`'${table}'`);
    }
    expect(initial).toMatch(/enable row level security/);
    expect(initial).toMatch(/force row level security/);
    expect(initial).toMatch(/revoke all on table %I from anon, authenticated/);
    expect(initial).toMatch(/grant execute on function %s to service_role/);
    expect(initial).not.toMatch(/create policy/i);
    expect(initial).not.toMatch(/grant\s+(select|insert|update|delete|all)/i);
    expect(authMigration).not.toMatch(/create policy/i);
    expect(authMigration).toMatch(/revoke all on table people from anon, authenticated/i);
    expect(authMigration).toMatch(/revoke all on table bank_information from anon, authenticated/i);

    const repo = readFileSync("lib/database/supabase-repo.ts", "utf8");
    const authClient = readFileSync("lib/supabase/server.ts", "utf8");
    expect(repo).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(repo).not.toContain("ANON_KEY");
    expect(authClient).toContain("anonKey");
    expect(authClient).not.toContain("SERVICE_ROLE");
  });

  it("DEMO_MODE no sobrevive en producción", () => {
    rememberEnv();
    process.env.DEMO_MODE = "true";
    delete process.env.VERCEL_ENV;
    delete process.env.APP_STAGE;
    expect(isDemoMode()).toBe(true);
    expect(() => assertDemoAllowed()).not.toThrow();

    process.env.VERCEL_ENV = "production";
    expect(isDemoMode()).toBe(false);
    expect(() => assertDemoAllowed()).toThrow(/DEMO_MODE no está permitido en producción/);

    delete process.env.VERCEL_ENV;
    process.env.APP_STAGE = "production";
    expect(isDemoMode()).toBe(false);
    expect(() => assertDemoAllowed()).toThrow(/DEMO_MODE/);
  });
});

describe("pipeline de CI", () => {
  it("exige lint, tipos, pruebas y build, y no enciende DEMO_MODE", () => {
    const workflow = readFileSync(".github/workflows/ci.yml", "utf8");
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> };
    for (const step of ["npm run lint", "npm run typecheck", "npm test", "npm run build", "npm run test:e2e"]) {
      expect(workflow).toContain(step);
    }
    expect(workflow).toContain('DEMO_MODE: "false"');
    expect(workflow).toContain('SEED_PRODUCT_USERS: "true"');
    expect(workflow).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(workflow).not.toContain("seed:product-users -- --write");
    expect(pkg.scripts.check).toContain("npm run lint");
    expect(pkg.scripts.check).toContain("npm run test");
    expect(pkg.scripts.check).toContain("npm run build");
    const vercel = readFileSync("vercel.json", "utf8");
    expect(vercel).not.toMatch(/DEMO_MODE/);
  });
});
