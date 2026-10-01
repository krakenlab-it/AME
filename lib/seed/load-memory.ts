import { encrypt, keyedHash, randomToken, sha256 } from "@/lib/encryption/crypto";
import { MemoryRepo } from "@/lib/database/memory-repo";
import type { ConsentType } from "@/lib/privacy/notice";
import { PRODUCT_SEED_TOKENS } from "@/lib/seed/ci-seed";
import { planProductSeed, PRODUCT_PERSONAS, type SeedPlan } from "@/lib/seed/product-personas";

const CONSENT_HASHES = {
  PRIVACY_NOTICE: "seed-privacy",
  DATA_SHARING_AIG: "seed-sharing",
  ACCURACY_DECLARATION: "seed-accuracy",
  BANK_ACCOUNT_AUTHORIZATION: "seed-bank",
} as const satisfies Record<ConsentType, string>;

/** Carga las tres fichas KAN-106 en el repositorio en memoria, con enlaces conocidos. */
export function loadProductSeed(repo: MemoryRepo): SeedPlan["links"] {
  const plan = planProductSeed({
    crypto: { encrypt, keyedHash, sha256, randomToken },
    noticeVersion: "1.0",
    consentTextHashes: CONSENT_HASHES,
    tokens: PRODUCT_PERSONAS.map((persona) => PRODUCT_SEED_TOKENS[persona.key]),
  });

  for (const person of plan.people) {
    repo.people.set(person.id, {
      id: person.id,
      first_names: person.first_names,
      last_names: person.last_names,
      national_id_encrypted: person.national_id_encrypted,
      national_id_hash: person.national_id_hash,
      national_id_last2: person.national_id_last2,
      status: person.status,
      confirmation_code: person.confirmation_code,
      submitted_at: person.submitted_at,
      review_reasons: [...person.review_reasons],
      retention_until: person.retention_until,
    });
  }

  for (const contact of plan.contacts) {
    const personId = String(contact.person_id);
    const profile = repo.profiles.get(personId) ?? { contact: null, bank: null, notice_version: null };
    profile.contact = {
      primary_email: contact.primary_email == null ? null : String(contact.primary_email),
      secondary_email: contact.secondary_email == null ? null : String(contact.secondary_email),
      mobile_phone: contact.mobile_phone == null ? null : String(contact.mobile_phone),
      city: contact.city == null ? null : String(contact.city),
      province: contact.province == null ? null : String(contact.province),
      country: contact.country == null ? null : String(contact.country),
    };
    repo.profiles.set(personId, profile);
  }

  for (const bank of plan.banks) {
    const personId = String(bank.person_id);
    const profile = repo.profiles.get(personId) ?? { contact: null, bank: null, notice_version: null };
    profile.bank = {
      bank_name: String(bank.bank_name ?? ""),
      bank_other_name: bank.bank_other_name == null ? null : String(bank.bank_other_name),
      account_type: String(bank.account_type ?? ""),
      account_number_last4: String(bank.account_number_last4 ?? ""),
      holder_is_titular: Boolean(bank.holder_is_titular),
    };
    repo.profiles.set(personId, profile);
  }

  for (const consent of plan.consents) {
    if (consent.consent_type !== "PRIVACY_NOTICE") continue;
    const personId = String(consent.person_id);
    const profile = repo.profiles.get(personId) ?? { contact: null, bank: null, notice_version: null };
    profile.notice_version = consent.privacy_notice_version == null ? null : String(consent.privacy_notice_version);
    repo.profiles.set(personId, profile);
  }

  for (const token of plan.tokens) {
    const id = String(token.id);
    repo.tokens.set(id, {
      id,
      person_id: String(token.person_id),
      token_hash: String(token.token_hash),
      expires_at: String(token.expires_at),
      used_at: token.used_at == null ? null : String(token.used_at),
      revoked_at: token.revoked_at == null ? null : String(token.revoked_at),
      failed_attempts: Number(token.failed_attempts ?? 0),
    });
  }

  return plan.links;
}
