import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

interface FakeAuth {
  getClaims: ReturnType<typeof vi.fn>;
  mfa: {
    getAuthenticatorAssuranceLevel: ReturnType<typeof vi.fn>;
    listFactors: ReturnType<typeof vi.fn>;
    challengeAndVerify: ReturnType<typeof vi.fn>;
  };
  updateUser: ReturnType<typeof vi.fn>;
  resetPasswordForEmail: ReturnType<typeof vi.fn>;
}

const holder: { auth: FakeAuth } = { auth: undefined as unknown as FakeAuth };

vi.mock("@/lib/supabase/server", () => ({
  createAuthClient: async () => ({ auth: holder.auth }),
}));

import { MemoryRepo } from "@/lib/database/memory-repo";
import { requestPasswordReset, setAdminPassword } from "@/lib/services/admin-auth";
import { canonicalAdminBase } from "@/lib/services/canonical-base";
import { portalConfirmUrl, staffConfirmRedirect } from "@/lib/services/staff-invite";

const PASSWORD = "Nueva-clave-segura-2026";

function fakeAuth(opts: { level: "aal1" | "aal2"; next: "aal1" | "aal2"; verifiedFactor: boolean }): FakeAuth {
  return {
    getClaims: vi.fn(async () => ({ data: { claims: { sub: "user-1" } }, error: null })),
    mfa: {
      getAuthenticatorAssuranceLevel: vi.fn(async () => ({ data: { currentLevel: opts.level, nextLevel: opts.next }, error: null })),
      listFactors: vi.fn(async () => ({
        data: { totp: opts.verifiedFactor ? [{ id: "factor-1", status: "verified" }] : [], all: [] },
        error: null,
      })),
      challengeAndVerify: vi.fn(async () => ({ data: {}, error: null })),
    },
    updateUser: vi.fn(async () => ({ data: {}, error: null })),
    resetPasswordForEmail: vi.fn(async () => ({ data: {}, error: null })),
  };
}

describe("restablecer contraseña de un administrador con TOTP", () => {
  let repo: MemoryRepo;
  beforeEach(() => {
    repo = new MemoryRepo();
  });

  it("con factor verificado y sesión aal1 pide el código y solo después actualiza la contraseña", async () => {
    holder.auth = fakeAuth({ level: "aal1", next: "aal2", verifiedFactor: true });

    const withoutCode = await setAdminPassword(repo, PASSWORD, PASSWORD, "");
    expect(withoutCode).toEqual({ ok: false, error: expect.stringContaining("código de 6 dígitos") });
    expect(holder.auth.updateUser).not.toHaveBeenCalled();
    expect(holder.auth.mfa.challengeAndVerify).not.toHaveBeenCalled();

    const done = await setAdminPassword(repo, PASSWORD, PASSWORD, "123 456");
    expect(done).toEqual({ ok: true });
    expect(holder.auth.mfa.challengeAndVerify).toHaveBeenCalledWith({ factorId: "factor-1", code: "123456" });
    const verifyOrder = holder.auth.mfa.challengeAndVerify.mock.invocationCallOrder[0] ?? 0;
    const updateOrder = holder.auth.updateUser.mock.invocationCallOrder[0] ?? 0;
    expect(verifyOrder).toBeLessThan(updateOrder);
    expect(holder.auth.updateUser).toHaveBeenCalledWith({ password: PASSWORD });
  });

  it("un código incorrecto no toca la contraseña", async () => {
    holder.auth = fakeAuth({ level: "aal1", next: "aal2", verifiedFactor: true });
    holder.auth.mfa.challengeAndVerify.mockResolvedValue({ data: null, error: { code: "mfa_verification_failed" } });
    const res = await setAdminPassword(repo, PASSWORD, PASSWORD, "000000");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("código no es correcto");
    expect(holder.auth.updateUser).not.toHaveBeenCalled();
  });

  it("sin factor verificado (invitación nueva) actualiza directo", async () => {
    holder.auth = fakeAuth({ level: "aal1", next: "aal1", verifiedFactor: false });
    const res = await setAdminPassword(repo, PASSWORD, PASSWORD);
    expect(res).toEqual({ ok: true });
    expect(holder.auth.mfa.challengeAndVerify).not.toHaveBeenCalled();
    expect(holder.auth.updateUser).toHaveBeenCalledTimes(1);
  });

  it("con sesión ya en aal2 no pide el código otra vez", async () => {
    holder.auth = fakeAuth({ level: "aal2", next: "aal2", verifiedFactor: true });
    const res = await setAdminPassword(repo, PASSWORD, PASSWORD);
    expect(res).toEqual({ ok: true });
    expect(holder.auth.mfa.challengeAndVerify).not.toHaveBeenCalled();
  });

  it("insufficient_aal se explica en español y no dice que el enlace venció", async () => {
    holder.auth = fakeAuth({ level: "aal2", next: "aal2", verifiedFactor: true });
    holder.auth.updateUser.mockResolvedValue({
      data: null,
      error: { code: "insufficient_aal", status: 401, message: "AAL2 session is required to update email or password when MFA is enabled." },
    });
    const res = await setAdminPassword(repo, PASSWORD, PASSWORD);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toContain("verificación en dos pasos");
      expect(res.error).not.toMatch(/venci|enlace nuevo/i);
    }
  });

  it("otros errores de updateUser no se presentan como enlace vencido", async () => {
    holder.auth = fakeAuth({ level: "aal1", next: "aal1", verifiedFactor: false });
    holder.auth.updateUser.mockResolvedValue({ data: null, error: { code: "same_password", status: 422, message: "x" } });
    const same = await setAdminPassword(repo, PASSWORD, PASSWORD);
    expect(same).toEqual({ ok: false, error: expect.stringContaining("distinta a la anterior") });

    holder.auth.updateUser.mockResolvedValue({ data: null, error: { code: "unexpected_failure", status: 500, message: "boom" } });
    const other = await setAdminPassword(repo, PASSWORD, PASSWORD);
    expect(other.ok).toBe(false);
    if (!other.ok) expect(other.error).not.toMatch(/venci/i);
  });

  it("limita los intentos del código y no llama a Auth al pasarse", async () => {
    holder.auth = fakeAuth({ level: "aal1", next: "aal2", verifiedFactor: true });
    holder.auth.mfa.challengeAndVerify.mockResolvedValue({ data: null, error: { code: "mfa_verification_failed" } });
    for (let i = 0; i < 6; i += 1) await setAdminPassword(repo, PASSWORD, PASSWORD, "000000");
    const calls = holder.auth.mfa.challengeAndVerify.mock.calls.length;
    const blocked = await setAdminPassword(repo, PASSWORD, PASSWORD, "000000");
    expect(blocked).toEqual({ ok: false, error: expect.stringContaining("Demasiados intentos") });
    expect(holder.auth.mfa.challengeAndVerify.mock.calls.length).toBe(calls);
  });
});

