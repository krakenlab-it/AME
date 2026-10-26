import { describe, expect, it, vi } from "vitest";
import { MemoryRepo } from "@/lib/database/memory-repo";
import { keyedHash, randomToken, sha256 } from "@/lib/encryption/crypto";
import { identityTermsGate, TERMINOS_IDENTIFICACION_TEXTO } from "@/lib/content/terminos-identificacion";
import { demoEmailOtpProvider, DEMO_EMAIL_OTP_CODE, type EmailOtpProvider } from "@/lib/services/email-otp";
import { confirmGeneralCedula, confirmGeneralEmailCode, startGeneralEmailAccess, type GeneralEmailDeps } from "@/lib/services/general-email";
import { WRONG_CEDULA_ERROR, WRONG_FINGERPRINT_ERROR } from "@/lib/services/general-email";

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

describe("cédula y código dactilar obligatorios", () => {
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

    const wrong = await confirmGeneralCedula(repo, started.challengeToken, { cedula: "0926687856", codigoDactilar: CODE }, deps(otp));
    expect(wrong).toMatchObject({ ok: false, error: WRONG_CEDULA_ERROR });
    expect((await repo.getPerson(personId))?.login_email).toBeFalsy();

    const again = await startGeneralEmailAccess(repo, { email: EMAIL, termsAccepted: true }, deps(otp, "ip-2"));
    if (!again.ok) throw new Error(again.error);
    await confirmGeneralEmailCode(repo, again.challengeToken, { code: DEMO_EMAIL_OTP_CODE }, deps(otp, "ip-2"));
    const ok = await confirmGeneralCedula(repo, again.challengeToken, { cedula: JUAN, codigoDactilar: CODE }, deps(otp, "ip-2"));
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
    const skipped = await confirmGeneralCedula(repo, empty.challengeToken, { cedula: JUAN, codigoDactilar: "" }, deps(otp, "ip-2"));
    expect(skipped.ok).toBe(false);
    if (!skipped.ok) expect(skipped.fieldErrors?.codigoDactilar).toMatch(/^Formato:/);
    expect(repo.generalAuth.get(personId)?.fingerprint_code_hash).toBe(keyedHash(CODE, "fingerprint_code"));

    const mismatch = await startGeneralEmailAccess(repo, { email: EMAIL, termsAccepted: true }, deps(otp, "ip-3"));
    if (!mismatch.ok) throw new Error(mismatch.error);
    await confirmGeneralEmailCode(repo, mismatch.challengeToken, { code: DEMO_EMAIL_OTP_CODE }, deps(otp, "ip-3"));
    const rejected = await confirmGeneralCedula(repo, mismatch.challengeToken, { cedula: JUAN, codigoDactilar: "A9876B4321" }, deps(otp, "ip-3"));
    expect(rejected).toMatchObject({ ok: false, error: WRONG_FINGERPRINT_ERROR });
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

    const missingCode = await confirmGeneralCedula(repo, started.challengeToken, { cedula: JUAN, accessToken: token }, deps(otp, "ip-2"));
    expect(missingCode.ok).toBe(false);
    if (!missingCode.ok) expect(missingCode.fieldErrors?.codigoDactilar).toMatch(/^Formato:/);
    expect(repo.sessions.size).toBe(0);

    const done = await confirmGeneralCedula(repo, started.challengeToken, { cedula: JUAN, codigoDactilar: "v 1234-v1234", accessToken: token }, deps(otp, "ip-2"));
    expect(done).toMatchObject({ ok: true, destination: "form" });
    expect([...repo.sessions.values()][0]).toMatchObject({ entry_method: "token", access_token_id: tokenId, person_id: personId });
    expect(repo.tokens.get(tokenId)?.used_at).toBeNull();
    expect(repo.tokens.get(tokenId)?.revoked_at).toBeNull();
    expect((await repo.getPerson(personId))?.login_email).toBe(EMAIL);
  });

  it("un pasaporte no pide código dactilar y un formato inválido no entra", async () => {
    const repo = new MemoryRepo();
    const passport = "BH823158";
    const email = "oscar.bolivar@example.com";
    const personId = repo.addPerson("Oscar", "Bolivar", passport);
    repo.outreachEmails.set(personId, email);
    const token = randomToken();
    repo.addToken(personId, sha256(token));
    const otp = otpFor();

    const started = await startGeneralEmailAccess(repo, { email, termsAccepted: true, accessToken: token }, deps(otp));
    if (!started.ok) throw new Error(started.error);
    await confirmGeneralEmailCode(repo, started.challengeToken, { code: DEMO_EMAIL_OTP_CODE }, deps(otp));

    const bad = await confirmGeneralCedula(
      repo,
      started.challengeToken,
      { cedula: passport, codigoDactilar: "V123", accessToken: token },
      deps(otp),
    );
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.fieldErrors?.codigoDactilar).toMatch(/^Formato:/);
    expect(repo.sessions.size).toBe(0);

    const done = await confirmGeneralCedula(repo, started.challengeToken, { cedula: passport, accessToken: token }, deps(otp));
    expect(done).toMatchObject({ ok: true, destination: "form" });
    expect(repo.generalAuth.get(personId)?.fingerprint_code_hash ?? null).toBeNull();
    expect(repo.auditLog.some((entry) => entry.action === "FINGERPRINT_CLAIMED")).toBe(false);
  });
});
