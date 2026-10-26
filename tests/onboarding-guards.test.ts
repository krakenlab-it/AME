import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { randomToken, sha256 } from "@/lib/encryption/crypto";
import { MemoryRepo } from "@/lib/database/memory-repo";
import { CONSENT_TEXTS } from "@/lib/privacy/notice";
import { startGeneralEmailAccess, type GeneralEmailDeps } from "@/lib/services/general-email";
import { demoEmailOtpProvider } from "@/lib/services/email-otp";
import { sanitizeImportedName } from "@/lib/services/import";
import { submitResponse, type SubmitDeps } from "@/lib/services/respondent";
import { holderNamePrefill, registeredNamesNeedEdit, sessionFollowUp, wizardStepFromQuery } from "@/lib/services/submit-errors";
import { settings } from "@/lib/services/settings";
import { validSubmission } from "./helpers/fixtures";

const submitDeps: SubmitDeps = {
  activeNoticeVersion: "1.0",
  consentTexts: { ...CONSENT_TEXTS },
  retentionMonths: 60,
  portalBlocked: false,
};

describe("guardas del ingreso y del formulario", () => {
  it("el paso de la URL solo acepta 2 a 6", () => {
    expect(wizardStepFromQuery(null)).toBe(2);
    expect(wizardStepFromQuery("no")).toBe(2);
    expect(wizardStepFromQuery("1")).toBe(2);
    expect(wizardStepFromQuery("99")).toBe(2);
    expect(wizardStepFromQuery("4")).toBe(4);
    expect(wizardStepFromQuery("6")).toBe(6);
  });

  it("el texto de sesión distingue correo y enlace personal", () => {
    expect(sessionFollowUp("general")).toContain("/ingresar");
    expect(sessionFollowUp("general")).not.toContain("enlace personal");
    expect(sessionFollowUp("token")).toContain("enlace personal");
    expect(sessionFollowUp(undefined)).toContain("/ingresar");
    expect(sessionFollowUp(undefined)).toContain("enlace personal");
  });

  it("un nombre que el formulario no acepta se corrige en la lista de correos, igual que en la cédula", () => {
    expect(sanitizeImportedName("O\u2019Brien", "Sin nombre")).toBe("Sin nombre");
    expect(sanitizeImportedName("Juan 2", "Sin nombre")).toBe("Sin nombre");
    expect(sanitizeImportedName("Lucía Isabel", "Sin nombre")).toBe("Lucía Isabel");
    expect(registeredNamesNeedEdit("O\u2019Brien", "Paz")).toBe(true);
    expect(registeredNamesNeedEdit("Lucía Isabel", "Romero Calle")).toBe(false);
  });

  it("el titular precargado no pasa de 80 caracteres", () => {
    expect(holderNamePrefill("Ana", "Paz")).toBe("Ana Paz");
    const long = holderNamePrefill("A".repeat(50), "B".repeat(50));
    expect(long.length).toBeLessThanOrEqual(80);
    expect(long.endsWith(" ")).toBe(false);
  });

  it("el resumen cuenta a quien se registró solo si ya tiene cédula", async () => {
    const repo = new MemoryRepo();
    const bare = await repo.ensurePendingSelfAccount("solo.correo@example.com");
    const withId = repo.addPerson("Ana", "Paz", "0926687856");
    const row = repo.people.get(withId)!;
    row.self_registered_at = new Date().toISOString();
    expect((await repo.listPeople({ page: 1, pageSize: 20 })).total).toBe(1);
    expect(await repo.statusCounts()).toMatchObject({ PENDING: 1 });
    expect(repo.people.get(bare!.id)?.national_id_hash ?? null).toBeNull();
  });

  it("la misma IP admite varios correos y un correo solo tiene un tope propio", async () => {
    const otp = demoEmailOtpProvider();
    const deps = (ip: string): GeneralEmailDeps => ({ ipHash: ip, captchaEnabled: false, verifyCaptcha: async () => true, otp });
    const repo = new MemoryRepo();
    for (let i = 0; i < settings.generalIdentifyLimitPerEmail; i += 1) {
      await repo.rateLimitHit(`general-email-id:una@example.com`, settings.generalIdentifyLimitPerEmail, settings.generalIdentifyWindowSeconds);
    }
    const blockedEmail = await startGeneralEmailAccess(repo, { email: "una@example.com", termsAccepted: true }, deps("ip-extra"));
    expect(blockedEmail).toMatchObject({ ok: false });
    const otherEmail = await startGeneralEmailAccess(repo, { email: "otra.persona@example.com", termsAccepted: true }, deps("ip-extra-2"));
    expect(otherEmail.ok).toBe(true);

    const repoIp = new MemoryRepo();
    for (let i = 0; i < settings.generalIdentifyLimitPerIp; i += 1) {
      const ok = await startGeneralEmailAccess(repoIp, { email: `p${i}@example.com`, termsAccepted: true }, deps("oficina"));
      expect(ok.ok).toBe(true);
    }
    const blockedIp = await startGeneralEmailAccess(repoIp, { email: "fuera@example.com", termsAccepted: true }, deps("oficina"));
    expect(blockedIp).toMatchObject({ ok: false });
  });

  it("el cliente actual, sin confirmar correo, sigue pudiendo enviar", async () => {
    const repo = new MemoryRepo();
    const personId = repo.addPerson("Juan Carlos", "Pérez López", "1710034065");
    const sessionToken = randomToken();
    await repo.createRespondentSession({
      session_hash: sha256(sessionToken),
      person_id: personId,
      access_token_id: null,
      entry_method: "general",
      expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
    });
    const result = await submitResponse(repo, sessionToken, validSubmission(), submitDeps);
    expect(result.ok).toBe(true);
  });

  it("cada clave de error del formulario tiene un id en la pantalla", () => {
    const wizard = readFileSync("components/forms/update-wizard.tsx", "utf8");
    const ids = [
      "names.namesConfirmed",
      "names.firstNames",
      "names.lastNames",
      "contact.primaryEmail",
      "contact.secondaryEmail",
      "contact.phoneCountryCode",
      "contact.phoneNumber",
      "contact.addressLine1",
      "contact.addressLine2",
      "contact.city",
      "contact.province",
      "contact.country",
      "contact.postalCode",
      "bank.bankName",
      "bank.bankOtherName",
      "bank.accountType",
      "bank.accountNumber",
      "bank.accountNumberConfirm",
      "bank.accountHolderName",
      "bank.ownershipDeclared",
      "consents.privacyAccepted",
      "consents.sharingAccepted",
      "consents.accuracyDeclared",
    ];
    for (const id of ids) expect(wizard).toContain(`id="${id}"`);
  });
});
