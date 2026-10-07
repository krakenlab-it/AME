import { beforeEach, describe, expect, it } from "vitest";
import { randomToken, sha256 } from "@/lib/encryption/crypto";
import { CONSENT_TEXTS } from "@/lib/privacy/notice";
import { GENERIC_IDENTIFY_ERROR } from "@/lib/validation/constants";
import { getRespondentContext, identify, inspectLink, submitResponse, type SubmitDeps } from "@/lib/services/respondent";
import { MemoryRepo } from "@/lib/database/memory-repo";
import { makeCedula } from "./helpers/cedula";
import { validSubmission } from "./helpers/fixtures";

const JUAN = "1710034065";
const MARIA = makeCedula("010203040");
const deps = (ipHash = "ip-1") => ({ ipHash, captchaEnabled: false, verifyCaptcha: async () => true });
const submitDeps: SubmitDeps = { activeNoticeVersion: "1.0", consentTexts: { ...CONSENT_TEXTS }, retentionMonths: 60, portalBlocked: false };

let repo: MemoryRepo;
let juanId: string;
let mariaId: string;
let juanToken: string;
let mariaToken: string;

beforeEach(() => {
  repo = new MemoryRepo();
  juanId = repo.addPerson("Juan Carlos", "Pérez López", JUAN);
  mariaId = repo.addPerson("María José", "Andrade Vega", MARIA);
  juanToken = randomToken();
  mariaToken = randomToken();
  repo.addToken(juanId, sha256(juanToken));
  repo.addToken(mariaId, sha256(mariaToken));
});

async function login(token = juanToken, cedula = JUAN) {
  const r = await identify(repo, { token, cedula }, deps());
  if (!r.ok) throw new Error(r.error);
  return r.sessionToken;
}

