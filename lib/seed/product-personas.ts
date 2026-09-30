/**
 * Tres recorridos sintéticos para visualizar el portal de punta a punta.
 * No son personas reales: cédulas con dígito verificador válido, nombres
 * inventados y correos en el dominio reservado example.invalid.
 *
 * El cifrado depende de ENCRYPTION_KEY y HASH_PEPPER del entorno, así que
 * estos datos no se insertan en una migración SQL.
 */
import type { ConsentType } from "@/lib/privacy/notice";
import type { PersonStatus } from "@/lib/validation/constants";

export const SEED_BATCH_ID = "10600000-0000-4000-8000-000000000001";
export const SEED_BATCH_FILENAME = "kan-106-synthetic-product-seed";

export const SEED_PERSON_IDS = {
  completed: "10600000-0000-4000-8000-000000000011",
  needsReview: "10600000-0000-4000-8000-000000000012",
  started: "10600000-0000-4000-8000-000000000013",
} as const;

const TOKEN_IDS = {
  completed: "10600000-0000-4000-8000-000000000031",
  needsReview: "10600000-0000-4000-8000-000000000032",
  started: "10600000-0000-4000-8000-000000000033",
} as const;

const SESSION_IDS = {
  completed: "10600000-0000-4000-8000-000000000021",
  needsReview: "10600000-0000-4000-8000-000000000022",
  started: "10600000-0000-4000-8000-000000000023",
} as const;

export interface SeedCrypto {
  encrypt(plain: string): string;
  keyedHash(value: string, purpose: "national_id"): string;
  sha256(value: string): string;
  randomToken(bytes?: number): string;
}

export interface ProductPersonaFixture {
  key: keyof typeof SEED_PERSON_IDS;
  status: PersonStatus;
  cedula: string;
  importedFirstNames: string;
  importedLastNames: string;
  currentFirstNames: string;
  currentLastNames: string;
  confirmationCode: string | null;
  contact: {
    primary_email: string;
    secondary_email: string | null;
    mobile_phone: string;
    address_line_1: string;
    address_line_2: string | null;
    city: string;
    province: string;
    country: string;
    postal_code: string | null;
  } | null;
  bank: {
    bank_name: string;
    bank_other_name: string | null;
    account_type: "Ahorros" | "Corriente";
    account_number: string;
    account_holder_name: string;
    account_holder_cedula: string;
    holder_is_titular: boolean;
  } | null;
  reviewReasons: string[];
  importedAt: string;
  linkCreatedAt: string;
  openedAt: string;
  identifiedAt: string;
  submittedAt: string | null;
}

/** Fijados a propósito: secuencias 000000 con provincia 17, 09 y 01. */
export const PRODUCT_PERSONAS: readonly ProductPersonaFixture[] = [
  {
    key: "completed",
    status: "COMPLETED",
    cedula: "1700000019",
    importedFirstNames: "Camila Fernanda",
    importedLastNames: "Viteri Naranjo",
    currentFirstNames: "Camila Fernanda",
    currentLastNames: "Viteri Naranjo",
    confirmationCode: "AIG-K2N6CMP2",
    contact: {
      primary_email: "camila.viteri@example.invalid",
      secondary_email: "camila.viteri.trabajo@example.invalid",
      mobile_phone: "+593990000019",
      address_line_1: "Av. República de El Salvador N34-00",
      address_line_2: "Edificio Semilla, oficina 4",
      city: "Quito",
      province: "Pichincha",
      country: "Ecuador",
      postal_code: "170135",
    },
    bank: {
      bank_name: "Banco Pichincha",
      bank_other_name: null,
      account_type: "Ahorros",
      account_number: "2100004819",
      account_holder_name: "Camila Fernanda Viteri Naranjo",
      account_holder_cedula: "1700000019",
      holder_is_titular: true,
    },
    reviewReasons: [],
    importedAt: "2026-09-20T14:00:00.000Z",
    linkCreatedAt: "2026-09-20T14:05:00.000Z",
    openedAt: "2026-09-21T15:10:00.000Z",
    identifiedAt: "2026-09-21T15:12:00.000Z",
    submittedAt: "2026-09-21T15:28:00.000Z",
  },
  {
    key: "needsReview",
    status: "NEEDS_REVIEW",
    cedula: "0900000027",
    importedFirstNames: "Andres Mateo",
    importedLastNames: "Cuevas Salazar",
    currentFirstNames: "Andrés Mateo",
    currentLastNames: "Cueva Salazar",
    confirmationCode: "AIG-K2N6RVW3",
    contact: {
      primary_email: "andres.cueva@example.invalid",
      secondary_email: null,
      mobile_phone: "+593990000027",
      address_line_1: "Cdla. Kennedy Norte, calle 12",
      address_line_2: null,
      city: "Guayaquil",
      province: "Guayas",
      country: "Ecuador",
      postal_code: null,
    },
    bank: {
      bank_name: "Banco Guayaquil",
      bank_other_name: null,
      account_type: "Corriente",
      account_number: "2200007731",
      account_holder_name: "Rosa Elena Montalvo Paz",
      account_holder_cedula: "0100000017",
      holder_is_titular: false,
    },
    reviewReasons: ["NAMES_CORRECTED", "THIRD_PARTY_ACCOUNT"],
    importedAt: "2026-09-22T13:00:00.000Z",
    linkCreatedAt: "2026-09-22T13:06:00.000Z",
    openedAt: "2026-09-23T18:12:00.000Z",
    identifiedAt: "2026-09-23T18:14:00.000Z",
    submittedAt: "2026-09-23T18:40:00.000Z",
  },
  {
    key: "started",
    status: "STARTED",
    cedula: "0100000033",
    importedFirstNames: "Lucía Isabel",
    importedLastNames: "Romero Calle",
    currentFirstNames: "Lucía Isabel",
    currentLastNames: "Romero Calle",
    confirmationCode: null,
    contact: null,
    bank: null,
    reviewReasons: [],
    importedAt: "2026-09-28T16:00:00.000Z",
    linkCreatedAt: "2026-09-28T16:04:00.000Z",
    openedAt: "2026-09-29T11:20:00.000Z",
    identifiedAt: "2026-09-29T11:22:00.000Z",
    submittedAt: null,
  },
];

