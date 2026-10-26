import { describe, expect, it } from "vitest";
import { randomToken, sha256 } from "@/lib/encryption/crypto";
import { MemoryRepo } from "@/lib/database/memory-repo";
import { CONSENT_TEXTS } from "@/lib/privacy/notice";
import { submitResponse, type SubmitDeps } from "@/lib/services/respondent";
import { describeFieldErrors } from "@/lib/services/submit-errors";
import { validSubmission } from "./helpers/fixtures";

const JUAN = "1710034065";
const submitDeps: SubmitDeps = {
  activeNoticeVersion: "1.0",
  consentTexts: { ...CONSENT_TEXTS },
  retentionMonths: 60,
  portalBlocked: false,
};

function observedContact(primary = "a.perez@fmsnor.org") {
  return {
    primaryEmail: primary,
    secondaryEmail: "secundario@hotmail.com",
    phoneCountryCode: "+593",
    phoneNumber: "0991234567",
    addressLine1: "Leonardo Vigagomez, S/N, Daniel Brito",
    addressLine2: "Garage Negro",
    city: "Quito",
    province: "Pichincha",
    country: "Ecuador",
    postalCode: "593",
  };
}

async function generalSession(repo: MemoryRepo, personId: string) {
  const sessionToken = randomToken();
  await repo.createRespondentSession({
    session_hash: sha256(sessionToken),
    person_id: personId,
    access_token_id: null,
    entry_method: "general",
    expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
  });
  return sessionToken;
}

describe("envío desde la revisión", () => {
  it("una persona vinculada por el administrador envía aunque el formulario todavía mande Confirmar correo", async () => {
    const repo = new MemoryRepo();
    const personId = repo.addPerson("Juan Carlos", "Pérez López", JUAN);
    const person = repo.people.get(personId)!;
    person.login_email = "a.perez@fmsnor.org";
    repo.outreachEmails.set(personId, "otro.correo@fmsnor.org");
    const sessionToken = await generalSession(repo, personId);
    const payload = {
      ...validSubmission(),
      contact: { ...observedContact(), primaryEmailConfirm: "a.perez@fmsnor.org" },
    };

    const result = await submitResponse(repo, sessionToken, payload, submitDeps);

    expect(result.ok).toBe(true);
    expect(repo.submissions.get(personId)?.contact.primary_email).toBe("a.perez@fmsnor.org");
    expect(repo.submissions.get(personId)?.contact.secondary_email).toBe("secundario@hotmail.com");
    expect(JSON.stringify(repo.securityEvents)).not.toContain("a.perez@fmsnor.org");
    expect(JSON.stringify(repo.securityEvents)).not.toContain("secundario@hotmail.com");
  });

  it("un envío rechazado queda en security_events solo con las claves y los códigos", async () => {
    const repo = new MemoryRepo();
    const personId = repo.addPerson("Juan Carlos", "Pérez López", JUAN);
    const sessionToken = await generalSession(repo, personId);
    const payload = validSubmission({
      contact: { ...observedContact("a.perez@fmsnor.org"), postalCode: "59.3" },
    });

    const result = await submitResponse(repo, sessionToken, payload, submitDeps);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fieldErrors?.["contact.postalCode"]).toBeTruthy();
    const event = repo.securityEvents.find((entry) => entry.event_type === "FORM_SUBMIT_REJECTED");
    expect(event?.detail).toMatchObject({ keys: ["contact.postalCode"] });
    expect(JSON.stringify(event)).not.toContain("a.perez@fmsnor.org");
    expect(JSON.stringify(event)).not.toContain("59.3");
    expect(JSON.stringify(event?.detail?.codes)).toContain("invalid_format");
  });

  it("una clave desconocida se puede leer en español y no desaparece del aviso", () => {
    const items = describeFieldErrors({ contact: 'Unrecognized key: "primaryEmailConfirm"' });
    expect(items).toEqual([
      expect.objectContaining({
        id: "contact",
        step: 3,
        label: "Contacto",
      }),
    ]);
    expect(items[0]?.message).toMatch(/correo/);
    expect(items[0]?.message).not.toMatch(/Unrecognized/);
  });
});
