import { describe, expect, it, vi } from "vitest";
import { MemoryRepo } from "@/lib/database/memory-repo";
import { keyedHash, randomToken, sha256 } from "@/lib/encryption/crypto";
import { identityTermsGate, TERMINOS_IDENTIFICACION_TEXTO } from "@/lib/content/terminos-identificacion";
import { demoEmailOtpProvider, DEMO_EMAIL_OTP_CODE, type EmailOtpProvider } from "@/lib/services/email-otp";
import { confirmGeneralCedula, confirmGeneralEmailCode, startGeneralEmailAccess, type GeneralEmailDeps } from "@/lib/services/general-email";
import { GENERIC_GENERAL_ERROR } from "@/lib/validation/constants";

const JUAN = "1710034065";
const EMAIL = "juan.perez@example.com";
const CODE = "V1234V1234";

function deps(otp: EmailOtpProvider, ip = "ip-1"): GeneralEmailDeps {
  return { ipHash: `hash-${ip}`, captchaEnabled: false, verifyCaptcha: async () => true, otp };
}

function otpFor() {
  const demo = demoEmailOtpProvider();
  return {
    send: vi.fn(demo.send),
    verify: vi.fn(async (email: string, code: string) => {
      const result = await demo.verify(email, code);
      return result.ok ? { ...result, authUserId: `auth-${email}` } : result;
    }),
  };
}

describe("puerta de términos", () => {
  it("no deja marcar ni empezar hasta abrir el texto, y el botón espera la casilla", () => {
    expect(identityTermsGate({ opened: false, accepted: false })).toEqual({ checkboxDisabled: true, startDisabled: true });
    expect(identityTermsGate({ opened: false, accepted: true })).toEqual({ checkboxDisabled: true, startDisabled: true });
    expect(identityTermsGate({ opened: true, accepted: false })).toEqual({ checkboxDisabled: false, startDisabled: true });
    expect(identityTermsGate({ opened: true, accepted: true })).toEqual({ checkboxDisabled: false, startDisabled: false });
    expect(TERMINOS_IDENTIFICACION_TEXTO).toContain("factor principal de identificación");
    expect(TERMINOS_IDENTIFICACION_TEXTO).toContain("identid[ad]");
  });

  it("no envía el código si los términos no llegan aceptados y registra la hora cuando sí", async () => {
    const repo = new MemoryRepo();
    const personId = repo.addPerson("Juan", "Pérez", JUAN);
    repo.outreachEmails.set(personId, EMAIL);
    const otp = otpFor();
    const blocked = await startGeneralEmailAccess(repo, { email: EMAIL, termsAccepted: false }, deps(otp));
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.error).toMatch(/términos/i);
    expect(otp.send).not.toHaveBeenCalled();
    expect(repo.auditLog.some((entry) => entry.action === "IDENTITY_TERMS_ACCEPTED")).toBe(false);

    const started = await startGeneralEmailAccess(repo, { email: EMAIL, termsAccepted: true }, deps(otp));
    expect(started.ok).toBe(true);
    const acceptance = repo.auditLog.find((entry) => entry.action === "IDENTITY_TERMS_ACCEPTED");
    expect(acceptance?.person_id).toBe(personId);
    expect(acceptance?.metadata?.accepted_at).toEqual(expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/));
    expect(JSON.stringify(acceptance)).not.toContain(EMAIL);
  });
});