const CONTACT_FIELDS = ["primary_email", "secondary_email", "mobile_phone", "address_line_1", "address_line_2", "city", "province", "country", "postal_code"];
const BANK_FIELDS = ["bank_name", "account_type", "account_number", "account_holder_name", "account_holder_national_id"];

export interface SeedPersonRow {
  id: string;
  first_names: string;
  last_names: string;
  national_id_encrypted: string;
  national_id_hash: string;
  national_id_last2: string;
  status: PersonStatus;
  confirmation_code: string | null;
  submitted_at: string | null;
  review_reasons: string[];
  retention_until: string | null;
  import_batch_id: string;
  created_at: string;
}

export interface SeedPlan {
  batch: { id: string; filename: string; total_rows: number; imported_rows: number; rejected_rows: number; created_at: string };
  people: SeedPersonRow[];
  contacts: Record<string, unknown>[];
  banks: Record<string, unknown>[];
  consents: Record<string, unknown>[];
  nameChanges: Record<string, unknown>[];
  tokens: Record<string, unknown>[];
  sessions: Record<string, unknown>[];
  audits: Record<string, unknown>[];
  links: { key: ProductPersonaFixture["key"]; name: string; cedula: string; status: PersonStatus; confirmationCode: string | null; rawToken: string; linkState: "used" | "valid" }[];
}

