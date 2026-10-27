import { describe, expect, it, vi } from "vitest";
import { MemoryRepo } from "@/lib/database/memory-repo";
import type { ExportSourceRow } from "@/lib/database/types";
import { encrypt, keyedHash } from "@/lib/encryption/crypto";
import { demoEmailOtpProvider, DEMO_EMAIL_OTP_CODE, type EmailOtpProvider } from "@/lib/services/email-otp";
import {
  confirmGeneralCedula,
  confirmGeneralEmailCode,
  PASSPORT_NOT_REGISTERED_ERROR,
  startGeneralEmailAccess,
  WRONG_FINGERPRINT_ERROR,
  WRONG_PASSPORT_ERROR,
  type GeneralEmailDeps,
} from "@/lib/services/general-email";
import { buildExportTable } from "@/lib/services/export";
import { getRespondentContext, registeredView, submitResponse } from "@/lib/services/respondent";
import { validSubmission } from "./helpers/fixtures";

const PASSPORT = "BH823158";
const OTHER_PASSPORT = "BA086520";
const JUAN = "1710034065";
const CODE = "V1234V1234";

function fakeOtp(): EmailOtpProvider {
  const demo = demoEmailOtpProvider();
  return {
    send: vi.fn(demo.send),
    verify: vi.fn(async (email: string, code: string) => {
      const result = await demo.verify(email, code);
      return result.ok ? { ...result, authUserId: `auth-${email}` } : result;
    }),
  };
}

function deps(otp: EmailOtpProvider, ip: string): GeneralEmailDeps {
  return { ipHash: `hash-${ip}`, captchaEnabled: false, verifyCaptcha: async () => true, otp };
}

let counter = 0;
async function attempt(repo: MemoryRepo, input: { email: string; cedula: string; codigoDactilar?: string }) {
  counter += 1;
  const ip = `ip-${counter}`;
  const otp = fakeOtp();
  const started = await startGeneralEmailAccess(repo, { email: input.email, termsAccepted: true }, deps(otp, ip));
  if (!started.ok) throw new Error(started.error);
  const coded = await confirmGeneralEmailCode(repo, started.challengeToken, { code: DEMO_EMAIL_OTP_CODE }, deps(otp, ip));
  if (!coded.ok) throw new Error(coded.error);
  return confirmGeneralCedula(repo, started.challengeToken, { cedula: input.cedula, codigoDactilar: input.codigoDactilar ?? CODE }, deps(otp, ip));
}

const selfAccounts = (repo: MemoryRepo) => [...repo.people.values()].filter((person) => person.self_registered_at);
const SUBMIT_DEPS = {
  activeNoticeVersion: "1.0",
  consentTexts: { PRIVACY_NOTICE: "a", DATA_SHARING_AIG: "b", ACCURACY_DECLARATION: "c", BANK_ACCOUNT_AUTHORIZATION: "d" },
  retentionMonths: 12,
  portalBlocked: false,
} as const;

