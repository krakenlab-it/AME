import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decrypt } from "@/lib/encryption/crypto";
import { MemoryRepo } from "@/lib/database/memory-repo";
import { totpCode } from "@/lib/security/totp";
import {
  decideAdminGate,
  destinationAfterConfirm,
  gateForAuthUser,
  redirectForAdminRoute,
  safeAdminNext,
  totpQrDataUrl,
} from "@/lib/services/admin-gate";
import { createDemoAdmin, ensureMfaSecret, getDemoAdminContext, loginWithPassword, verifyMfa } from "@/lib/services/demo-admin-auth";
import { ForbiddenError } from "@/lib/security/rbac";
import {
  inviteStaffMember,
  portalConfirmUrl,
  staffConfirmRedirect,
  STAFF_ALREADY_LINKED_ERROR,
  type StaffAuthAdmin,
  type StaffDirectory,
} from "@/lib/services/staff-invite";

describe("barrera de Supabase Auth para el panel", () => {
  const linked = { active: true, auth_user_id: "user-1" };

  it("exige sesión y AAL2 antes del panel", () => {
    expect(decideAdminGate({ userId: null, currentLevel: null, nextLevel: null, admin: null })).toBe("anonymous");
    expect(decideAdminGate({ userId: "user-1", currentLevel: "aal1", nextLevel: "aal1", admin: null })).toBe("unlinked");
    expect(decideAdminGate({ userId: "user-1", currentLevel: "aal2", nextLevel: "aal2", admin: { active: false, auth_user_id: "user-1" } })).toBe("unlinked");
    expect(decideAdminGate({ userId: "user-1", currentLevel: "aal2", nextLevel: "aal2", admin: { active: true, auth_user_id: null } })).toBe("unlinked");
    expect(decideAdminGate({ userId: "user-1", currentLevel: "aal2", nextLevel: "aal2", admin: { active: true, auth_user_id: "otro" } })).toBe("unlinked");
    expect(decideAdminGate({ userId: "user-1", currentLevel: "aal1", nextLevel: "aal1", admin: linked })).toBe("mfa_enroll");
    expect(decideAdminGate({ userId: "user-1", currentLevel: "aal1", nextLevel: "aal2", admin: linked })).toBe("mfa_verify");
    expect(decideAdminGate({ userId: "user-1", currentLevel: "aal2", nextLevel: "aal1", admin: linked })).toBe("mfa_enroll");
    expect(decideAdminGate({ userId: "user-1", currentLevel: "aal2", nextLevel: "aal2", admin: linked })).toBe("panel");
    expect(decideAdminGate({ userId: "user-1", currentLevel: null, nextLevel: null, admin: linked })).toBe("mfa_enroll");
  });

  it("resuelve el perfil solo por auth_user_id, no por el correo", async () => {
    const repo = new MemoryRepo();
    await repo.createAdmin({ email: "admin@test.ec", full_name: "Admin", role: "ADMIN", auth_user_id: "user-1" });
    const ok = await gateForAuthUser(repo, { userId: "user-1", currentLevel: "aal2", nextLevel: "aal2" });
    expect(ok.kind).toBe("panel");
    if (ok.kind !== "panel") return;
    expect(ok.admin.email).toBe("admin@test.ec");

    const sameEmailOtherAccount = await gateForAuthUser(repo, { userId: "intruso", currentLevel: "aal2", nextLevel: "aal2" });
    expect(sameEmailOtherAccount.kind).toBe("unlinked");
  });

  it("no deja pasar al panel sin MFA y no toca el flujo del titular", () => {
    expect(redirectForAdminRoute("/verificar/abc", "anonymous")).toBeNull();
    expect(redirectForAdminRoute("/", "panel")).toBeNull();
    expect(redirectForAdminRoute("/admin", "anonymous")).toBe("/admin/login");
    expect(redirectForAdminRoute("/admin", "unlinked")).toBe("/admin/login");
    expect(redirectForAdminRoute("/admin", "mfa_enroll")).toBe("/admin/mfa");
    expect(redirectForAdminRoute("/admin", "mfa_verify")).toBe("/admin/mfa");
    expect(redirectForAdminRoute("/admin/personas/1", "mfa_verify")).toBe("/admin/mfa");
    expect(redirectForAdminRoute("/admin", "panel")).toBeNull();
    expect(redirectForAdminRoute("/admin/mfa", "anonymous")).toBe("/admin/login");
    expect(redirectForAdminRoute("/admin/mfa", "mfa_enroll")).toBeNull();
    expect(redirectForAdminRoute("/admin/mfa", "panel")).toBe("/admin");
    expect(redirectForAdminRoute("/admin/login", "anonymous")).toBeNull();
    expect(redirectForAdminRoute("/admin/login", "panel")).toBe("/admin");
    expect(redirectForAdminRoute("/admin/login", "mfa_verify")).toBe("/admin/mfa");
    expect(redirectForAdminRoute("/admin/recuperar", "anonymous")).toBeNull();
    expect(redirectForAdminRoute("/admin/registro", "anonymous")).toBe("/admin/login");
    expect(redirectForAdminRoute("/admin/registro", "mfa_enroll")).toBeNull();
    expect(redirectForAdminRoute("/admin/restablecer", "mfa_verify")).toBeNull();
    expect(redirectForAdminRoute("/admin/auth/confirm", "anonymous")).toBeNull();
  });

  it("solo acepta destinos internos del panel tras el enlace de correo", () => {
    expect(safeAdminNext("https://evil.test/admin", "/admin/registro")).toBe("/admin/registro");
    expect(safeAdminNext("//evil.test", "/admin/registro")).toBe("/admin/registro");
    expect(safeAdminNext("/admin/registro", "/admin/mfa")).toBe("/admin/registro");
    expect(destinationAfterConfirm("recovery", null)).toBe("/admin/restablecer");
    expect(destinationAfterConfirm("invite", "/admin/mfa")).toBe("/admin/mfa");
    expect(destinationAfterConfirm("invite", "https://evil.test")).toBe("/admin/registro");
  });

  it("prepara el QR de TOTP para el teléfono", () => {
    expect(totpQrDataUrl("data:image/svg+xml;utf-8,abc")).toBe("data:image/svg+xml;utf-8,abc");
    expect(totpQrDataUrl("<svg></svg>")).toBe(`data:image/svg+xml;utf-8,${encodeURIComponent("<svg></svg>")}`);
  });
});

