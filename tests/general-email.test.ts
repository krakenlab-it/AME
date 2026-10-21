import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRepo } from "@/lib/database/memory-repo";
import { keyedHash } from "@/lib/encryption/crypto";
import { demoEmailOtpProvider, DEMO_EMAIL_OTP_CODE, type EmailOtpProvider } from "@/lib/services/email-otp";
import {
  confirmGeneralEmailCode,
  EMAIL_CODE_MISMATCH,
  EMAIL_SEND_LIMIT,
  resendGeneralEmailCode,
  startGeneralEmailAccess,
  type GeneralEmailDeps,
} from "@/lib/services/general-email";
import { registeredView, submitResponse } from "@/lib/services/respondent";
import { settings } from "@/lib/services/settings";
import { GENERIC_GENERAL_ERROR } from "@/lib/validation/constants";
import { validSubmission } from "./helpers/fixtures";

const JUAN = "1710034065";
const ANA = "0926687856";
const EMAIL = "juan.perez@example.com";
const CODE = "V1234V1234";

/** Proveedor falso: un usuario de Auth por correo, como Supabase con shouldCreateUser. */
function fakeOtp(overrides: Partial<EmailOtpProvider> = {}) {
  const demo = demoEmailOtpProvider();
  const verify = vi.fn(async (email: string, code: string) => {
    const result = await demo.verify(email, code);
    return result.ok ? { ...result, authUserId: `auth-${email}` } : result;
  });
  const send = vi.fn(demo.send);
  return { send, verify, ...overrides };
}