describe("ingreso general con pasaporte ya importado", () => {
  it("primer ingreso: el dactilar se guarda, el correo se vincula, hay auditoría y no se crea otra cuenta", async () => {
    const repo = new MemoryRepo();
    const person = repo.addPerson("Ana", "Pérez", PASSPORT);
    const confirmed = await attempt(repo, { email: "ana@example.com", cedula: PASSPORT });
    expect(confirmed).toMatchObject({ ok: true, destination: "form" });
    expect((await repo.getPerson(person))?.login_email).toBe("ana@example.com");
    expect(repo.generalAuth.get(person)?.fingerprint_code_hash).toBe(keyedHash(CODE, "fingerprint_code"));
    expect(selfAccounts(repo)).toHaveLength(0);
    expect(repo.auditLog.find((entry) => entry.action === "PERSON_AUTO_LINKED")).toMatchObject({
      person_id: person,
      masked_cedula: "BH****58",
      metadata: { match: "dactilar_first_use" },
    });
    expect(repo.auditLog.some((entry) => entry.action === "FINGERPRINT_CLAIMED")).toBe(true);
    const alerts = await repo.listAutoLinksSince(new Date(Date.now() - 60_000).toISOString());
    expect(alerts).toEqual([expect.objectContaining({ personId: person, maskedCedula: "BH****58" })]);
    expect(JSON.stringify({ audit: repo.auditLog, security: repo.securityEvents })).not.toContain(PASSPORT);
  });

  it("normaliza mayúsculas, espacios y guiones igual que la importación", async () => {
    const repo = new MemoryRepo();
    const person = repo.addPerson("Ana", "Pérez", PASSPORT);
    const confirmed = await attempt(repo, { email: "ana@example.com", cedula: " bh 823-158 ", codigoDactilar: "v1234 v1234" });
    expect(confirmed.ok).toBe(true);
    expect((await repo.getPerson(person))?.login_email).toBe("ana@example.com");
  });

  it("los ingresos siguientes tienen que usar el mismo dactilar", async () => {
    const repo = new MemoryRepo();
    const person = repo.addPerson("Ana", "Pérez", PASSPORT);
    await attempt(repo, { email: "ana@example.com", cedula: PASSPORT });
    const mismatch = await attempt(repo, { email: "ana@example.com", cedula: PASSPORT, codigoDactilar: "A9876B4321" });
    expect(mismatch).toMatchObject({ ok: false, error: WRONG_FINGERPRINT_ERROR });
    expect(repo.generalAuth.get(person)?.fingerprint_code_hash).toBe(keyedHash(CODE, "fingerprint_code"));
    const matched = await attempt(repo, { email: "ana@example.com", cedula: PASSPORT, codigoDactilar: "v1234-v1234" });
    expect(matched.ok).toBe(true);
    expect(repo.auditLog.filter((entry) => entry.action === "PERSON_AUTO_LINKED")).toHaveLength(1);
  });

  it("un pasaporte reclamado por un correo no se puede tomar con otro correo", async () => {
    const repo = new MemoryRepo();
    const person = repo.addPerson("Ana", "Pérez", PASSPORT);
    await attempt(repo, { email: "ana@example.com", cedula: PASSPORT });
    const taken = await attempt(repo, { email: "intruso@example.com", cedula: PASSPORT });
    expect(taken).toMatchObject({ ok: false, error: expect.stringContaining("pasaporte") });
    if (!taken.ok) expect(taken.error).not.toContain("cédula");
    expect((await repo.getPerson(person))?.login_email).toBe("ana@example.com");
    expect(repo.generalAuth.get(person)?.auth_user_id).toBe("auth-ana@example.com");
  });

  it("un pasaporte que no está en la base se rechaza en español y no crea una cuenta", async () => {
    const repo = new MemoryRepo();
    repo.addPerson("Ana", "Pérez", PASSPORT);
    const before = repo.people.size;
    const unknown = await attempt(repo, { email: "nuevo@example.com", cedula: OTHER_PASSPORT });
    expect(unknown).toEqual(expect.objectContaining({ ok: false, error: PASSPORT_NOT_REGISTERED_ERROR }));
    expect([...repo.people.values()].some((person) => person.national_id_hash === keyedHash(OTHER_PASSPORT, "national_id"))).toBe(false);
    expect(repo.people.size).toBeLessThanOrEqual(before + 1);
    expect(selfAccounts(repo).every((person) => !person.national_id_hash)).toBe(true);
  });

  it("un correo ligado a una cédula no puede entrar con un pasaporte ajeno", async () => {
    const repo = new MemoryRepo();
    repo.addPerson("Ana", "Pérez", PASSPORT);
    const juan = repo.addPerson("Juan", "Pérez", JUAN);
    await attempt(repo, { email: "juan@example.com", cedula: JUAN });
    const result = await attempt(repo, { email: "juan@example.com", cedula: PASSPORT });
    expect(result).toMatchObject({ ok: false, error: WRONG_PASSPORT_ERROR });
    expect((await repo.getPerson(juan))?.login_email).toBe("juan@example.com");
  });

  it("el pasaporte también exige el código dactilar con formato válido", async () => {
    const repo = new MemoryRepo();
    repo.addPerson("Ana", "Pérez", PASSPORT);
    const empty = await attempt(repo, { email: "ana@example.com", cedula: PASSPORT, codigoDactilar: "" });
    expect(empty.ok).toBe(false);
    const short = await attempt(repo, { email: "ana@example.com", cedula: PASSPORT, codigoDactilar: "V123V1234" });
    expect(short.ok).toBe(false);
  });

  it("la cédula sigue igual: un documento mal escrito conserva sus mensajes y una cédula nueva crea cuenta", async () => {
    const repo = new MemoryRepo();
    const short = await attempt(repo, { email: "a@example.com", cedula: "171003406" });
    expect(short).toMatchObject({ ok: false, error: expect.stringContaining("cédula") });
    const bad = await attempt(repo, { email: "a@example.com", cedula: "1710034066" });
    expect(bad).toMatchObject({ ok: false, error: "El número de cédula no es válido. Revisa los dígitos." });
    const created = await attempt(repo, { email: "a@example.com", cedula: JUAN });
    expect(created.ok).toBe(true);
    expect(selfAccounts(repo)).toHaveLength(1);
  });
});

