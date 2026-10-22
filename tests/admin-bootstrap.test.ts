import { describe, expect, it } from "vitest";
import { MemoryRepo } from "@/lib/database/memory-repo";
import {
  BOOTSTRAP_MAX_EMAILS,
  bootstrapAdmins,
  parseBootstrapEmails,
  type BootstrapAuth,
  type BootstrapDirectory,
} from "@/lib/services/admin-bootstrap";
import { decideAdminGate, gateForAuthUser, redirectForAdminRoute } from "@/lib/services/admin-gate";
import { landingConsolePath } from "@/lib/services/landing-redirect";
import { changeDemoPassword, createDemoAdmin } from "@/lib/services/demo-admin-auth";

const BASE = "https://portal.test";

function fakeAuth(existing: Map<string, string>, opts: { inviteFails?: boolean; sendFails?: boolean } = {}) {
  const calls: { kind: string; email: string; redirectTo: string }[] = [];
  let n = 0;
  const auth: BootstrapAuth = {
    async inviteByEmail(email, redirectTo) {
      calls.push({ kind: "invite", email, redirectTo });
      if (opts.inviteFails || existing.has(email)) return { userId: null, failed: true };
      const id = `auth-${++n}`;
      existing.set(email, id);
      return { userId: id, failed: false };
    },
    async findAuthUserId(email) {
      calls.push({ kind: "lookup", email, redirectTo: "" });
      const id = existing.get(email) ?? null;
      return { userId: id, failed: !id };
    },
    async sendRecoveryEmail(email, redirectTo) {
      calls.push({ kind: "send", email, redirectTo });
      return { failed: Boolean(opts.sendFails) };
    },
  };
  return { auth, calls };
}

function directoryFor(repo: MemoryRepo): BootstrapDirectory {
  return {
    findByEmail: async (email) => {
      const row = await repo.findAdminByEmail(email);
      return row ? { id: row.id, auth_user_id: row.auth_user_id } : null;
    },
    save: async (row) => {
      if (row.existingId) {
        await repo.updateAdmin(row.existingId, { auth_user_id: row.auth_user_id, role: "ADMIN", active: true, must_change_password: true });
        return;
      }
      await repo.createAdmin({ email: row.email, full_name: "Administrador inicial", role: "ADMIN", auth_user_id: row.auth_user_id, must_change_password: true });
    },
    rateLimitHit: (b, l, w) => repo.rateLimitHit(b, l, w),
    logSecurityEvent: (e) => repo.logSecurityEvent(e),
  };
}

describe("ADMIN_BOOTSTRAP_EMAILS", () => {
  it("normaliza, quita duplicados, cuenta los inválidos y limita la lista", () => {
    expect(parseBootstrapEmails(undefined)).toEqual({ emails: [], invalid: 0 });
    expect(parseBootstrapEmails(" Ana@Ejemplo.ec, ana@ejemplo.ec;otro@x.io  no-es-correo ")).toEqual({
      emails: ["ana@ejemplo.ec", "otro@x.io"],
      invalid: 1,
    });
    const many = Array.from({ length: BOOTSTRAP_MAX_EMAILS + 3 }, (_, i) => `a${i}@x.io`).join(",");
    const parsed = parseBootstrapEmails(many);
    expect(parsed.emails).toHaveLength(BOOTSTRAP_MAX_EMAILS);
    expect(parsed.invalid).toBe(3);
  });

  it("invita una cuenta nueva: fila ADMIN con cambio obligatorio y enlace a /admin/registro", async () => {
    const repo = new MemoryRepo();
    const { auth, calls } = fakeAuth(new Map());
    const out = await bootstrapAdmins(directoryFor(repo), auth, ["nueva@ejemplo.ec"], BASE);
    expect(out.map((o) => o.status)).toEqual(["invited"]);
    expect(out[0]?.emailHash).not.toContain("@");
    const row = await repo.findAdminByEmail("nueva@ejemplo.ec");
    expect(row).toMatchObject({ role: "ADMIN", active: true, auth_user_id: "auth-1", must_change_password: true, mfa_enabled: false });
    expect(calls).toEqual([{ kind: "invite", email: "nueva@ejemplo.ec", redirectTo: `${BASE}/admin/auth/confirm?next=%2Fadmin%2Fregistro` }]);
  });

  it("si la cuenta ya existe en Auth, vincula la fila sin acceso y manda el restablecimiento", async () => {
    const repo = new MemoryRepo();
    const unlinked = await repo.createAdmin({ email: "vieja@ejemplo.ec", full_name: "Vieja Cuenta", role: "REVIEWER", auth_user_id: null });
    await repo.updateAdmin(unlinked.id, { active: false });
    const { auth, calls } = fakeAuth(new Map([["vieja@ejemplo.ec", "auth-existente"]]));
    const out = await bootstrapAdmins(directoryFor(repo), auth, ["vieja@ejemplo.ec"], BASE);
    expect(out[0]?.status).toBe("recovery_sent");
    expect(await repo.getAdmin(unlinked.id)).toMatchObject({ auth_user_id: "auth-existente", role: "ADMIN", active: true, must_change_password: true });
    expect(calls.map((c) => c.kind)).toEqual(["invite", "lookup", "send"]);
    expect(calls[2]?.redirectTo).toBe(`${BASE}/admin/auth/confirm?next=%2Fadmin%2Frestablecer`);
    expect(repo.securityEvents.some((e) => e.event_type === "ADMIN_BOOTSTRAP")).toBe(true);
  });

  it("no toca un acceso ya vinculado (contraseña, TOTP ni rol) y no manda correos", async () => {
    const repo = new MemoryRepo();
    const linked = await repo.createAdmin({ email: "admin@ejemplo.ec", full_name: "Admin", role: "EXPORTER", auth_user_id: "auth-9" });
    await repo.updateAdmin(linked.id, { mfa_enabled: true, active: false });
    const { auth, calls } = fakeAuth(new Map([["admin@ejemplo.ec", "auth-9"]]));
    const out = await bootstrapAdmins(directoryFor(repo), auth, ["admin@ejemplo.ec"], BASE);
    expect(out[0]?.status).toBe("already_linked");
    expect(calls).toEqual([]);
    expect(await repo.getAdmin(linked.id)).toMatchObject({ role: "EXPORTER", active: false, mfa_enabled: true, must_change_password: false });
  });

  it("un intento por correo y por hora aunque el servidor arranque muchas veces", async () => {
    const repo = new MemoryRepo();
    const { auth, calls } = fakeAuth(new Map(), { inviteFails: true });
    const first = await bootstrapAdmins(directoryFor(repo), auth, ["x@ejemplo.ec"], BASE);
    const second = await bootstrapAdmins(directoryFor(repo), auth, ["x@ejemplo.ec"], BASE);
    expect(first[0]?.status).toBe("failed");
    expect(second[0]?.status).toBe("rate_limited");
    expect(calls.filter((c) => c.kind === "invite")).toHaveLength(1);
    expect(await repo.findAdminByEmail("x@ejemplo.ec")).toBeNull();
  });

  it("si el correo de restablecimiento falla, igual queda el cambio obligatorio", async () => {
    const repo = new MemoryRepo();
    const { auth } = fakeAuth(new Map([["y@ejemplo.ec", "auth-y"]]), { sendFails: true });
    const out = await bootstrapAdmins(directoryFor(repo), auth, ["y@ejemplo.ec"], BASE);
    expect(out[0]?.status).toBe("linked_without_email");
    expect((await repo.findAdminByEmail("y@ejemplo.ec"))?.must_change_password).toBe(true);
  });
});

