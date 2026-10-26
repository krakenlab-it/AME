import { describe, expect, it, vi } from "vitest";
import { MemoryRepo } from "@/lib/database/memory-repo";
import { RepoError } from "@/lib/database/types";
import { keyedHash } from "@/lib/encryption/crypto";
import { demoEmailOtpProvider, DEMO_EMAIL_OTP_CODE, type EmailOtpProvider } from "@/lib/services/email-otp";
import { linkUnlinkedAccount } from "@/lib/services/account-link";
import { confirmGeneralCedula, confirmGeneralEmailCode, startGeneralEmailAccess, lockoutError, WRONG_CEDULA_ERROR, WRONG_FINGERPRINT_ERROR, type GeneralEmailDeps } from "@/lib/services/general-email";
import { composeInsuredHome, insuredGreeting } from "@/lib/services/insured-home";
import { getRespondentContext, submitResponse } from "@/lib/services/respondent";
import { settings } from "@/lib/services/settings";
import { validSubmission } from "./helpers/fixtures";

const JUAN = "1710034065";
const ANA = "0926687856";
const CODE = "V1234V1234";

function fakeOtp(): EmailOtpProvider & { send: ReturnType<typeof vi.fn> } {
  const demo = demoEmailOtpProvider();
  return {
    send: vi.fn(demo.send),
    verify: vi.fn(async (email: string, code: string) => {
      const result = await demo.verify(email, code);
      return result.ok ? { ...result, authUserId: `auth-${email}` } : result;
    }),
  };
}

function deps(otp: EmailOtpProvider, ip = "ip-1"): GeneralEmailDeps {
  return { ipHash: `hash-${ip}`, captchaEnabled: false, verifyCaptcha: async () => true, otp };
}

async function signIn(repo: MemoryRepo, input: { email: string; cedula: string; codigoDactilar?: string }, otp = fakeOtp(), ip = "ip-1") {
  const started = await startGeneralEmailAccess(repo, { email: input.email, termsAccepted: true }, deps(otp, ip));
  if (!started.ok) throw new Error(started.error);
  const coded = await confirmGeneralEmailCode(repo, started.challengeToken, { code: DEMO_EMAIL_OTP_CODE }, deps(otp, ip));
  if (!coded.ok) throw new Error(coded.error);
  const confirmed = await confirmGeneralCedula(repo, started.challengeToken, { cedula: input.cedula, codigoDactilar: input.codigoDactilar ?? CODE }, deps(otp, ip));
  if (!confirmed.ok) throw new Error(confirmed.error);
  return confirmed;
}

const selfAccounts = (repo: MemoryRepo) => [...repo.people.values()].filter((p) => p.self_registered_at);