describe("identificación con enlace individual", () => {
  it("permite el acceso con token válido + cédula correcta", async () => {
    const r = await identify(repo, { token: juanToken, cedula: JUAN }, deps());
    expect(r.ok).toBe(true);
    expect(repo.people.get(juanId)!.status).toBe("STARTED");
    expect(repo.auditLog.map((a) => a.action)).toContain("IDENTITY_VERIFIED");
  });

  it("responde con un error genérico si la cédula no corresponde", async () => {
    const r = await identify(repo, { token: juanToken, cedula: MARIA }, deps());
    expect(r).toMatchObject({ ok: false, error: GENERIC_IDENTIFY_ERROR });
  });

  it("no permite acceder al registro de otra persona con la cédula correcta de esa persona", async () => {
    // Juan tiene su enlace y conoce la cédula de María: no puede ver el registro de María.
    const r = await identify(repo, { token: juanToken, cedula: MARIA }, deps());
    expect(r.ok).toBe(false);
    const ok = await identify(repo, { token: juanToken, cedula: JUAN }, deps());
    const ctx = await getRespondentContext(repo, ok.ok ? ok.sessionToken : undefined);
    expect(ctx?.person.id).toBe(juanId);
    expect(ctx?.person.id).not.toBe(mariaId);
  });

  it("no revela información con un token inexistente", async () => {
    const r = await identify(repo, { token: randomToken(), cedula: JUAN }, deps());
    expect(r).toMatchObject({ ok: false, error: GENERIC_IDENTIFY_ERROR });
    expect(repo.securityEvents.at(-1)?.event_type).toBe("UNKNOWN_TOKEN_IDENTIFY");
  });

  it("rechaza un token vencido", async () => {
    const t = randomToken();
    repo.addToken(juanId, sha256(t), { expires_at: new Date(Date.now() - 1000).toISOString() });
    const r = await identify(repo, { token: t, cedula: JUAN }, deps());
    expect(r).toMatchObject({ ok: false, linkState: "expired" });
    expect(await inspectLink(repo, t, "ip")).toBe("expired");
  });

  it("rechaza un token revocado", async () => {
    const t = randomToken();
    repo.addToken(juanId, sha256(t), { revoked_at: new Date().toISOString() });
    expect(await identify(repo, { token: t, cedula: JUAN }, deps())).toMatchObject({ ok: false, linkState: "revoked" });
  });

  it("rechaza un token ya utilizado", async () => {
    const t = randomToken();
    repo.addToken(juanId, sha256(t), { used_at: new Date().toISOString() });
    expect(await identify(repo, { token: t, cedula: JUAN }, deps())).toMatchObject({ ok: false, linkState: "used" });
  });

  it("bloquea el enlace después de 5 intentos fallidos", async () => {
    for (let i = 0; i < 4; i++) {
      expect((await identify(repo, { token: juanToken, cedula: MARIA }, deps(`ip-${i}`))).ok).toBe(false);
    }
    const fifth = await identify(repo, { token: juanToken, cedula: MARIA }, deps("ip-9"));
    expect(fifth).toMatchObject({ ok: false, linkState: "revoked" });
    // Incluso con la cédula correcta, el enlace queda bloqueado
    expect((await identify(repo, { token: juanToken, cedula: JUAN }, deps("ip-10"))).ok).toBe(false);
  });

  it("limita búsquedas masivas desde una misma IP (rate limiting)", async () => {
    const results = [];
    for (let i = 0; i < 12; i++) results.push(await identify(repo, { token: randomToken(), cedula: makeCedula(`17100${String(1000 + i)}`) }, deps("atacante")));
    expect(results.at(-1)).toMatchObject({ ok: false, error: expect.stringContaining("demasiados intentos") });
    expect(repo.securityEvents.some((e) => e.event_type === "IDENTIFY_RATE_LIMITED")).toBe(true);
  });

  it("exige CAPTCHA después de varios intentos cuando está configurado", async () => {
    const d = { ipHash: "ip-c", captchaEnabled: true, verifyCaptcha: async (t?: string) => t === "ok" };
    for (let i = 0; i < 3; i++) await identify(repo, { token: juanToken, cedula: MARIA }, d);
    expect(await identify(repo, { token: juanToken, cedula: JUAN }, d)).toMatchObject({ ok: false, requireCaptcha: true });
    expect((await identify(repo, { token: mariaToken, cedula: MARIA, captchaToken: "ok" }, d)).ok).toBe(true);
  });

  it("acepta el pasaporte guardado en la importación, con espacios o minúsculas", async () => {
    const passport = "BH823158";
    const personId = repo.addPerson("Oscar Alexander", "Bolivar Bolivar", passport);
    const token = randomToken();
    repo.addToken(personId, sha256(token));
    expect((await identify(repo, { token, cedula: "bh 823158" }, deps("ip-pass"))).ok).toBe(true);

    const other = repo.addPerson("Javier Alfonso", "Echeverry Velasquez", "BA086520");
    const otherToken = randomToken();
    repo.addToken(other, sha256(otherToken));
    expect((await identify(repo, { token: otherToken, cedula: "ba-086520" }, deps("ip-pass-2"))).ok).toBe(true);
    expect((await identify(repo, { token: otherToken, cedula: "17100340A5" }, deps("ip-pass-3"))).ok).toBe(false);
  });

  it("valida el formato de la cédula antes de consultar", async () => {
    const r = await identify(repo, { token: juanToken, cedula: "123" }, deps());
    expect(r.ok).toBe(false);
    expect(repo.tokens.get([...repo.tokens.keys()][0]!)!.failed_attempts).toBe(0);
  });
});