describe("cédula obligatoria y código dactilar opcional", () => {
  it("un correo que ya está en la ficha no abre el formulario hasta la cédula", async () => {
    const repo = new MemoryRepo();
    const personId = repo.addPerson("Juan", "Pérez", JUAN);
    repo.outreachEmails.set(personId, EMAIL);
    const otp = otpFor();
    const started = await startGeneralEmailAccess(repo, { email: EMAIL, termsAccepted: true }, deps(otp));
    if (!started.ok) throw new Error(started.error);
    const coded = await confirmGeneralEmailCode(repo, started.challengeToken, { code: DEMO_EMAIL_OTP_CODE }, deps(otp));
    expect(coded).toEqual({ ok: true, phase: "cedula" });
    expect(repo.sessions.size).toBe(0);
    expect((await repo.getPerson(personId))?.login_email).toBeFalsy();

    const missing = await confirmGeneralCedula(repo, started.challengeToken, { cedula: "" }, deps(otp));
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.fieldErrors?.cedula).toBeTruthy();
    expect(repo.sessions.size).toBe(0);

    const wrong = await confirmGeneralCedula(repo, started.challengeToken, { cedula: "0926687856" }, deps(otp));
    expect(wrong).toMatchObject({ ok: false, error: GENERIC_GENERAL_ERROR });
    expect((await repo.getPerson(personId))?.login_email).toBeFalsy();

    const again = await startGeneralEmailAccess(repo, { email: EMAIL, termsAccepted: true }, deps(otp, "ip-2"));
    if (!again.ok) throw new Error(again.error);
    await confirmGeneralEmailCode(repo, again.challengeToken, { code: DEMO_EMAIL_OTP_CODE }, deps(otp, "ip-2"));
    const ok = await confirmGeneralCedula(repo, again.challengeToken, { cedula: JUAN }, deps(otp, "ip-2"));
    expect(ok).toMatchObject({ ok: true, destination: "form" });
    expect((await repo.getPerson(personId))?.login_email).toBe(EMAIL);
  });

  it("guarda el código dactilar la primera vez y rechaza uno distinto sin cambiar el guardado", async () => {
    const repo = new MemoryRepo();
    const personId = repo.addPerson("Juan", "Pérez", JUAN);
    repo.outreachEmails.set(personId, EMAIL);
    const otp = otpFor();

    const first = await startGeneralEmailAccess(repo, { email: EMAIL, termsAccepted: true }, deps(otp));
    if (!first.ok) throw new Error(first.error);
    await confirmGeneralEmailCode(repo, first.challengeToken, { code: DEMO_EMAIL_OTP_CODE }, deps(otp));
    const claimed = await confirmGeneralCedula(repo, first.challengeToken, { cedula: JUAN, codigoDactilar: CODE }, deps(otp));
    expect(claimed).toMatchObject({ ok: true, destination: "form" });
    expect(repo.generalAuth.get(personId)?.fingerprint_code_hash).toBe(keyedHash(CODE, "fingerprint_code"));
    expect(repo.auditLog.some((entry) => entry.action === "FINGERPRINT_CLAIMED")).toBe(true);

    const empty = await startGeneralEmailAccess(repo, { email: EMAIL, termsAccepted: true }, deps(otp, "ip-2"));
    if (!empty.ok) throw new Error(empty.error);
    await confirmGeneralEmailCode(repo, empty.challengeToken, { code: DEMO_EMAIL_OTP_CODE }, deps(otp, "ip-2"));
    expect(await confirmGeneralCedula(repo, empty.challengeToken, { cedula: JUAN, codigoDactilar: "" }, deps(otp, "ip-2"))).toMatchObject({ ok: true });
    expect(repo.generalAuth.get(personId)?.fingerprint_code_hash).toBe(keyedHash(CODE, "fingerprint_code"));

    const mismatch = await startGeneralEmailAccess(repo, { email: EMAIL, termsAccepted: true }, deps(otp, "ip-3"));
    if (!mismatch.ok) throw new Error(mismatch.error);
    await confirmGeneralEmailCode(repo, mismatch.challengeToken, { code: DEMO_EMAIL_OTP_CODE }, deps(otp, "ip-3"));
    const rejected = await confirmGeneralCedula(repo, mismatch.challengeToken, { cedula: JUAN, codigoDactilar: "A9876B4321" }, deps(otp, "ip-3"));
    expect(rejected).toMatchObject({ ok: false, error: GENERIC_GENERAL_ERROR });
    expect(repo.generalAuth.get(personId)?.fingerprint_code_hash).toBe(keyedHash(CODE, "fingerprint_code"));
  });
});

describe("enlace personal con correo ya cargado", () => {
  it("sigue vigente y obliga el código de correo y la cédula, sin saltarse el segundo factor", async () => {
    const repo = new MemoryRepo();
    const personId = repo.addPerson("Juan", "Pérez", JUAN);
    repo.outreachEmails.set(personId, EMAIL);
    const token = randomToken();
    const tokenId = repo.addToken(personId, sha256(token));
    const otp = otpFor();

    const wrongEmail = await startGeneralEmailAccess(repo, { email: "otro@example.com", termsAccepted: true, accessToken: token }, deps(otp));
    expect(wrongEmail.ok).toBe(false);
    expect(otp.send).not.toHaveBeenCalled();
    expect(repo.tokens.get(tokenId)?.used_at).toBeNull();
    expect(repo.tokens.get(tokenId)?.revoked_at).toBeNull();

    const started = await startGeneralEmailAccess(repo, { email: EMAIL, termsAccepted: true, accessToken: token }, deps(otp, "ip-2"));
    if (!started.ok) throw new Error(started.error);
    const coded = await confirmGeneralEmailCode(repo, started.challengeToken, { code: DEMO_EMAIL_OTP_CODE }, deps(otp, "ip-2"));
    expect(coded).toEqual({ ok: true, phase: "cedula" });
    expect(repo.sessions.size).toBe(0);

    const done = await confirmGeneralCedula(repo, started.challengeToken, { cedula: JUAN, accessToken: token }, deps(otp, "ip-2"));
    expect(done).toMatchObject({ ok: true, destination: "form" });
    expect([...repo.sessions.values()][0]).toMatchObject({ entry_method: "token", access_token_id: tokenId, person_id: personId });
    expect(repo.tokens.get(tokenId)?.used_at).toBeNull();
    expect(repo.tokens.get(tokenId)?.revoked_at).toBeNull();
    expect((await repo.getPerson(personId))?.login_email).toBe(EMAIL);
  });
});
