import { describe, expect, it, vi } from "vitest";
import { MemoryRepo } from "@/lib/database/memory-repo";
import { keyedHash } from "@/lib/encryption/crypto";
import { demoEmailOtpProvider, DEMO_EMAIL_OTP_CODE, type EmailOtpProvider } from "@/lib/services/email-otp";
import { linkUnlinkedAccount } from "@/lib/services/account-link";
import { confirmGeneralCedula, confirmGeneralEmailCode, startGeneralEmailAccess, type GeneralEmailDeps } from "@/lib/services/general-email";
import { composeInsuredHome } from "@/lib/services/insured-home";
import { getRespondentContext, submitResponse } from "@/lib/services/respondent";
import { GENERIC_GENERAL_ERROR } from "@/lib/validation/constants";
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
  const confirmed = await confirmGeneralCedula(repo, started.challengeToken, { cedula: input.cedula, codigoDactilar: input.codigoDactilar ?? "" }, deps(otp, ip));
  if (!confirmed.ok) throw new Error(confirmed.error);
  return confirmed;
}

const selfAccounts = (repo: MemoryRepo) => [...repo.people.values()].filter((p) => p.self_registered_at);

describe("ingreso solo con correo", () => {
  it("un correo nuevo crea una cuenta propia sin cédula, que no puede llenar el formulario", async () => {
    const repo = new MemoryRepo();
    const imported = repo.addPerson("Juan", "Pérez", JUAN);
    const confirmed = await signIn(repo, { email: "nadie@example.com", cedula: JUAN });
    expect(confirmed.destination).toBe("home");

    const [account] = selfAccounts(repo);
    expect(account).toMatchObject({ national_id_hash: null, national_id_encrypted: null, login_email: "nadie@example.com" });
    expect(repo.auditLog.some((e) => e.action === "ACCOUNT_CREATED" && e.person_id === account!.id)).toBe(true);
    expect((await repo.getPerson(imported))?.login_email).toBeFalsy();

    const ctx = await getRespondentContext(repo, confirmed.sessionToken, { allowSubmitted: true });
    expect(ctx?.person.id).toBe(account!.id);
    expect(await getRespondentContext(repo, confirmed.sessionToken)).toBeNull();
    const home = composeInsuredHome((await repo.getInsuredRecord(account!.id))!, null);
    expect(home).toMatchObject({ editable: false, pendingLink: true });
    expect(home.notifications[0]!.id).toBe("pending-link");

    const submitted = await submitResponse(repo, confirmed.sessionToken, validSubmission(), {
      activeNoticeVersion: "1.0",
      consentTexts: { PRIVACY_NOTICE: "a", DATA_SHARING_AIG: "b", ACCURACY_DECLARATION: "c", BANK_ACCOUNT_AUTHORIZATION: "d" },
      retentionMonths: 12,
      portalBlocked: false,
    });
    expect(submitted.ok).toBe(false);

    // Las cuentas propias no cuentan en el tablero ni salen en la lista de personas.
    expect(Object.values(await repo.statusCounts()).reduce((a, b) => a + b, 0)).toBe(1);
    expect((await repo.listPeople({ page: 1, pageSize: 50 })).total).toBe(1);
    // Volver a entrar reutiliza la misma cuenta.
    await signIn(repo, { email: "nadie@example.com", cedula: JUAN }, fakeOtp(), "ip-2");
    expect(selfAccounts(repo)).toHaveLength(1);
  });

  it("vincula solo cuando el correo importado coincide con una única persona", async () => {
    const repo = new MemoryRepo();
    const juan = repo.addPerson("Juan", "Pérez", JUAN);
    repo.outreachEmails.set(juan, "juan@example.com");
    const confirmed = await signIn(repo, { email: "Juan@Example.com", cedula: JUAN });
    expect(confirmed.destination).toBe("form");
    expect((await repo.getPerson(juan))?.login_email).toBe("juan@example.com");
    expect(selfAccounts(repo)).toHaveLength(0);

    // El mismo correo en dos fichas no se adivina por el correo. La cédula elige a la persona.
    const repo2 = new MemoryRepo();
    let juanId = "";
    for (const [name, id] of [["Juan", JUAN], ["Ana", ANA]] as const) {
      const personId = repo2.addPerson(name, "X", id);
      if (id === JUAN) juanId = personId;
      repo2.outreachEmails.set(personId, "familia@example.com");
    }
    const chosen = await signIn(repo2, { email: "familia@example.com", cedula: JUAN });
    expect(chosen.destination).toBe("form");
    expect(selfAccounts(repo2)).toHaveLength(0);
    expect((await repo2.getPerson(juanId))?.login_email).toBe("familia@example.com");
  });

  it("una cuenta propia se vincula sola cuando después importan a la persona con ese correo", async () => {
    const repo = new MemoryRepo();
    await signIn(repo, { email: "tarde@example.com", cedula: JUAN });
    const [account] = selfAccounts(repo);
    const juan = repo.addPerson("Juan", "Pérez", JUAN);
    repo.outreachEmails.set(juan, "tarde@example.com");

    const again = await signIn(repo, { email: "tarde@example.com", cedula: JUAN }, fakeOtp(), "ip-2");
    expect(again.destination).toBe("form");
    expect((await repo.getPerson(juan))?.login_email).toBe("tarde@example.com");
    expect(repo.generalAuth.get(juan)?.auth_user_id).toBe("auth-tarde@example.com");
    expect(repo.people.has(account!.id)).toBe(false);
  });
});