describe("el pasaporte completa todo el recorrido normal de /ingresar", () => {
  it("abre el formulario, muestra el pasaporte, envía y sale en la exportación AIG", async () => {
    const repo = new MemoryRepo();
    const person = repo.addPerson("Ana", "Pérez", PASSPORT);
    const confirmed = await attempt(repo, { email: "ana@example.com", cedula: PASSPORT });
    if (!confirmed.ok) throw new Error(confirmed.error);
    const ctx = await getRespondentContext(repo, confirmed.sessionToken);
    expect(ctx?.person.id).toBe(person);
    expect(registeredView(ctx!.person)).toMatchObject({ cedulaMasked: "BH****58", documentLabel: "Pasaporte", email: "ana@example.com" });

    const submitted = await submitResponse(repo, confirmed.sessionToken, validSubmission(), SUBMIT_DEPS);
    expect(submitted.ok).toBe(true);

    const stored = (await repo.getPerson(person))!;
    const row: ExportSourceRow = {
      person_id: person,
      confirmation_code: "AIG-TEST",
      first_names: stored.first_names,
      last_names: stored.last_names,
      national_id_encrypted: stored.national_id_encrypted,
      submitted_at: new Date().toISOString(),
      primary_email: "ana@example.com",
      secondary_email: null,
      mobile_phone: "+593991234567",
      address_line_1: "Calle 1",
      address_line_2: null,
      city: "Quito",
      province: "Pichincha",
      country: "Ecuador",
      postal_code: null,
      bank_name: "Banco Pichincha",
      bank_other_name: null,
      account_type: "Ahorros",
      account_number_encrypted: encrypt("2200004821"),
      account_holder_name: "Ana Pérez",
      account_holder_national_id_encrypted: stored.national_id_encrypted,
      consent_accepted_at: new Date().toISOString(),
      privacy_notice_version: "1.0",
    };
    for (const profile of ["RECLAMOS", "REEMBOLSOS"] as const) {
      const table = buildExportTable([row], profile);
      expect(table.data[0]).toContain(PASSPORT);
      expect(table.data[0]).not.toContain("ERROR_DESCIFRADO");
    }
  });

  it("la cédula mantiene su etiqueta", async () => {
    const repo = new MemoryRepo();
    repo.addPerson("Juan", "Pérez", JUAN);
    const confirmed = await attempt(repo, { email: "juan@example.com", cedula: JUAN });
    if (!confirmed.ok) throw new Error(confirmed.error);
    const ctx = await getRespondentContext(repo, confirmed.sessionToken);
    expect(registeredView(ctx!.person)).toMatchObject({ documentLabel: "Cédula" });
  });
});