describe("migración de admin Auth", () => {
  const sql = readFileSync("supabase/migrations/20260930164720_admin_supabase_auth.sql", "utf8");

  it("vincula auth_user_id y deja de guardar contraseña y secreto TOTP", () => {
    expect(sql).toMatch(/auth_user_id/);
    expect(sql).toMatch(/drop column if exists password_hash/);
    expect(sql).toMatch(/drop column if exists mfa_secret_encrypted/);
    expect(sql).toMatch(/drop table if exists admin_sessions/);
  });

  it("no abre people ni tokens al rol authenticated", () => {
    expect(sql).not.toMatch(/create policy/i);
    expect(sql).not.toMatch(/grant\s+/i);
    expect(sql).toMatch(/revoke all on table people from anon, authenticated/i);
    expect(sql).toMatch(/revoke all on table access_tokens from anon, authenticated/i);
    expect(sql).toMatch(/revoke all on table admin_users from anon, authenticated/i);
  });
});

describe("invitación de personal desde el panel", () => {
  const base = "https://portal.test";

  function setup(existing: { id: string; auth_user_id: string | null } | null = null) {
    const saved: { role?: string; auth_user_id?: string; existingId?: string | null } = {};
    const seen = { inviteRedirect: "", recoveryRedirect: "", recoveryCalls: 0, inviteCalls: 0 };
    const directory: StaffDirectory = {
      findByEmail: async () => existing,
      link: async (row) => {
        saved.role = row.role;
        saved.auth_user_id = row.auth_user_id;
        saved.existingId = row.existingId;
      },
    };
    const auth: StaffAuthAdmin & { inviteResult: Awaited<ReturnType<StaffAuthAdmin["inviteByEmail"]>>; recoveryResult: Awaited<ReturnType<StaffAuthAdmin["generateRecoveryLink"]>> } = {
      inviteResult: { userId: "auth-new", failed: false },
      recoveryResult: { userId: null, hashedToken: null, actionLink: null, failed: true },
      inviteByEmail: async (_email, redirectTo) => {
        seen.inviteCalls += 1;
        seen.inviteRedirect = redirectTo;
        return auth.inviteResult;
      },
      generateRecoveryLink: async (_email, redirectTo) => {
        seen.recoveryCalls += 1;
        seen.recoveryRedirect = redirectTo;
        return auth.recoveryResult;
      },
    };
    return { directory, auth, saved, seen };
  }

  it("solo un administrador puede invitar, y el correo nuevo va a registro", async () => {
    const { directory, auth, saved, seen } = setup();
    await expect(inviteStaffMember(directory, auth, "REVIEWER", { email: "nueva@ame.ec", fullName: "Ana Pérez", role: "REVIEWER" }, base)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(inviteStaffMember(directory, auth, "EXPORTER", { email: "nueva@ame.ec", fullName: "Ana Pérez", role: "EXPORTER" }, base)).rejects.toBeInstanceOf(ForbiddenError);
    expect(seen.inviteCalls).toBe(0);

    const ok = await inviteStaffMember(directory, auth, "ADMIN", { email: " Nueva@AME.ec ", fullName: "Ana Pérez", role: "reviewer" }, base);
    expect(ok).toMatchObject({ ok: true, emailed: true, email: "nueva@ame.ec", role: "REVIEWER", confirmUrl: null });
    expect(saved).toMatchObject({ role: "REVIEWER", auth_user_id: "auth-new", existingId: null });
    expect(seen.recoveryCalls).toBe(0);
    expect(seen.inviteRedirect).toBe(staffConfirmRedirect(base, "/admin/registro"));
    expect(seen.inviteRedirect).toContain("next=%2Fadmin%2Fregistro");
  });

  it("si el correo ya está vinculado, pide recuperación y no llama a Auth", async () => {
    const { directory, auth, seen } = setup({ id: "row-1", auth_user_id: "ya-vinculado" });
    const result = await inviteStaffMember(directory, auth, "ADMIN", { email: "ana@ame.ec", fullName: "Ana Pérez", role: "ADMIN" }, base);
    expect(result).toEqual({ ok: false, error: STAFF_ALREADY_LINKED_ERROR });
    expect(seen.inviteCalls).toBe(0);
    expect(seen.recoveryCalls).toBe(0);
  });

  it("si Auth ya tiene el correo, muestra el enlace del portal con el token de un solo uso", async () => {
    const { directory, auth, saved, seen } = setup({ id: "legacy", auth_user_id: null });
    auth.inviteResult = { userId: null, failed: true };
    auth.recoveryResult = { userId: "auth-viejo", hashedToken: "token/uno", actionLink: "https://proyecto.supabase.co/auth/v1/verify?token=secreto", failed: false };

    const result = await inviteStaffMember(directory, auth, "ADMIN", { email: "ana@ame.ec", fullName: "Ana Pérez", role: "EXPORTER" }, base);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.emailed).toBe(false);
    expect(result.role).toBe("EXPORTER");
    expect(result.confirmUrl).toBe(portalConfirmUrl(base, "token/uno", "recovery"));
    expect(result.confirmUrl).toContain("/admin/auth/confirm?");
    expect(result.confirmUrl).toContain("token_hash=token%2Funo");
    expect(result.confirmUrl).toContain("type=recovery");
    expect(result.confirmUrl).toContain("next=%2Fadmin%2Frestablecer");
    expect(result.confirmUrl).not.toContain("supabase.co");
    expect(saved).toMatchObject({ existingId: "legacy", auth_user_id: "auth-viejo", role: "EXPORTER" });
    expect(seen.recoveryRedirect).toContain("next=%2Fadmin%2Frestablecer");
  });

  it("no guarda el rol si no se pudo invitar ni recuperar", async () => {
    const { directory, auth, saved } = setup();
    auth.inviteResult = { userId: null, failed: true };
    const result = await inviteStaffMember(directory, auth, "ADMIN", { email: "ana@ame.ec", fullName: "Ana Pérez", role: "ADMIN" }, base);
    expect(result).toMatchObject({ ok: false });
    expect(saved.auth_user_id).toBeUndefined();
  });
});