describe("cédula escrita sin vínculo automático", () => {
  it("no asigna la cédula: queda como solicitud y el código dactilar no se reclama", async () => {
    const repo = new MemoryRepo();
    const juan = repo.addPerson("Juan", "Pérez", JUAN);
    const otp = fakeOtp();
    const started = await startGeneralEmailAccess(repo, { email: "alguien@example.com", termsAccepted: true }, deps(otp));
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    await confirmGeneralEmailCode(repo, started.challengeToken, { code: DEMO_EMAIL_OTP_CODE }, deps(otp));
    await confirmGeneralCedula(repo, started.challengeToken, { cedula: JUAN, codigoDactilar: CODE }, deps(otp));

    expect((await repo.getPerson(juan))?.login_email).toBeFalsy();
    expect(repo.generalAuth.get(juan)?.fingerprint_code_hash ?? null).toBeNull();
    const [row] = await repo.listUnlinkedAccounts(10);
    expect(row).toMatchObject({ login_email: "alguien@example.com", link_request_national_id_last2: "65", link_request_national_id_hash: keyedHash(JUAN, "national_id") });
    expect(repo.auditLog.some((e) => e.action === "ACCOUNT_LINK_REQUESTED")).toBe(true);
    // Nada de la cédula ni del correo en la auditoría.
    const dumped = JSON.stringify({ audit: repo.auditLog, security: repo.securityEvents });
    expect(dumped).not.toContain(JUAN);
    expect(dumped).not.toContain("alguien@example.com");
  });

  it("una cédula que no está en la base responde igual (no revela si existe)", async () => {
    const repo = new MemoryRepo();
    repo.addPerson("Juan", "Pérez", JUAN);
    const otp = fakeOtp();
    const knownStart = await startGeneralEmailAccess(repo, { email: "a@example.com", termsAccepted: true }, deps(otp));
    const unknownStart = await startGeneralEmailAccess(repo, { email: "b@example.com", termsAccepted: true }, deps(otp, "ip-2"));
    expect(knownStart.ok && unknownStart.ok).toBe(true);
    if (!knownStart.ok || !unknownStart.ok) return;
    await confirmGeneralEmailCode(repo, knownStart.challengeToken, { code: DEMO_EMAIL_OTP_CODE }, deps(otp));
    await confirmGeneralEmailCode(repo, unknownStart.challengeToken, { code: DEMO_EMAIL_OTP_CODE }, deps(otp, "ip-2"));
    const known = await confirmGeneralCedula(repo, knownStart.challengeToken, { cedula: JUAN }, deps(otp));
    const unknown = await confirmGeneralCedula(repo, unknownStart.challengeToken, { cedula: ANA }, deps(otp, "ip-2"));
    expect(known.ok && unknown.ok).toBe(true);
    if (known.ok && unknown.ok) expect(Object.keys(known).sort()).toEqual(Object.keys(unknown).sort());
  });

  it("KAN-148: la cédula ya vinculada sigue atada a su correo aunque se entre por correo", async () => {
    const repo = new MemoryRepo();
    const juan = repo.addPerson("Juan", "Pérez", JUAN);
    repo.outreachEmails.set(juan, "juan@example.com");
    await signIn(repo, { email: "juan@example.com", cedula: JUAN });
    const otp = fakeOtp();
    const other = await startGeneralEmailAccess(repo, { email: "intruso@example.com", termsAccepted: true }, deps(otp, "ip-9"));
    expect(other.ok).toBe(true);
    if (!other.ok) return;
    await confirmGeneralEmailCode(repo, other.challengeToken, { code: DEMO_EMAIL_OTP_CODE }, deps(otp, "ip-9"));
    const cedula = await confirmGeneralCedula(repo, other.challengeToken, { cedula: JUAN }, deps(otp, "ip-9"));
    expect(cedula.ok).toBe(false);
    if (!cedula.ok) expect(cedula.error).toContain("Esta cédula ya ingresó con otro correo");
    expect((await repo.getPerson(juan))?.login_email).toBe("juan@example.com");
    expect(selfAccounts(repo).every((account) => !account.login_email && !account.national_id_hash)).toBe(true);
  });

  it("si el correo ya es de otra cédula, no se mezcla", async () => {
    const repo = new MemoryRepo();
    const juan = repo.addPerson("Juan", "Pérez", JUAN);
    repo.outreachEmails.set(juan, "juan@example.com");
    repo.addPerson("Ana", "Gómez", ANA);
    await signIn(repo, { email: "juan@example.com", cedula: JUAN });
    const otp = fakeOtp();
    const started = await startGeneralEmailAccess(repo, { email: "juan@example.com", termsAccepted: true }, deps(otp, "ip-2"));
    if (!started.ok) throw new Error(started.error);
    await confirmGeneralEmailCode(repo, started.challengeToken, { code: DEMO_EMAIL_OTP_CODE }, deps(otp, "ip-2"));
    const result = await confirmGeneralCedula(repo, started.challengeToken, { cedula: ANA }, deps(otp, "ip-2"));
    expect(result).toMatchObject({ ok: false, error: GENERIC_GENERAL_ERROR });
  });
});