describe("enlaces de correo del panel con base canónica www", () => {
  const apex = "https://seguridadadinformacionametemporal.site";
  const www = "https://www.seguridadadinformacionametemporal.site";

  it("convierte el dominio sin www y deja intactos www, localhost, IP y previews", () => {
    expect(canonicalAdminBase(apex)).toBe(www);
    expect(canonicalAdminBase(`${apex}/`)).toBe(www);
    expect(canonicalAdminBase(www)).toBe(www);
    expect(canonicalAdminBase("http://localhost:3000")).toBe("http://localhost:3000");
    expect(canonicalAdminBase("http://127.0.0.1:3000")).toBe("http://127.0.0.1:3000");
    expect(canonicalAdminBase("https://portal-ame-git-x-kraken-lab-media.vercel.app")).toBe("https://portal-ame-git-x-kraken-lab-media.vercel.app");
  });

  it("invitación y recuperación usan www aunque la base configurada sea el dominio pelado", () => {
    expect(staffConfirmRedirect(apex, "/admin/registro")).toBe(`${www}/admin/auth/confirm?next=%2Fadmin%2Fregistro`);
    expect(staffConfirmRedirect(apex, "/admin/restablecer")).toBe(`${www}/admin/auth/confirm?next=%2Fadmin%2Frestablecer`);
    expect(portalConfirmUrl(apex, "hash", "recovery").startsWith(`${www}/admin/auth/confirm?`)).toBe(true);
  });

  it("el correo de restablecer pide a Supabase un redirectTo con www", async () => {
    const previous = process.env.APP_BASE_URL;
    process.env.APP_BASE_URL = apex;
    try {
      holder.auth = fakeAuth({ level: "aal1", next: "aal1", verifiedFactor: false });
      const repo = new MemoryRepo();
      await repo.createAdmin({ email: "jaime@ejemplo.ec", full_name: "Jaime", role: "ADMIN", auth_user_id: "user-1" });
      const res = await requestPasswordReset(repo, "jaime@ejemplo.ec", "ip-hash");
      expect(res.ok).toBe(true);
      expect(holder.auth.resetPasswordForEmail).toHaveBeenCalledWith("jaime@ejemplo.ec", {
        redirectTo: `${www}/admin/auth/confirm?next=%2Fadmin%2Frestablecer`,
      });
    } finally {
      if (previous === undefined) delete process.env.APP_BASE_URL;
      else process.env.APP_BASE_URL = previous;
    }
  });

  it("al agotar los intentos de restablecer explica cómo seguir", async () => {
    holder.auth = fakeAuth({ level: "aal1", next: "aal1", verifiedFactor: false });
    const repo = new MemoryRepo();
    let last = await requestPasswordReset(repo, "otro@ejemplo.ec", "ip-hash-2");
    for (let i = 0; i < 6; i += 1) last = await requestPasswordReset(repo, "otro@ejemplo.ec", "ip-hash-2");
    expect(last.ok).toBe(false);
    if (!last.ok) expect(last.error).toContain("correo más reciente");
  });
});