describe("cambio de contraseña obligatorio", () => {
  const flagged = { active: true, auth_user_id: "u1", must_change_password: true };

  it("mantiene el TOTP primero y después exige la contraseña nueva", () => {
    expect(decideAdminGate({ userId: "u1", currentLevel: "aal1", nextLevel: "aal2", admin: flagged })).toBe("mfa_verify");
    expect(decideAdminGate({ userId: "u1", currentLevel: "aal1", nextLevel: "aal1", admin: flagged })).toBe("mfa_enroll");
    expect(decideAdminGate({ userId: "u1", currentLevel: "aal2", nextLevel: "aal2", admin: flagged })).toBe("password_change");
    expect(decideAdminGate({ userId: "u1", currentLevel: "aal2", nextLevel: "aal2", admin: { ...flagged, must_change_password: false } })).toBe("panel");
    expect(decideAdminGate({ userId: "u1", currentLevel: "aal2", nextLevel: "aal2", admin: { ...flagged, active: false } })).toBe("unlinked");
  });

  it("gateForAuthUser lee la marca de admin_users", async () => {
    const repo = new MemoryRepo();
    await repo.createAdmin({ email: "f@ejemplo.ec", full_name: "F", role: "ADMIN", auth_user_id: "u1", must_change_password: true });
    const gate = await gateForAuthUser(repo, { userId: "u1", currentLevel: "aal2", nextLevel: "aal2" });
    expect(gate.kind).toBe("password_change");
  });

  it("todas las rutas del panel llevan a /admin/restablecer; el titular no cambia", () => {
    expect(redirectForAdminRoute("/admin", "password_change")).toBe("/admin/restablecer");
    expect(redirectForAdminRoute("/admin/exportar", "password_change")).toBe("/admin/restablecer");
    expect(redirectForAdminRoute("/admin/mfa", "password_change")).toBe("/admin/restablecer");
    expect(redirectForAdminRoute("/admin/login", "password_change")).toBe("/admin/restablecer");
    expect(redirectForAdminRoute("/admin/restablecer", "password_change")).toBeNull();
    expect(redirectForAdminRoute("/admin/auth/confirm", "password_change")).toBeNull();
    expect(redirectForAdminRoute("/ingresar", "password_change")).toBeNull();
    expect(redirectForAdminRoute("/verificar/abc", "password_change")).toBeNull();
    // El middleware (solo AAL) ya no saca de /admin/restablecer a una sesión aal2: la página decide.
    expect(redirectForAdminRoute("/admin/restablecer", "panel")).toBeNull();
    expect(redirectForAdminRoute("/admin/registro", "panel")).toBe("/admin");
    expect(landingConsolePath({ admin: "password_change", hasRespondentSession: true })).toBe("/admin/restablecer");
  });

  it("en demo, cambiar la contraseña levanta la marca", async () => {
    const repo = new MemoryRepo();
    const admin = await createDemoAdmin(repo, { email: "demo@ejemplo.ec", full_name: "Demo", role: "ADMIN", password: "Una-clave-larga-123!" });
    await repo.updateAdmin(admin.id, { must_change_password: true });
    await changeDemoPassword(repo, admin.id, "Otra-clave-larga-456!");
    expect((await repo.getAdmin(admin.id))?.must_change_password).toBe(false);
  });
});
