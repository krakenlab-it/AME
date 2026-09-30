import { describe, expect, it } from "vitest";
import { decrypt, encrypt, keyedHash, randomToken, sha256 } from "@/lib/encryption/crypto";
import { isConfirmationCode } from "@/lib/services/confirmation";
import { isValidCedula } from "@/lib/validation/cedula";
import { submissionSchema } from "@/lib/validation/schemas";
import {
  planProductSeed,
  PRODUCT_PERSONAS,
  SEED_PERSON_ID_LIST,
  SEED_PERSON_IDS,
  type SeedPlan,
} from "@/lib/seed/product-personas";

const HASHES = {
  PRIVACY_NOTICE: "a",
  DATA_SHARING_AIG: "b",
  ACCURACY_DECLARATION: "c",
  BANK_ACCOUNT_AUTHORIZATION: "d",
} as const;

function plan(tokens?: readonly string[]) {
  return planProductSeed({
    crypto: { encrypt, keyedHash, sha256, randomToken },
    noticeVersion: "1.0",
    consentTextHashes: HASHES,
    now: new Date("2026-09-30T12:00:00.000Z"),
    tokens,
  });
}

describe("fichas sintéticas KAN-106", () => {
  it("son exactamente tres recorridos distintos y con cédula válida", () => {
    expect(PRODUCT_PERSONAS).toHaveLength(3);
    expect(new Set(PRODUCT_PERSONAS.map((p) => p.status))).toEqual(new Set(["COMPLETED", "NEEDS_REVIEW", "STARTED"]));
    expect(new Set(PRODUCT_PERSONAS.map((p) => p.cedula)).size).toBe(3);
    for (const persona of PRODUCT_PERSONAS) {
      expect(isValidCedula(persona.cedula)).toBe(true);
      expect(persona.cedula.endsWith(persona.cedula.slice(-2))).toBe(true);
      if (persona.confirmationCode) expect(isConfirmationCode(persona.confirmationCode)).toBe(true);
      expect(persona.contact?.primary_email ?? "none@example.invalid").toMatch(/@example\.invalid$/);
    }
  });

  it("el envío completo pasa el mismo esquema del formulario", () => {
    const completed = PRODUCT_PERSONAS.find((p) => p.key === "completed");
    const review = PRODUCT_PERSONAS.find((p) => p.key === "needsReview");
    expect(completed?.contact && completed.bank).toBeTruthy();
    expect(review?.contact && review.bank).toBeTruthy();
    for (const persona of [completed!, review!]) {
      const parsed = submissionSchema.safeParse({
        names: {
          namesConfirmed: persona.currentFirstNames === persona.importedFirstNames,
          firstNames: persona.currentFirstNames,
          lastNames: persona.currentLastNames,
        },
        contact: {
          primaryEmail: persona.contact!.primary_email,
          primaryEmailConfirm: persona.contact!.primary_email,
          secondaryEmail: persona.contact!.secondary_email ?? "",
          phoneCountryCode: "+593",
          phoneNumber: persona.contact!.mobile_phone.replace("+593", "0"),
          addressLine1: persona.contact!.address_line_1,
          addressLine2: persona.contact!.address_line_2 ?? "",
          city: persona.contact!.city,
          province: persona.contact!.province,
          country: persona.contact!.country,
          postalCode: persona.contact!.postal_code ?? "",
        },
        bank: {
          bankName: persona.bank!.bank_name,
          bankOtherName: "",
          accountType: persona.bank!.account_type,
          accountNumber: persona.bank!.account_number,
          accountNumberConfirm: persona.bank!.account_number,
          accountHolderName: persona.bank!.account_holder_name,
          accountHolderCedula: persona.bank!.account_holder_cedula,
          ownershipDeclared: true,
        },
        consents: { privacyAccepted: true, sharingAccepted: true, accuracyDeclared: true },
        noticeVersion: "1.0",
      });
      expect(parsed.success).toBe(true);
    }
  });

  it("cifra la cédula, deja el recorrido iniciado sin envío y marca revisión", () => {
    const seeded = plan(["token-completado-32-caracteres-minimo-aaaa", "token-revision-32-caracteres-minimo-bbbb", "token-iniciado-32-caracteres-minimo-cccc"]);
    const byStatus = Object.fromEntries(seeded.people.map((person) => [person.status, person]));
    expect(decrypt(byStatus.COMPLETED!.national_id_encrypted)).toBe("1700000019");
    expect(byStatus.COMPLETED!.national_id_hash).toBe(keyedHash("1700000019", "national_id"));
    expect(byStatus.STARTED!.submitted_at).toBeNull();
    expect(byStatus.STARTED!.confirmation_code).toBeNull();
    expect(seeded.contacts.map((row) => row.person_id)).not.toContain(SEED_PERSON_IDS.started);
    expect(seeded.consents.filter((row) => row.person_id === SEED_PERSON_IDS.completed)).toHaveLength(4);
    expect(seeded.consents.filter((row) => row.person_id === SEED_PERSON_IDS.needsReview)).toHaveLength(4);
    expect(seeded.nameChanges).toEqual([
      expect.objectContaining({
        person_id: SEED_PERSON_IDS.needsReview,
        original_last_names: "Cuevas Salazar",
        new_last_names: "Cueva Salazar",
      }),
    ]);
    expect(byStatus.NEEDS_REVIEW!.review_reasons).toEqual(["NAMES_CORRECTED", "THIRD_PARTY_ACCOUNT"]);
    const startedLink = seeded.links.find((link) => link.key === "started");
    expect(startedLink?.linkState).toBe("valid");
    expect(seeded.links.filter((link) => link.linkState === "used")).toHaveLength(2);
    const auditBlob = JSON.stringify(seeded.audits);
    expect(auditBlob).not.toContain("1700000019");
    expect(auditBlob).not.toContain("example.invalid");
    expect(auditBlob).not.toContain("2100004819");
  });

  it("reaplicar el plan no duplica consentimientos ni fichas", () => {
    const store = emptyStore();
    const first = plan(["a".repeat(40), "b".repeat(40), "c".repeat(40)]);
    const second = plan(["d".repeat(40), "e".repeat(40), "f".repeat(40)]);
    applyPlan(store, first);
    applyPlan(store, second);
    expect(store.people.size).toBe(3);
    expect(store.consents).toHaveLength(8);
    expect(store.audits.filter((row) => row.action === "FORM_SUBMITTED")).toHaveLength(2);
    expect(store.tokens.get(SEED_PERSON_IDS.started)?.token_hash).toBe(sha256("f".repeat(40)));
    expect(store.people.get(SEED_PERSON_IDS.completed)?.status).toBe("COMPLETED");
  });
});