describe("envío del formulario", () => {
  it("guarda la actualización y devuelve un número de confirmación AIG-XXXXXXXX", async () => {
    const session = await login();
    const r = await submitResponse(repo, session, validSubmission(), submitDeps);
    expect(r).toMatchObject({ ok: true, confirmationCode: expect.stringMatching(/^AIG-[A-Z2-9]{8}$/) });
    const p = repo.people.get(juanId)!;
    expect(p.status).toBe("COMPLETED");
    expect(p.confirmation_code).not.toContain(JUAN.slice(-4));
    const saved = repo.submissions.get(juanId)!;
    expect(saved.bank.account_number_last4).toBe("4821");
    expect(saved.bank.account_number_encrypted).not.toContain("2200004821");
    expect(saved.consents.map((c) => c.type)).toEqual(["PRIVACY_NOTICE", "DATA_SHARING_AIG", "ACCURACY_DECLARATION", "BANK_ACCOUNT_AUTHORIZATION"]);
  });

  it("rechaza el envío sin consentimiento obligatorio", async () => {
    const session = await login();
    const r = await submitResponse(repo, session, validSubmission({ consents: { privacyAccepted: true, sharingAccepted: false, accuracyDeclared: true } }), submitDeps);
    expect(r).toMatchObject({ ok: false, fieldErrors: { "consents.sharingAccepted": expect.any(String) } });
    expect(repo.people.get(juanId)!.submitted_at).toBeNull();
  });

  it("rechaza correos y cuentas que no coinciden", async () => {
    const session = await login();
    const base = validSubmission();
    const r = await submitResponse(repo, session, { ...base, contact: { ...base.contact, primaryEmailConfirm: "x@y.com" }, bank: { ...base.bank, accountNumberConfirm: "1" } }, submitDeps);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.fieldErrors?.["contact.primaryEmailConfirm"]).toBeDefined();
      expect(r.fieldErrors?.["bank.accountNumberConfirm"]).toBeDefined();
    }
  });

  it("registra corrección de nombres y marca el registro para revisión", async () => {
    const session = await login();
    const r = await submitResponse(repo, session, validSubmission({ names: { namesConfirmed: false, firstNames: "Juan Carlos", lastNames: "Pérez Loor" } }), submitDeps);
    expect(r.ok).toBe(true);
    const p = repo.people.get(juanId)!;
    expect(p.status).toBe("NEEDS_REVIEW");
    expect(p.review_reasons).toContain("NAMES_CORRECTED");
    expect(repo.submissions.get(juanId)!.changed_fields).toContain("last_names");
  });

  it("ignora nombres modificados si el titular confirmó los registrados", async () => {
    const session = await login();
    await submitResponse(repo, session, validSubmission({ names: { namesConfirmed: true, firstNames: "Otro", lastNames: "Nombre" } }), submitDeps);
    expect(repo.people.get(juanId)!.first_names).toBe("Juan Carlos");
  });

  it("marca para revisión si la cuenta pertenece a un tercero", async () => {
    const session = await login();
    const base = validSubmission();
    await submitResponse(repo, session, { ...base, bank: { ...base.bank, accountHolderCedula: MARIA, accountHolderName: "María José Andrade" } }, submitDeps);
    expect(repo.people.get(juanId)!.review_reasons).toContain("THIRD_PARTY_ACCOUNT");
  });

  it("no permite enviar dos veces con el mismo enlace o sesión", async () => {
    const session = await login();
    expect((await submitResponse(repo, session, validSubmission(), submitDeps)).ok).toBe(true);
    expect((await submitResponse(repo, session, validSubmission(), submitDeps)).ok).toBe(false);
    expect((await identify(repo, { token: juanToken, cedula: JUAN }, deps())).ok).toBe(false);
  });

  it("rechaza sesiones inexistentes o manipuladas", async () => {
    expect(await submitResponse(repo, randomToken(), validSubmission(), submitDeps)).toMatchObject({ ok: false, sessionExpired: true });
    expect(await submitResponse(repo, undefined, validSubmission(), submitDeps)).toMatchObject({ ok: false, sessionExpired: true });
  });

  it("exige la versión vigente del aviso de privacidad", async () => {
    const session = await login();
    const r = await submitResponse(repo, session, validSubmission({ noticeVersion: "0.9" }), submitDeps);
    expect(r.ok).toBe(false);
  });

  it("no permite enviar cuando el portal está bloqueado por revisión legal", async () => {
    const session = await login();
    expect((await submitResponse(repo, session, validSubmission(), { ...submitDeps, portalBlocked: true })).ok).toBe(false);
  });

  it("la auditoría no contiene valores personales ni bancarios", async () => {
    const session = await login();
    await submitResponse(repo, session, validSubmission(), submitDeps);
    const serialized = JSON.stringify(repo.auditLog);
    for (const secret of ["2200004821", JUAN, "juan@correo.com", "0991234567", "Pérez"]) expect(serialized).not.toContain(secret);
  });
});