function deps(otp: EmailOtpProvider, ip = "ip-1"): GeneralEmailDeps {
  return { ipHash: `hash-${ip}`, captchaEnabled: false, verifyCaptcha: async () => true, otp };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("ingreso con código por correo", () => {
  it("envía el código, lo verifica, guarda el correo y abre el formulario con el correo relleno", async () => {
    const repo = new MemoryRepo();
    const personId = repo.addPerson("Juan Carlos", "Pérez López", JUAN);
    const otp = fakeOtp();

    const started = await startGeneralEmailAccess(repo, { cedula: JUAN, email: " Juan.Perez@Example.com " }, deps(otp));
    expect(started).toMatchObject({ ok: true, phase: "email", maskedEmail: "j*********@example.com", resendAfterSeconds: 60 });
    if (!started.ok) return;
    expect(otp.send).toHaveBeenCalledWith(EMAIL);
    expect(repo.auditLog.some((e) => e.action === "EMAIL_CODE_SENT")).toBe(true);

    const confirmed = await confirmGeneralEmailCode(repo, started.challengeToken, { code: DEMO_EMAIL_OTP_CODE }, deps(otp, "ip-2"));
    expect(confirmed).toMatchObject({ ok: true, destination: "form" });
    if (!confirmed.ok) return;
    expect(otp.verify).toHaveBeenCalledWith(EMAIL, DEMO_EMAIL_OTP_CODE);

    const person = await repo.getPerson(personId);
    expect(person?.login_email).toBe(EMAIL);
    expect(registeredView(person!).email).toBe(EMAIL);
    expect(repo.generalAuth.get(personId)?.auth_user_id).toBe(`auth-${EMAIL}`);
    expect(repo.generalAuth.get(personId)?.totp_enabled_at).toBeNull();
    expect(repo.auditLog.some((e) => e.action === "EMAIL_VERIFIED")).toBe(true);
    expect((await repo.getPersonDetail(personId))?.general_access.email_verified).toBe(true);

    const session = [...repo.sessions.values()].find((s) => s.person_id === personId);
    expect(session).toMatchObject({ entry_method: "general", access_token_id: null });

    const submitted = await submitResponse(repo, confirmed.sessionToken, validSubmission(), {
      activeNoticeVersion: "1.0",
      consentTexts: { PRIVACY_NOTICE: "a", DATA_SHARING_AIG: "b", ACCURACY_DECLARATION: "c", BANK_ACCOUNT_AUTHORIZATION: "d" },
      retentionMonths: 12,
      portalBlocked: false,
    });
    expect(submitted.ok).toBe(true);

    // El reto ya se usó: el mismo código no abre otra sesión.
    const again = await confirmGeneralEmailCode(repo, started.challengeToken, { code: DEMO_EMAIL_OTP_CODE }, deps(otp, "ip-3"));
    expect(again).toMatchObject({ ok: false, challengeExpired: true });

    // Ni la cédula ni el correo quedan en la auditoría ni en los eventos de seguridad.
    const dumped = JSON.stringify({ audit: repo.auditLog, security: repo.securityEvents });
    expect(dumped).not.toContain(JUAN);
    expect(dumped).not.toContain(EMAIL);
  });

  it("pide un correo válido y no envía nada si falta", async () => {
    const repo = new MemoryRepo();
    repo.addPerson("Juan", "Pérez", JUAN);
    const otp = fakeOtp();
    const bad = await startGeneralEmailAccess(repo, { cedula: JUAN, email: "no-es-correo" }, deps(otp));
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.fieldErrors?.email).toBeTruthy();
    const missing = await startGeneralEmailAccess(repo, { cedula: JUAN }, deps(otp));
    expect(missing.ok).toBe(false);
    expect(otp.send).not.toHaveBeenCalled();
  });

  it("usa el error genérico si la cédula no existe o el código dactilar no coincide, sin enviar correo", async () => {
    const repo = new MemoryRepo();
    const personId = repo.addPerson("Ana", "Gómez", ANA);
    repo.generalAuth.set(personId, {
      fingerprint_code_hash: keyedHash(CODE, "fingerprint_code"),
      fingerprint_claimed_at: null,
      totp_secret_encrypted: null,
      totp_enabled_at: null,
      failed_attempts: 0,
      locked_until: null,
      challenge_hash: null,
      challenge_expires_at: null,
      challenge_purpose: null,
    });
    const otp = fakeOtp();
    const unknown = await startGeneralEmailAccess(repo, { cedula: JUAN, email: EMAIL }, deps(otp));
    const mismatch = await startGeneralEmailAccess(repo, { cedula: ANA, email: EMAIL, codigoDactilar: "A9876B4321" }, deps(otp));
    expect(unknown).toMatchObject({ ok: false, error: GENERIC_GENERAL_ERROR });
    expect(mismatch).toMatchObject({ ok: false, error: GENERIC_GENERAL_ERROR });
    expect(otp.send).not.toHaveBeenCalled();
    const ok = await startGeneralEmailAccess(repo, { cedula: ANA, email: EMAIL, codigoDactilar: CODE }, deps(otp));
    expect(ok.ok).toBe(true);
  });

  it("un código equivocado suma intentos y bloquea sin volver a consultar a Supabase", async () => {
    const repo = new MemoryRepo();
    const personId = repo.addPerson("Juan", "Pérez", JUAN);
    const otp = fakeOtp();
    const started = await startGeneralEmailAccess(repo, { cedula: JUAN, email: EMAIL }, deps(otp));
    if (!started.ok) throw new Error("no inició");

    const wrong = await confirmGeneralEmailCode(repo, started.challengeToken, { code: "000000" }, deps(otp));
    expect(wrong).toMatchObject({ ok: false, error: EMAIL_CODE_MISMATCH });
    const format = await confirmGeneralEmailCode(repo, started.challengeToken, { code: "12ab" }, deps(otp));
    expect(format.ok).toBe(false);
    if (!format.ok) expect(format.fieldErrors?.code).toBeTruthy();

    for (let i = 1; i < settings.generalLockThreshold; i += 1) {
      await confirmGeneralEmailCode(repo, started.challengeToken, { code: "000000" }, deps(otp, `ip-${i + 10}`));
    }
    expect(repo.generalAuth.get(personId)?.locked_until).toBeTruthy();
    const calls = vi.mocked(otp.verify).mock.calls.length;
    const locked = await confirmGeneralEmailCode(repo, started.challengeToken, { code: DEMO_EMAIL_OTP_CODE }, deps(otp, "ip-99"));
    expect(locked).toMatchObject({ ok: false, error: GENERIC_GENERAL_ERROR });
    expect(vi.mocked(otp.verify).mock.calls.length).toBe(calls);
    expect((await repo.getPerson(personId))?.login_email).toBeUndefined();
  });

  it("el reenvío espera 60 segundos y vuelve al mismo correo", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-21T15:00:00Z"));
    const repo = new MemoryRepo();
    repo.addPerson("Juan", "Pérez", JUAN);
    const otp = fakeOtp();
    const started = await startGeneralEmailAccess(repo, { cedula: JUAN, email: EMAIL }, deps(otp));
    if (!started.ok) throw new Error("no inició");

    const early = await resendGeneralEmailCode(repo, started.challengeToken, deps(otp));
    expect(early.ok).toBe(false);
    if (!early.ok) {
      expect(early.resendAfterSeconds).toBe(60);
      expect(early.error).toContain("60 segundos");
    }

    vi.setSystemTime(new Date("2026-10-21T15:01:01Z"));
    const later = await resendGeneralEmailCode(repo, started.challengeToken, deps(otp));
    expect(later).toMatchObject({ ok: true, resendAfterSeconds: 60 });
    expect(otp.send).toHaveBeenCalledTimes(2);
    expect(otp.send).toHaveBeenLastCalledWith(EMAIL);

    // Después de 10 minutos el reto vence: hay que volver a escribir la cédula.
    vi.setSystemTime(new Date("2026-10-21T15:11:00Z"));
    const expired = await resendGeneralEmailCode(repo, started.challengeToken, deps(otp));
    expect(expired).toMatchObject({ ok: false, challengeExpired: true });
    const confirmExpired = await confirmGeneralEmailCode(repo, started.challengeToken, { code: DEMO_EMAIL_OTP_CODE }, deps(otp));
    expect(confirmExpired).toMatchObject({ ok: false, challengeExpired: true });
  });

  it("limita los envíos por persona y respeta el límite de Supabase", async () => {
    const repo = new MemoryRepo();
    repo.addPerson("Juan", "Pérez", JUAN);
    const otp = fakeOtp();
    for (let i = 0; i < settings.emailOtpLimitPerPerson; i += 1) {
      const ok = await startGeneralEmailAccess(repo, { cedula: JUAN, email: EMAIL }, deps(otp, `ip-${i}`));
      expect(ok.ok).toBe(true);
    }
    const capped = await startGeneralEmailAccess(repo, { cedula: JUAN, email: EMAIL }, deps(otp, "ip-x"));
    expect(capped).toMatchObject({ ok: false, error: EMAIL_SEND_LIMIT });

    const repo2 = new MemoryRepo();
    repo2.addPerson("Juan", "Pérez", JUAN);
    const limited = fakeOtp({ send: vi.fn(async () => ({ ok: false as const, reason: "rate_limited" as const })) });
    const blocked = await startGeneralEmailAccess(repo2, { cedula: JUAN, email: EMAIL }, deps(limited));
    expect(blocked).toMatchObject({ ok: false, error: EMAIL_SEND_LIMIT });
  });

  it("no vincula el mismo usuario de Auth a dos cédulas", async () => {
    const repo = new MemoryRepo();
    repo.addPerson("Juan", "Pérez", JUAN);
    const anaId = repo.addPerson("Ana", "Gómez", ANA);
    const otp = fakeOtp();

    const first = await startGeneralEmailAccess(repo, { cedula: JUAN, email: EMAIL }, deps(otp));
    if (!first.ok) throw new Error("no inició");
    expect((await confirmGeneralEmailCode(repo, first.challengeToken, { code: DEMO_EMAIL_OTP_CODE }, deps(otp))).ok).toBe(true);

    const second = await startGeneralEmailAccess(repo, { cedula: ANA, email: EMAIL }, deps(otp, "ip-2"));
    if (!second.ok) throw new Error("no inició");
    const rejected = await confirmGeneralEmailCode(repo, second.challengeToken, { code: DEMO_EMAIL_OTP_CODE }, deps(otp, "ip-2"));
    expect(rejected).toMatchObject({ ok: false, error: GENERIC_GENERAL_ERROR });
    expect((await repo.getPerson(anaId))?.login_email).toBeUndefined();
  });

  it("si Supabase confirma otro correo, no se acepta", async () => {
    const repo = new MemoryRepo();
    repo.addPerson("Juan", "Pérez", JUAN);
    const otp = fakeOtp({ verify: vi.fn(async () => ({ ok: true as const, authUserId: "x", email: "otro@example.com" })) });
    const started = await startGeneralEmailAccess(repo, { cedula: JUAN, email: EMAIL }, deps(otp));
    if (!started.ok) throw new Error("no inició");
    const result = await confirmGeneralEmailCode(repo, started.challengeToken, { code: "123456" }, deps(otp));
    expect(result).toMatchObject({ ok: false, error: EMAIL_CODE_MISMATCH });
  });
});