describe("vinculación automática por cédula", () => {
  it("primera vez: guarda el dactilar, vincula el correo y abre el formulario", async () => {
    const repo = new MemoryRepo();
    const juan = repo.addPerson("Juan", "Pérez", JUAN);
    const confirmed = await signIn(repo, { email: "alguien@example.com", cedula: JUAN });
    expect(confirmed.destination).toBe("form");
    expect((await repo.getPerson(juan))?.login_email).toBe("alguien@example.com");
    expect(repo.generalAuth.get(juan)?.fingerprint_code_hash).toBe(keyedHash(CODE, "fingerprint_code"));
    expect(repo.generalAuth.get(juan)?.auth_user_id).toBe("auth-alguien@example.com");
    expect(selfAccounts(repo)).toHaveLength(0);
    expect(await repo.listUnlinkedAccounts(10)).toHaveLength(0);
    const audit = repo.auditLog.find((entry) => entry.action === "PERSON_AUTO_LINKED");
    expect(audit).toMatchObject({ person_id: juan, masked_cedula: "17******65", metadata: { match: "dactilar_first_use" } });
    expect(repo.auditLog.some((entry) => entry.action === "ACCOUNT_LINK_REQUESTED")).toBe(false);
    const dumped = JSON.stringify({ audit: repo.auditLog, security: repo.securityEvents });
    expect(dumped).not.toContain(JUAN);
    expect(dumped).not.toContain("alguien@example.com");
    const today = await repo.listAutoLinksSince(new Date(Date.now() - 60_000).toISOString());
    expect(today).toEqual([expect.objectContaining({ personId: juan, match: "dactilar_first_use", maskedCedula: "17******65" })]);
  });

  it("si el dactilar ya está guardado, tiene que coincidir", async () => {
    const repo = new MemoryRepo();
    const juan = repo.addPerson("Juan", "Pérez", JUAN);
    await signIn(repo, { email: "juan@example.com", cedula: JUAN });
    const otp = fakeOtp();
    const started = await startGeneralEmailAccess(repo, { email: "juan@example.com", termsAccepted: true }, deps(otp, "ip-2"));
    if (!started.ok) throw new Error(started.error);
    await confirmGeneralEmailCode(repo, started.challengeToken, { code: DEMO_EMAIL_OTP_CODE }, deps(otp, "ip-2"));
    const mismatch = await confirmGeneralCedula(repo, started.challengeToken, { cedula: JUAN, codigoDactilar: "A9876B4321" }, deps(otp, "ip-2"));
    expect(mismatch).toMatchObject({ ok: false, error: WRONG_FINGERPRINT_ERROR });
    expect((await repo.getPerson(juan))?.login_email).toBe("juan@example.com");

    const again = await startGeneralEmailAccess(repo, { email: "juan@example.com", termsAccepted: true }, deps(otp, "ip-3"));
    if (!again.ok) throw new Error(again.error);
    await confirmGeneralEmailCode(repo, again.challengeToken, { code: DEMO_EMAIL_OTP_CODE }, deps(otp, "ip-3"));
    const matched = await confirmGeneralCedula(repo, again.challengeToken, { cedula: JUAN, codigoDactilar: "v 1234-v1234" }, deps(otp, "ip-3"));
    expect(matched).toMatchObject({ ok: true, destination: "form" });
    expect(repo.auditLog.filter((entry) => entry.action === "PERSON_AUTO_LINKED" && entry.metadata?.match === "dactilar_match")).toHaveLength(0);
  });

  it("si ya está vinculada a otra cuenta, pide hablar con el administrador", async () => {
    const repo = new MemoryRepo();
    const juan = repo.addPerson("Juan", "Pérez", JUAN);
    await signIn(repo, { email: "juan@example.com", cedula: JUAN });
    const otp = fakeOtp();
    const other = await startGeneralEmailAccess(repo, { email: "intruso@example.com", termsAccepted: true }, deps(otp, "ip-9"));
    if (!other.ok) throw new Error(other.error);
    await confirmGeneralEmailCode(repo, other.challengeToken, { code: DEMO_EMAIL_OTP_CODE }, deps(otp, "ip-9"));
    const cedula = await confirmGeneralCedula(repo, other.challengeToken, { cedula: JUAN, codigoDactilar: CODE }, deps(otp, "ip-9"));
    expect(cedula.ok).toBe(false);
    if (!cedula.ok) {
      expect(cedula.error).toContain("j***@example.com");
      expect(cedula.error).toContain("administrador");
    }
    expect((await repo.getPerson(juan))?.login_email).toBe("juan@example.com");
  });

  it("un correo de la lista con una cédula que ya existe vincula esa ficha y no duplica", async () => {
    const repo = new MemoryRepo();
    const juan = repo.addPerson("Juan", "Pérez", JUAN);
    repo.preloadedContacts.push({ email: "lista@example.com", phone: "+593991112233", firstNames: "Lista", lastNames: "Nueva", comunidad: null });
    const confirmed = await signIn(repo, { email: "lista@example.com", cedula: JUAN });
    expect(confirmed.destination).toBe("form");
    expect(repo.people.size).toBe(1);
    expect((await repo.getPerson(juan))?.login_email).toBe("lista@example.com");
    expect((await repo.getPerson(juan))?.first_names).toBe("Juan");
    expect(repo.auditLog.find((entry) => entry.action === "PERSON_AUTO_LINKED")?.metadata).toMatchObject({ match: "dactilar_first_use" });
    expect(() => repo.addPerson("Otra", "Persona", JUAN)).toThrow(RepoError);
  });

  it("un correo de la lista sin ficha crea la persona con el nombre precargado", async () => {
    const repo = new MemoryRepo();
    repo.preloadedContacts.push({ email: "lista@example.com", phone: "+593991112233", firstNames: "Lista", lastNames: "Nueva", comunidad: null });
    const confirmed = await signIn(repo, { email: "lista@example.com", cedula: ANA });
    expect(confirmed.destination).toBe("form");
    const person = [...repo.people.values()].find((item) => item.national_id_hash === keyedHash(ANA, "national_id"));
    expect(person).toMatchObject({ first_names: "Lista", last_names: "Nueva", login_email: "lista@example.com", self_registered_at: null, outreach_phone: "+593991112233" });
    expect(repo.auditLog.find((entry) => entry.action === "PERSON_AUTO_LINKED")?.metadata).toMatchObject({ match: "preload" });
  });

  it("sin ficha ni lista crea una persona nueva, pendiente, y no saluda con Sin", async () => {
    const repo = new MemoryRepo();
    const confirmed = await signIn(repo, { email: "nadie@example.com", cedula: ANA });
    expect(confirmed.destination).toBe("form");
    const [account] = selfAccounts(repo);
    expect(account).toMatchObject({
      national_id_hash: keyedHash(ANA, "national_id"),
      login_email: "nadie@example.com",
      first_names: "Sin nombre",
      status: "STARTED",
    });
    expect(account?.self_registered_at).toBeTruthy();
    const home = composeInsuredHome((await repo.getInsuredRecord(account!.id))!, null);
    expect(home.pendingLink).toBe(false);
    expect(home.editable).toBe(true);
    expect(insuredGreeting(home.firstNames)).toBe("Hola");
    expect(insuredGreeting("Juan Carlos")).toBe("Hola, Juan");
    expect(repo.auditLog.find((entry) => entry.action === "PERSON_AUTO_LINKED")?.metadata).toMatchObject({ match: "new" });
    const ctx = await getRespondentContext(repo, confirmed.sessionToken);
    expect(ctx?.person.id).toBe(account!.id);
    const submitted = await submitResponse(repo, confirmed.sessionToken, validSubmission(), {
      activeNoticeVersion: "1.0",
      consentTexts: { PRIVACY_NOTICE: "a", DATA_SHARING_AIG: "b", ACCURACY_DECLARATION: "c", BANK_ACCOUNT_AUTHORIZATION: "d" },
      retentionMonths: 12,
      portalBlocked: false,
    });
    expect(submitted.ok).toBe(true);
    expect(Object.values(await repo.statusCounts()).reduce((a, b) => a + b, 0)).toBe(0);
    await signIn(repo, { email: "nadie@example.com", cedula: ANA }, fakeOtp(), "ip-2");
    expect(selfAccounts(repo)).toHaveLength(1);
  });

  it("el correo importado sigue eligiendo la ficha, y dos fichas con el mismo correo se separan por la cédula", async () => {
    const repo = new MemoryRepo();
    const juan = repo.addPerson("Juan", "Pérez", JUAN);
    repo.outreachEmails.set(juan, "juan@example.com");
    expect((await signIn(repo, { email: "Juan@Example.com", cedula: JUAN })).destination).toBe("form");
    expect((await repo.getPerson(juan))?.login_email).toBe("juan@example.com");

    const repo2 = new MemoryRepo();
    let juanId = "";
    for (const [name, id] of [["Juan", JUAN], ["Ana", ANA]] as const) {
      const personId = repo2.addPerson(name, "X", id);
      if (id === JUAN) juanId = personId;
      repo2.outreachEmails.set(personId, "familia@example.com");
    }
    expect((await signIn(repo2, { email: "familia@example.com", cedula: JUAN })).destination).toBe("form");
    expect((await repo2.getPerson(juanId))?.login_email).toBe("familia@example.com");
    expect(selfAccounts(repo2)).toHaveLength(0);
  });

  it("no inserta otra persona si la cédula ya quedó en la cuenta propia", async () => {
    const repo = new MemoryRepo();
    await signIn(repo, { email: "tarde@example.com", cedula: JUAN });
    expect([...repo.people.values()][0]?.login_email).toBe("tarde@example.com");
    expect(() => repo.addPerson("Juan", "Pérez", JUAN)).toThrow(RepoError);
    try {
      repo.addPerson("Juan", "Pérez", JUAN);
    } catch (error) {
      expect(error).toBeInstanceOf(RepoError);
      expect((error as RepoError).pgCode).toBe("23505");
    }
  });

  it("una cédula distinta de la que ya tiene el correo se rechaza y, al quinto fallo, dice cuánto esperar", async () => {
    const repo = new MemoryRepo();
    const juan = repo.addPerson("Juan", "Pérez", JUAN);
    repo.outreachEmails.set(juan, "juan@example.com");
    repo.addPerson("Ana", "Gómez", ANA);
    await signIn(repo, { email: "juan@example.com", cedula: JUAN });
    const otp = fakeOtp();
    const started = await startGeneralEmailAccess(repo, { email: "juan@example.com", termsAccepted: true }, deps(otp, "ip-2"));
    if (!started.ok) throw new Error(started.error);
    await confirmGeneralEmailCode(repo, started.challengeToken, { code: DEMO_EMAIL_OTP_CODE }, deps(otp, "ip-2"));
    const wrong = await confirmGeneralCedula(repo, started.challengeToken, { cedula: ANA, codigoDactilar: CODE }, deps(otp, "ip-2"));
    expect(wrong).toMatchObject({ ok: false, error: WRONG_CEDULA_ERROR });

    for (let attempt = 2; attempt < settings.generalLockThreshold; attempt += 1) {
      await confirmGeneralCedula(repo, started.challengeToken, { cedula: ANA, codigoDactilar: CODE }, deps(otp, `ip-lock-${attempt}`));
    }
    const locked = await confirmGeneralCedula(repo, started.challengeToken, { cedula: ANA, codigoDactilar: CODE }, deps(otp, "ip-lock-final"));
    expect(locked).toMatchObject({ ok: false, error: lockoutError(settings.generalLockMinutes) });
    expect((await repo.getPerson(juan))?.login_email).toBe("juan@example.com");
  });
});