export function planProductSeed(opts: {
  crypto: SeedCrypto;
  noticeVersion: string;
  consentTextHashes: Record<ConsentType, string>;
  now?: Date;
  /** Tokens fijos, en el orden de PRODUCT_PERSONAS. Si faltan, se generan. */
  tokens?: readonly string[];
}): SeedPlan {
  const now = opts.now ?? new Date();
  const startedExpires = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const people: SeedPersonRow[] = [];
  const contacts: Record<string, unknown>[] = [];
  const banks: Record<string, unknown>[] = [];
  const consents: Record<string, unknown>[] = [];
  const nameChanges: Record<string, unknown>[] = [];
  const tokens: Record<string, unknown>[] = [];
  const sessions: Record<string, unknown>[] = [];
  const audits: Record<string, unknown>[] = [];
  const links: SeedPlan["links"] = [];

  PRODUCT_PERSONAS.forEach((persona, index) => {
    const personId = SEED_PERSON_IDS[persona.key];
    const tokenId = TOKEN_IDS[persona.key];
    const sessionId = SESSION_IDS[persona.key];
    const rawToken = opts.tokens?.[index] ?? opts.crypto.randomToken();
    const submitted = persona.submittedAt !== null;
    const namesChanged =
      persona.currentFirstNames !== persona.importedFirstNames || persona.currentLastNames !== persona.importedLastNames;

    people.push({
      id: personId,
      first_names: persona.currentFirstNames,
      last_names: persona.currentLastNames,
      national_id_encrypted: opts.crypto.encrypt(persona.cedula),
      national_id_hash: opts.crypto.keyedHash(persona.cedula, "national_id"),
      national_id_last2: persona.cedula.slice(-2),
      status: persona.status,
      confirmation_code: persona.confirmationCode,
      submitted_at: persona.submittedAt,
      review_reasons: persona.reviewReasons,
      retention_until: submitted ? addMonths(persona.submittedAt!, 60) : null,
      import_batch_id: SEED_BATCH_ID,
      created_at: persona.importedAt,
    });

    if (persona.contact) contacts.push({ person_id: personId, ...persona.contact, created_at: persona.submittedAt, updated_at: persona.submittedAt });

    if (persona.bank) {
      banks.push({
        person_id: personId,
        bank_name: persona.bank.bank_name,
        bank_other_name: persona.bank.bank_other_name,
        account_type: persona.bank.account_type,
        account_number_encrypted: opts.crypto.encrypt(persona.bank.account_number),
        account_number_last4: persona.bank.account_number.slice(-4),
        account_holder_name: persona.bank.account_holder_name,
        account_holder_national_id_encrypted: opts.crypto.encrypt(persona.bank.account_holder_cedula),
        holder_is_titular: persona.bank.holder_is_titular,
        ownership_declared: true,
        created_at: persona.submittedAt,
        updated_at: persona.submittedAt,
      });
    }

    if (submitted) {
      const consentTypes: ConsentType[] = ["PRIVACY_NOTICE", "DATA_SHARING_AIG", "ACCURACY_DECLARATION", "BANK_ACCOUNT_AUTHORIZATION"];
      for (const type of consentTypes) {
        consents.push({
          person_id: personId,
          privacy_notice_version: opts.noticeVersion,
          consent_type: type,
          consent_text_hash: opts.consentTextHashes[type],
          purpose: "Presentación, gestión, seguimiento y resolución de reclamos; validación de documentación; procesamiento y pago de reembolsos relacionados con AIG.",
          accepted: true,
          accepted_at: persona.submittedAt,
          mechanism: "web_checkbox_unchecked_by_default",
          session_id: sessionId,
          created_at: persona.submittedAt,
        });
      }
    }

    if (namesChanged) {
      nameChanges.push({
        person_id: personId,
        original_first_names: persona.importedFirstNames,
        original_last_names: persona.importedLastNames,
        new_first_names: persona.currentFirstNames,
        new_last_names: persona.currentLastNames,
        session_id: sessionId,
        created_at: persona.submittedAt,
      });
    }

    const sessionExpires = new Date(new Date(persona.identifiedAt).getTime() + 30 * 60 * 1000).toISOString();
    tokens.push({
      id: tokenId,
      person_id: personId,
      token_hash: opts.crypto.sha256(rawToken),
      expires_at: submitted ? sessionExpires : startedExpires,
      used_at: submitted ? persona.submittedAt : null,
      revoked_at: null,
      failed_attempts: 0,
      created_at: persona.linkCreatedAt,
    });
    sessions.push({
      id: sessionId,
      session_hash: opts.crypto.sha256(`session:${rawToken}`),
      person_id: personId,
      access_token_id: tokenId,
      expires_at: submitted ? sessionExpires : startedExpires,
      submitted_at: persona.submittedAt,
      revoked_at: null,
      created_at: persona.identifiedAt,
    });

    audits.push(
      { person_id: personId, actor_type: "admin", actor_id: null, action: "LINK_CREATED", changed_fields: [], metadata: {}, created_at: persona.linkCreatedAt },
      { person_id: personId, actor_type: "respondent", actor_id: null, action: "RECORD_OPENED", changed_fields: [], metadata: {}, created_at: persona.openedAt },
      { person_id: personId, actor_type: "respondent", actor_id: sessionId, action: "IDENTITY_VERIFIED", changed_fields: [], metadata: {}, created_at: persona.identifiedAt },
    );
    if (submitted) {
      if (namesChanged) {
        audits.push({
          person_id: personId, actor_type: "respondent", actor_id: sessionId, action: "NAMES_CORRECTED",
          changed_fields: ["first_names", "last_names"], metadata: {}, created_at: persona.submittedAt,
        });
      }
      audits.push(
        {
          person_id: personId, actor_type: "respondent", actor_id: sessionId, action: "DATA_UPDATED",
          changed_fields: [...(namesChanged ? ["first_names", "last_names"] : []), ...CONTACT_FIELDS, ...BANK_FIELDS],
          metadata: {}, created_at: persona.submittedAt,
        },
        {
          person_id: personId, actor_type: "respondent", actor_id: sessionId, action: "CONSENT_ACCEPTED",
          changed_fields: [],
          metadata: { notice_version: opts.noticeVersion, types: ["PRIVACY_NOTICE", "DATA_SHARING_AIG", "ACCURACY_DECLARATION", "BANK_ACCOUNT_AUTHORIZATION"] },
          created_at: persona.submittedAt,
        },
        {
          person_id: personId, actor_type: "respondent", actor_id: sessionId, action: "FORM_SUBMITTED",
          changed_fields: [], metadata: { status: persona.status }, created_at: persona.submittedAt,
        },
      );
    }

    links.push({
      key: persona.key,
      name: `${persona.currentFirstNames} ${persona.currentLastNames}`,
      cedula: persona.cedula,
      status: persona.status,
      confirmationCode: persona.confirmationCode,
      rawToken,
      linkState: submitted ? "used" : "valid",
    });
  });

  return {
    batch: {
      id: SEED_BATCH_ID,
      filename: SEED_BATCH_FILENAME,
      total_rows: PRODUCT_PERSONAS.length,
      imported_rows: PRODUCT_PERSONAS.length,
      rejected_rows: 0,
      created_at: PRODUCT_PERSONAS[0]!.importedAt,
    },
    people,
    contacts,
    banks,
    consents,
    nameChanges,
    tokens,
    sessions,
    audits,
    links,
  };
}

export const SEED_PERSON_ID_LIST: readonly string[] = Object.values(SEED_PERSON_IDS);

function addMonths(iso: string, months: number): string {
  const date = new Date(iso);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString();
}