describe("método de ingreso", () => {
  it("usa el correo por defecto y la aplicación solo con AME_GENERAL_AUTH_METHOD=totp", () => {
    vi.stubEnv("AME_GENERAL_AUTH_METHOD", "");
    expect(settings.generalAuthMethod()).toBe("email");
    vi.stubEnv("AME_GENERAL_AUTH_METHOD", "totp");
    expect(settings.generalAuthMethod()).toBe("totp");
  });
});

describe("correo de ingreso ya verificado", () => {
  it("no deja entrar con otro correo a una cédula que ya verificó uno", async () => {
    const repo = new MemoryRepo();
    const personId = repo.addPerson("Juan Carlos", "Pérez López", JUAN);
    const otp = fakeOtp();
    const first = await startGeneralEmailAccess(repo, { cedula: JUAN, email: EMAIL }, deps(otp));
    if (!first.ok) throw new Error("start");
    expect(await confirmGeneralEmailCode(repo, first.challengeToken, { code: DEMO_EMAIL_OTP_CODE }, deps(otp))).toMatchObject({ ok: true });

    vi.mocked(otp.send).mockClear();
    const other = await startGeneralEmailAccess(repo, { cedula: JUAN, email: "otra.persona@example.com" }, deps(otp, "ip-3"));
    expect(other).toMatchObject({ ok: false, fieldErrors: { email: expect.any(String) } });
    if (!other.ok) expect(other.error).toContain("j*********@example.com");
    expect(otp.send).not.toHaveBeenCalled();
    expect((await repo.getPerson(personId))?.login_email).toBe(EMAIL);

    const same = await startGeneralEmailAccess(repo, { cedula: JUAN, email: "JUAN.PEREZ@example.com" }, deps(otp, "ip-4"));
    expect(same).toMatchObject({ ok: true });
  });

  it("el reinicio del administrador libera el correo para vincular uno nuevo", async () => {
    const repo = new MemoryRepo();
    const personId = repo.addPerson("Juan Carlos", "Pérez López", JUAN);
    const otp = fakeOtp();
    const first = await startGeneralEmailAccess(repo, { cedula: JUAN, email: EMAIL }, deps(otp));
    if (!first.ok) throw new Error("start");
    await confirmGeneralEmailCode(repo, first.challengeToken, { code: DEMO_EMAIL_OTP_CODE }, deps(otp));
    expect(await repo.resetGeneralAuth(personId)).toBe(true);

    const next = await startGeneralEmailAccess(repo, { cedula: JUAN, email: "nuevo@example.com" }, deps(otp, "ip-5"));
    if (!next.ok) throw new Error(next.error);
    expect(await confirmGeneralEmailCode(repo, next.challengeToken, { code: DEMO_EMAIL_OTP_CODE }, deps(otp, "ip-5"))).toMatchObject({ ok: true });
    expect((await repo.getPerson(personId))?.login_email).toBe("nuevo@example.com");
  });
});