describe("vínculo desde el panel", () => {
  it("vincula la cuenta propia con la persona, mueve su historial y respeta KAN-148", async () => {
    const repo = new MemoryRepo();
    const juan = repo.addPerson("Juan", "Pérez", JUAN);
    const ana = repo.addPerson("Ana", "Gómez", ANA);
    repo.outreachEmails.set(ana, "ana@example.com");
    await signIn(repo, { email: "ana@example.com", cedula: ANA });
    await signIn(repo, { email: "juan.nuevo@example.com", cedula: JUAN }, fakeOtp(), "ip-2");
    const [account] = await repo.listUnlinkedAccounts(10);

    expect(await repo.linkSelfAccount(account!.id, ana, "admin-1")).toBe("person_bound");
    expect(await repo.linkSelfAccount(account!.id, juan, "admin-1")).toBe("linked");
    expect((await repo.getPerson(juan))?.login_email).toBe("juan.nuevo@example.com");
    expect(repo.generalAuth.get(juan)?.auth_user_id).toBe("auth-juan.nuevo@example.com");
    expect(repo.people.has(account!.id)).toBe(false);
    expect(repo.auditLog.some((e) => e.action === "ACCOUNT_LINKED" && e.person_id === juan)).toBe(true);
    expect(await repo.listUnlinkedAccounts(10)).toHaveLength(0);

    // Después del vínculo entra con su correo directo al formulario.
    expect((await signIn(repo, { email: "juan.nuevo@example.com", cedula: JUAN }, fakeOtp(), "ip-3")).destination).toBe("form");
  });

  it("el servicio del panel usa la cédula pedida o la escrita, y no pisa un correo verificado", async () => {
    const repo = new MemoryRepo();
    const juan = repo.addPerson("Juan", "Pérez", JUAN);
    const ana = repo.addPerson("Ana", "Gómez", ANA);
    repo.outreachEmails.set(ana, "ana@example.com");
    await signIn(repo, { email: "ana@example.com", cedula: ANA });
    const barePerson = await repo.ensurePendingSelfAccount("sin.cedula@example.com");
    const bareRow = repo.people.get(barePerson!.id);
    if (bareRow) bareRow.login_email = "sin.cedula@example.com";
    await signIn(repo, { email: "con.cedula@example.com", cedula: JUAN }, fakeOtp(), "ip-3");
    const rows = await repo.listUnlinkedAccounts(10);
    const bare = rows.find((r) => r.login_email === "sin.cedula@example.com")!;
    const asked = rows.find((r) => r.login_email === "con.cedula@example.com")!;

    expect(await linkUnlinkedAccount(repo, { accountId: "x", adminId: "admin-1" })).toMatchObject({ ok: false });
    expect(await linkUnlinkedAccount(repo, { accountId: bare.id, adminId: "admin-1" })).toMatchObject({ ok: false, error: /no escribió su cédula/ });
    expect(await linkUnlinkedAccount(repo, { accountId: bare.id, cedula: "1234567890", adminId: "admin-1" })).toMatchObject({ ok: false, error: /Revisa la cédula/ });
    expect(await linkUnlinkedAccount(repo, { accountId: bare.id, cedula: ANA, adminId: "admin-1" })).toMatchObject({ ok: false, error: /otro correo verificado/ });
    expect(await linkUnlinkedAccount(repo, { accountId: asked.id, adminId: "admin-1" })).toEqual({ ok: true });
    expect((await repo.getPerson(juan))?.login_email).toBe("con.cedula@example.com");
    expect(await linkUnlinkedAccount(repo, { accountId: asked.id, adminId: "admin-1" })).toMatchObject({ ok: false });
  });
});
