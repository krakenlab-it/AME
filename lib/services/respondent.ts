import { encrypt, decrypt, keyedHash, randomToken, safeEqual, sha256 } from "@/lib/encryption/crypto";
import { RepoError, type PersonRecord, type RespondentRepo, type RespondentSessionRecord } from "@/lib/database/types";
import { GENERIC_IDENTIFY_ERROR } from "@/lib/validation/constants";
import { flattenIssues, identifySchema, submissionSchema } from "@/lib/validation/schemas";
import { cleanText, sanitizeDeep } from "@/lib/validation/sanitize";
import { normalizePhone } from "@/lib/validation/phone";
import { maskCedula } from "@/lib/security/masking";
import { RESPONDENT_SESSION_MINUTES } from "@/lib/security/cookies";
import { CONSENT_PURPOSE, type ConsentType } from "@/lib/privacy/notice";
import { generateConfirmationCode } from "./confirmation";
import { settings } from "./settings";

// ─────────────────────────────────────────────────────────────────────────────
// Estado del enlace (se usa al abrir /verificar/[token]). No revela datos personales.
// ─────────────────────────────────────────────────────────────────────────────
export type LinkState = "valid" | "expired" | "used" | "revoked" | "invalid";

export async function inspectLink(repo: RespondentRepo, rawToken: string, ipHash: string): Promise<LinkState> {
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(rawToken)) {
    await repo.logSecurityEvent({ event_type: "MALFORMED_TOKEN", ip_hash: ipHash });
    return "invalid";
  }
  const limit = await repo.rateLimitHit(`link-open:${ipHash}`, 60, 15 * 60);
  if (!limit.allowed) {
    await repo.logSecurityEvent({ event_type: "LINK_OPEN_RATE_LIMITED", ip_hash: ipHash });
    return "invalid";
  }
  const token = await repo.findAccessToken(sha256(rawToken));
  if (!token) {
    await repo.logSecurityEvent({ event_type: "UNKNOWN_TOKEN", ip_hash: ipHash });
    return "invalid";
  }
  const state = tokenState(token);
  if (state === "valid") await repo.audit({ person_id: token.person_id, actor_type: "respondent", action: "RECORD_OPENED" });
  return state;
}

function tokenState(t: { expires_at: string; used_at: string | null; revoked_at: string | null }): LinkState {
  if (t.revoked_at) return "revoked";
  if (t.used_at) return "used";
  if (new Date(t.expires_at).getTime() <= Date.now()) return "expired";
  return "valid";
}

// ─────────────────────────────────────────────────────────────────────────────
// Paso 1: identificación (token + cédula = segunda capa)
// ─────────────────────────────────────────────────────────────────────────────
export type IdentifyResult =
  | { ok: true; sessionToken: string; expiresAt: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string>; requireCaptcha?: boolean; linkState?: LinkState };

export interface IdentifyDeps {
  ipHash: string;
  captchaEnabled: boolean;
  verifyCaptcha: (token: string | undefined) => Promise<boolean>;
}

export async function identify(repo: RespondentRepo, rawInput: unknown, deps: IdentifyDeps): Promise<IdentifyResult> {
  const parsed = identifySchema.safeParse(sanitizeDeep(rawInput));
  if (!parsed.success) {
    const fieldErrors = flattenIssues(parsed.error);
    if (fieldErrors.token) return { ok: false, error: GENERIC_IDENTIFY_ERROR };
    return { ok: false, error: fieldErrors.cedula ?? GENERIC_IDENTIFY_ERROR, fieldErrors };
  }
  const { token: rawToken, cedula, captchaToken } = parsed.data;

  // Rate limiting por IP (distribuido en PostgreSQL)
  const limit = await repo.rateLimitHit(`identify:${deps.ipHash}`, settings.identifyLimitPerIp, settings.identifyWindowSeconds);
  if (!limit.allowed) {
    await repo.logSecurityEvent({ event_type: "IDENTIFY_RATE_LIMITED", ip_hash: deps.ipHash, detail: { hits: limit.hits } });
    return { ok: false, error: "Hiciste demasiados intentos. Espera 15 minutos y vuelve a intentarlo." };
  }

  // CAPTCHA adaptativo después de varios intentos
  if (deps.captchaEnabled && limit.hits > settings.captchaAfterAttempts) {
    const human = await deps.verifyCaptcha(captchaToken);
    if (!human) return { ok: false, error: "Confirma que no eres un robot para continuar.", requireCaptcha: true };
  }

  const token = await repo.findAccessToken(sha256(rawToken));
  if (!token) {
    await repo.logSecurityEvent({ event_type: "UNKNOWN_TOKEN_IDENTIFY", ip_hash: deps.ipHash });
    return { ok: false, error: GENERIC_IDENTIFY_ERROR, requireCaptcha: deps.captchaEnabled && limit.hits >= settings.captchaAfterAttempts };
  }
  const state = tokenState(token);
  if (state !== "valid") return { ok: false, error: linkStateMessage(state), linkState: state };

  const person = await repo.getPerson(token.person_id);
  const candidate = keyedHash(cedula, "national_id");
  const matches = Boolean(person?.national_id_hash) && safeEqual(candidate, person!.national_id_hash!);

  if (!person || !matches) {
    const failure = await repo.registerTokenFailure(token.id, settings.tokenLockThreshold);
    await repo.audit({ person_id: token.person_id, actor_type: "respondent", action: "IDENTITY_FAILED", metadata: { attempt: failure.failed_attempts } });
    if (failure.locked) {
      await repo.logSecurityEvent({ event_type: "TOKEN_LOCKED", ip_hash: deps.ipHash });
      return { ok: false, error: linkStateMessage("revoked"), linkState: "revoked" };
    }
    return { ok: false, error: GENERIC_IDENTIFY_ERROR, requireCaptcha: deps.captchaEnabled && limit.hits >= settings.captchaAfterAttempts };
  }

  const sessionToken = randomToken(32);
  const expiresAt = new Date(Date.now() + RESPONDENT_SESSION_MINUTES * 60_000).toISOString();
  await repo.createRespondentSession({ session_hash: sha256(sessionToken), person_id: person.id, access_token_id: token.id, expires_at: expiresAt });
  await repo.markStarted(person.id);
  await repo.audit({ person_id: person.id, actor_type: "respondent", action: "IDENTITY_VERIFIED" });
  return { ok: true, sessionToken, expiresAt };
}