describe("vínculo desde el panel", () => {
  it("sigue disponible para una cuenta que nunca escribió la cédula", async () => {
    const repo = new MemoryRepo();
    const juan = repo.addPerson("Juan", "Pérez", JUAN);
    const ana = repo.addPerson("Ana", "Gómez", ANA);
    repo.outreachEmails.set(ana, "ana@example.com");
    await signIn(repo, { email: "ana@example.com", cedula: ANA });
    const pending = await repo.ensurePendingSelfAccount("juan.nuevo@example.com");
    const row = repo.people.get(pending!.id);
    if (row) row.login_email = "juan.nuevo@example.com";
    const auth = repo.generalAuth.get(pending!.id);
    if (auth) auth.auth_user_id = "auth-juan.nuevo@example.com";
    await repo.setLinkRequest(pending!.id, {
      national_id_hash: keyedHash(JUAN, "national_id"),
      national_id_encrypted: "enc",
      national_id_last2: "65",
    });

    expect(await repo.linkSelfAccount(pending!.id, ana, "admin-1")).toBe("person_bound");
    expect(await repo.linkSelfAccount(pending!.id, juan, "admin-1")).toBe("linked");
    expect((await repo.getPerson(juan))?.login_email).toBe("juan.nuevo@example.com");
    expect(repo.generalAuth.get(juan)?.auth_user_id).toBe("auth-juan.nuevo@example.com");
    expect(repo.people.has(pending!.id)).toBe(false);
    expect(repo.auditLog.some((entry) => entry.action === "ACCOUNT_LINKED" && entry.person_id === juan)).toBe(true);
  });

  it("el servicio del panel no pisa un correo verificado", async () => {
    const repo = new MemoryRepo();
    const ana = repo.addPerson("Ana", "Gómez", ANA);
    repo.outreachEmails.set(ana, "ana@example.com");
    await signIn(repo, { email: "ana@example.com", cedula: ANA });
    const barePerson = await repo.ensurePendingSelfAccount("sin.cedula@example.com");
    const bareRow = repo.people.get(barePerson!.id);
    if (bareRow) bareRow.login_email = "sin.cedula@example.com";

    expect(await linkUnlinkedAccount(repo, { accountId: "x", adminId: "admin-1" })).toMatchObject({ ok: false });
    expect(await linkUnlinkedAccount(repo, { accountId: barePerson!.id, adminId: "admin-1" })).toMatchObject({ ok: false, error: /no escribió su cédula/ });
    expect(await linkUnlinkedAccount(repo, { accountId: barePerson!.id, cedula: "1234567890", adminId: "admin-1" })).toMatchObject({ ok: false, error: /Revisa la cédula/ });
    expect(await linkUnlinkedAccount(repo, { accountId: barePerson!.id, cedula: ANA, adminId: "admin-1" })).toMatchObject({ ok: false, error: /otro correo verificado/ });
  });
});