describe("modo demostración", () => {
  it("sigue pidiendo contraseña y TOTP, y bloquea tras intentos fallidos", async () => {
    const repo = new MemoryRepo();
    const admin = await createDemoAdmin(repo, { email: "admin@test.ec", full_name: "Admin", role: "ADMIN", password: "Clave-segura-2026" });

    expect((await loginWithPassword(repo, "admin@test.ec", "incorrecta", "ip")).ok).toBe(false);
    const login = await loginWithPassword(repo, "admin@test.ec", "Clave-segura-2026", "ip");
    expect(login.ok).toBe(true);
    if (!login.ok) return;
    expect(login.needsEnrollment).toBe(true);

    expect(await getDemoAdminContext(repo, login.sessionToken)).toBeNull();
    const pre = await getDemoAdminContext(repo, login.sessionToken, { requireMfa: false });
    const secret = await ensureMfaSecret(repo, pre!.admin);
    const refreshed = await getDemoAdminContext(repo, login.sessionToken, { requireMfa: false });
    expect(decrypt(refreshed!.totpEncrypted!)).toBe(secret);
    const mfa = await verifyMfa(repo, refreshed!, totpCode(secret), "ip");
    expect(mfa.ok).toBe(true);
    if (!mfa.ok) return;
    expect(await getDemoAdminContext(repo, login.sessionToken)).toBeNull();
    expect((await getDemoAdminContext(repo, mfa.sessionToken))?.admin.id).toBe(admin.id);

    repo.buckets.clear();
    for (let i = 0; i < 5; i++) await loginWithPassword(repo, "admin@test.ec", "mala", `ip-${i}`);
    expect(await loginWithPassword(repo, "admin@test.ec", "Clave-segura-2026", "ip-y")).toMatchObject({ ok: false });
    repo.buckets.clear();
    expect(await loginWithPassword(repo, "admin@test.ec", "Clave-segura-2026", "ip-z")).toMatchObject({ ok: false, error: expect.stringContaining("bloqueada") });
  });

  it("no revela si un correo existe", async () => {
    const repo = new MemoryRepo();
    await createDemoAdmin(repo, { email: "a@test.ec", full_name: "A", role: "ADMIN", password: "Clave-segura-2026" });
    const a = await loginWithPassword(repo, "a@test.ec", "mala-clave-123", "ip1");
    const b = await loginWithPassword(repo, "noexiste@test.ec", "mala-clave-123", "ip2");
    expect(a).toEqual(b);
  });
});