export function linkStateMessage(state: LinkState): string {
  switch (state) {
    case "expired":
      return "Este enlace ya venció. Solicita un nuevo enlace a la persona que te lo envió.";
    case "used":
      return "Este enlace ya fue utilizado para enviar la información. Si necesitas hacer un cambio, solicita un nuevo enlace.";
    case "revoked":
      return "Este enlace fue desactivado por seguridad. Solicita un nuevo enlace a la persona que te lo envió.";
    default:
      return GENERIC_IDENTIFY_ERROR;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Sesión del titular
// ─────────────────────────────────────────────────────────────────────────────
export interface RespondentContext {
  session: RespondentSessionRecord;
  person: PersonRecord;
}

export async function getRespondentContext(repo: RespondentRepo, sessionToken: string | undefined, opts: { allowSubmitted?: boolean } = {}): Promise<RespondentContext | null> {
  if (!sessionToken || !/^[A-Za-z0-9_-]{32,128}$/.test(sessionToken)) return null;
  const session = await repo.findRespondentSession(sha256(sessionToken));
  if (!session || session.revoked_at) return null;
  if (new Date(session.expires_at).getTime() <= Date.now()) return null;
  if (session.submitted_at && !opts.allowSubmitted) return null;
  const person = await repo.getPerson(session.person_id);
  if (!person) return null;
  return { session, person };
}

/** Lo único que se muestra al titular sobre su registro existente. */
export function registeredView(person: PersonRecord) {
  let masked = `**${"*".repeat(6)}${person.national_id_last2 ?? "**"}`;
  if (person.national_id_encrypted) {
    try {
      masked = maskCedula(decrypt(person.national_id_encrypted));
    } catch {
      /* se mantiene la versión más enmascarada */
    }
  }
  return { firstNames: person.first_names, lastNames: person.last_names, cedulaMasked: masked, cedulaLast2: person.national_id_last2 ?? "**" };
}

// ─────────────────────────────────────────────────────────────────────────────
// Envío definitivo
// ─────────────────────────────────────────────────────────────────────────────
export interface SubmitDeps {
  activeNoticeVersion: string;
  consentTexts: Record<ConsentType, string>;
  retentionMonths: number;
  portalBlocked: boolean;
}

export type SubmitResult =
  | { ok: true; confirmationCode: string; email: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string>; sessionExpired?: boolean };

const CONTACT_FIELDS = ["primary_email", "secondary_email", "mobile_phone", "address_line_1", "address_line_2", "city", "province", "country", "postal_code"];
const BANK_FIELDS = ["bank_name", "account_type", "account_number", "account_holder_name", "account_holder_national_id"];

export async function submitResponse(repo: RespondentRepo, sessionToken: string | undefined, rawInput: unknown, deps: SubmitDeps): Promise<SubmitResult> {
  if (deps.portalBlocked) return { ok: false, error: "El portal no está habilitado todavía. Intenta más tarde." };

  const ctx = await getRespondentContext(repo, sessionToken);
  if (!ctx) return { ok: false, error: "Tu sesión terminó por seguridad. Vuelve a abrir el enlace que recibiste.", sessionExpired: true };

  const parsed = submissionSchema.safeParse(sanitizeDeep(rawInput));
  if (!parsed.success) return { ok: false, error: "Revisa los campos marcados.", fieldErrors: flattenIssues(parsed.error) };
  const data = parsed.data;

  if (data.noticeVersion !== deps.activeNoticeVersion) {
    return { ok: false, error: "El Aviso de Privacidad se actualizó. Vuelve a leerlo y acepta la nueva versión.", fieldErrors: { "consents.privacyAccepted": "Acepta la versión vigente del aviso." } };
  }

  const { person, session } = ctx;
  const phone = normalizePhone(data.contact.phoneCountryCode, data.contact.phoneNumber);
  if (!phone.ok || !phone.e164) return { ok: false, error: "Revisa los campos marcados.", fieldErrors: { "contact.phoneNumber": phone.message ?? "Teléfono no válido." } };

  // Nombres: si el titular confirmó, se conservan los registrados (no se aceptan cambios ocultos).
  const newFirst = data.names.namesConfirmed ? person.first_names : cleanText(data.names.firstNames);
  const newLast = data.names.namesConfirmed ? person.last_names : cleanText(data.names.lastNames);
  const namesChanged =
    newFirst.toLocaleLowerCase("es") !== person.first_names.toLocaleLowerCase("es") ||
    newLast.toLocaleLowerCase("es") !== person.last_names.toLocaleLowerCase("es");

  const holderHash = keyedHash(data.bank.accountHolderCedula, "national_id");
  const holderIsTitular = Boolean(person.national_id_hash) && safeEqual(holderHash, person.national_id_hash!);

  const reviewReasons: string[] = [];
  if (namesChanged) reviewReasons.push("NAMES_CORRECTED");
  if (!holderIsTitular) reviewReasons.push("THIRD_PARTY_ACCOUNT");

  const consentTypes: ConsentType[] = ["PRIVACY_NOTICE", "DATA_SHARING_AIG", "ACCURACY_DECLARATION", "BANK_ACCOUNT_AUTHORIZATION"];
  const retentionUntil = new Date();
  retentionUntil.setMonth(retentionUntil.getMonth() + deps.retentionMonths);

  const base = {
    person_id: person.id,
    session_id: session.id,
    access_token_id: session.access_token_id,
    names_changed: namesChanged,
    first_names: newFirst,
    last_names: newLast,
    contact: {
      primary_email: data.contact.primaryEmail,
      secondary_email: data.contact.secondaryEmail,
      mobile_phone: phone.e164,
      address_line_1: data.contact.addressLine1,
      address_line_2: data.contact.addressLine2,
      city: data.contact.city,
      province: data.contact.province,
      country: data.contact.country,
      postal_code: data.contact.postalCode,
    },
    bank: {
      bank_name: data.bank.bankName,
      bank_other_name: data.bank.bankOtherName,
      account_type: data.bank.accountType,
      account_number_encrypted: encrypt(data.bank.accountNumber),
      account_number_last4: data.bank.accountNumber.slice(-4),
      account_holder_name: cleanText(data.bank.accountHolderName),
      account_holder_national_id_encrypted: encrypt(data.bank.accountHolderCedula),
      holder_is_titular: holderIsTitular,
      ownership_declared: data.bank.ownershipDeclared,
    },
    consents: consentTypes.map((type) => ({ type, text_hash: sha256(deps.consentTexts[type]) })),
    notice_version: deps.activeNoticeVersion,
    purpose: CONSENT_PURPOSE,
    retention_until: retentionUntil.toISOString(),
    review_reasons: reviewReasons,
    changed_fields: [...(namesChanged ? ["first_names", "last_names"] : []), ...CONTACT_FIELDS, ...BANK_FIELDS],
  };

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await repo.submitPersonData({ ...base, confirmation_code: generateConfirmationCode() });
      return { ok: true, confirmationCode: res.confirmation_code, email: data.contact.primaryEmail };
    } catch (err) {
      if (err instanceof RepoError) {
        if (err.code === "DUPLICATE_CODE") continue;
        if (err.code === "ALREADY_SUBMITTED") return { ok: false, error: "Esta información ya fue enviada anteriormente.", sessionExpired: true };
        if (err.code === "SESSION_INVALID" || err.code === "TOKEN_INVALID") {
          return { ok: false, error: "Tu sesión o tu enlace ya no están vigentes. Vuelve a abrir el enlace que recibiste.", sessionExpired: true };
        }
      }
      console.error("[submit] error al guardar el formulario");
      return { ok: false, error: "No pudimos guardar tu información. Intenta nuevamente en unos minutos." };
    }
  }
  return { ok: false, error: "No pudimos guardar tu información. Intenta nuevamente en unos minutos." };
}