interface Store {
  people: Map<string, SeedPlan["people"][number]>;
  contacts: Map<string, Record<string, unknown>>;
  banks: Map<string, Record<string, unknown>>;
  consents: Record<string, unknown>[];
  nameChanges: Record<string, unknown>[];
  tokens: Map<string, Record<string, unknown>>;
  sessions: Map<string, Record<string, unknown>>;
  audits: Record<string, unknown>[];
}

function emptyStore(): Store {
  return { people: new Map(), contacts: new Map(), banks: new Map(), consents: [], nameChanges: [], tokens: new Map(), sessions: new Map(), audits: [] };
}

/** Misma regla que el script: solo reemplaza hijos de los ids del seed. */
function applyPlan(store: Store, plan: SeedPlan) {
  for (const id of SEED_PERSON_ID_LIST) {
    store.contacts.delete(id);
    store.banks.delete(id);
    store.tokens.delete(id);
    store.sessions.delete(id);
  }
  store.consents = store.consents.filter((row) => !SEED_PERSON_ID_LIST.includes(String(row.person_id)));
  store.nameChanges = store.nameChanges.filter((row) => !SEED_PERSON_ID_LIST.includes(String(row.person_id)));
  store.audits = store.audits.filter((row) => !SEED_PERSON_ID_LIST.includes(String(row.person_id)));
  for (const person of plan.people) store.people.set(person.id, person);
  for (const row of plan.contacts) store.contacts.set(String(row.person_id), row);
  for (const row of plan.banks) store.banks.set(String(row.person_id), row);
  for (const row of plan.tokens) store.tokens.set(String(row.person_id), row);
  for (const row of plan.sessions) store.sessions.set(String(row.person_id), row);
  store.consents.push(...plan.consents);
  store.nameChanges.push(...plan.nameChanges);
  store.audits.push(...plan.audits);
}
