import QRCode from "qrcode";
import { encrypt, decrypt, keyedHash, randomToken, safeEqual, sha256 } from "@/lib/encryption/crypto";
import type { AdminRepo, GeneralAuthRecord, RespondentRepo } from "@/lib/database/types";
import { GENERIC_GENERAL_ERROR } from "@/lib/validation/constants";
import { flattenIssues, generalIdentifySchema, generalTotpSchema } from "@/lib/validation/schemas";
import { sanitizeDeep } from "@/lib/validation/sanitize";
import { maskCedulaTail } from "@/lib/security/masking";
import { RESPONDENT_SESSION_MINUTES } from "@/lib/security/cookies";
import { generateTotpSecret, otpauthUrl, verifyTotp } from "@/lib/security/totp";
import { canContinueForm } from "./insured-home";
import { settings } from "./settings";

const RATE_LIMIT_ERROR = "Hiciste demasiados intentos. Espera 15 minutos y vuelve a intentarlo.";
const TOTP_MISMATCH = "El código de verificación no es correcto. Inténtalo otra vez.";
const CHALLENGE_EXPIRED = "Esta verificación venció. Vuelve a escribir tu cédula.";
const FINGERPRINT_REQUIRED = "Escribe el código dactilar de tu cédula.";
const ISSUER = "AME Portal";

export interface GeneralDeps {
  ipHash: string;
  captchaEnabled: boolean;
  verifyCaptcha: (token: string | undefined) => Promise<boolean>;
}

export type GeneralStartResult =
  | { ok: true; phase: "enroll"; challengeToken: string; qrDataUrl: string; otpauthUrl: string; manualKey: string }
  | { ok: true; phase: "totp"; challengeToken: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string>; requireCaptcha?: boolean };

export type GeneralConfirmResult =
  | { ok: true; sessionToken: string; expiresAt: string; destination: "form" | "home" }
  | { ok: false; error: string; fieldErrors?: Record<string, string>; requireCaptcha?: boolean; challengeExpired?: boolean };

function needsCaptcha(deps: GeneralDeps, hits: number): boolean {
  return deps.captchaEnabled && hits > settings.captchaAfterAttempts;
}

function isLocked(until: string | null): boolean {
  return Boolean(until && new Date(until).getTime() > Date.now());
}

export function totpAccountLabel(person: Pick<GeneralAuthRecord, "first_names" | "last_names" | "national_id_last2">): string {
  const first = person.first_names.trim().split(/\s+/)[0] || "Titular";
  const lastInitial = person.last_names.trim().charAt(0);
  const name = lastInitial ? `${first} ${lastInitial}.` : first;
  return `${name} · ${maskCedulaTail(person.national_id_last2)}`;
}

async function limitIp(repo: RespondentRepo, deps: GeneralDeps): Promise<{ allowed: boolean; hits: number }> {
  const limit = await repo.rateLimitHit(`general-ip:${deps.ipHash}`, settings.generalIdentifyLimitPerIp, settings.generalIdentifyWindowSeconds);
  if (!limit.allowed) {
    await repo.logSecurityEvent({ event_type: "GENERAL_RATE_LIMITED", ip_hash: deps.ipHash, detail: { scope: "ip", hits: limit.hits } });
  }
  return limit;
}

/**
 * Paso 1: cédula. El código dactilar es opcional salvo AME_REQUIRE_FINGERPRINT_CODE=true.
 * Si lo escriben y no había uno, se guarda hasheado. Si ya hay hash, tiene que coincidir.
 */
export async function startGeneralAccess(repo: RespondentRepo, rawInput: unknown, deps: GeneralDeps): Promise<GeneralStartResult> {
  const ipLimit = await limitIp(repo, deps);
  if (!ipLimit.allowed) return { ok: false, error: RATE_LIMIT_ERROR };

  const parsed = generalIdentifySchema.safeParse(sanitizeDeep(rawInput));
  if (!parsed.success) {
    return { ok: false, error: "Revisa los campos marcados.", fieldErrors: flattenIssues(parsed.error), requireCaptcha: needsCaptcha(deps, ipLimit.hits) };
  }

  const code = parsed.data.codigoDactilar;
  if (settings.requireFingerprintCode() && !code) {
    return { ok: false, error: "Revisa los campos marcados.", fieldErrors: { codigoDactilar: FINGERPRINT_REQUIRED }, requireCaptcha: needsCaptcha(deps, ipLimit.hits) };
  }

  if (needsCaptcha(deps, ipLimit.hits)) {
    const human = await deps.verifyCaptcha(parsed.data.captchaToken);
    if (!human) return { ok: false, error: "Confirma que no eres un robot para continuar.", requireCaptcha: true };
  }

  const cedulaHash = keyedHash(parsed.data.cedula, "national_id");
  const cedulaLimit = await repo.rateLimitHit(`general-cedula:${cedulaHash}`, settings.generalIdentifyLimitPerCedula, settings.generalIdentifyWindowSeconds);
  if (!cedulaLimit.allowed) {
    await repo.logSecurityEvent({ event_type: "GENERAL_RATE_LIMITED", ip_hash: deps.ipHash, detail: { scope: "cedula", hits: cedulaLimit.hits } });
    return { ok: false, error: RATE_LIMIT_ERROR };
  }

  const providedHash = keyedHash(code || "blank-fingerprint", "fingerprint_code");
  const person = await repo.findPersonByNationalIdHash(cedulaHash);
  const comparable = person?.fingerprint_code_hash ?? keyedHash("unregistered-person", "fingerprint_code");
  const equal = safeEqual(providedHash, comparable);
  const requireCaptcha = needsCaptcha(deps, ipLimit.hits);

  if (!person) {
    await repo.audit({ actor_type: "respondent", action: "GENERAL_IDENTIFY_FAILED", metadata: { outcome: "unknown" } });
    await repo.logSecurityEvent({ event_type: "GENERAL_IDENTIFY_FAILED", ip_hash: deps.ipHash, detail: { outcome: "unknown" } });
    return { ok: false, error: GENERIC_GENERAL_ERROR, requireCaptcha };
  }

  if (isLocked(person.general_locked_until)) {
    await repo.audit({ person_id: person.id, actor_type: "respondent", action: "GENERAL_IDENTIFY_FAILED", metadata: { outcome: "locked" } });
    await repo.logSecurityEvent({ event_type: "GENERAL_LOCKED", ip_hash: deps.ipHash, detail: { outcome: "locked" } });
    return { ok: false, error: GENERIC_GENERAL_ERROR, requireCaptcha };
  }

  if (person.fingerprint_code_hash) {
    if (!code || !equal) return failFingerprint(repo, person.id, deps, requireCaptcha);
  } else if (code) {
    const claim = await repo.claimFingerprintCode(person.id, providedHash);
    if (claim === "claimed") {
      await repo.audit({ person_id: person.id, actor_type: "respondent", action: "FINGERPRINT_CLAIMED", metadata: { entry: "general" } });
    } else if (claim !== "matched") {
      return failFingerprint(repo, person.id, deps, requireCaptcha);
    }
  }

  return openTotpStep(repo, person);
}

async function failFingerprint(repo: RespondentRepo, personId: string, deps: GeneralDeps, requireCaptcha: boolean): Promise<GeneralStartResult> {
  const failure = await repo.registerGeneralFailure(personId, settings.generalLockThreshold, settings.generalLockMinutes);
  await repo.audit({
    person_id: personId,
    actor_type: "respondent",
    action: "GENERAL_IDENTIFY_FAILED",
    metadata: { outcome: failure.locked ? "locked" : "mismatch", attempt: failure.failed_attempts },
  });
  if (failure.locked) {
    await repo.logSecurityEvent({ event_type: "GENERAL_LOCKED", ip_hash: deps.ipHash, detail: { outcome: "locked" } });
  } else {
    await repo.logSecurityEvent({ event_type: "GENERAL_IDENTIFY_FAILED", ip_hash: deps.ipHash, detail: { outcome: "mismatch" } });
  }
  return { ok: false, error: GENERIC_GENERAL_ERROR, requireCaptcha };
}

async function openTotpStep(repo: RespondentRepo, person: GeneralAuthRecord): Promise<GeneralStartResult> {
  const challengeToken = randomToken(32);
  const expiresAt = new Date(Date.now() + settings.generalChallengeMinutes * 60_000).toISOString();
  const challengeHash = sha256(challengeToken);
  if (person.totp_enabled_at && person.totp_secret_encrypted) {
    const started = await repo.beginGeneralChallenge(person.id, { purpose: "verify", challengeHash, expiresAt });
    if (!started) return { ok: false, error: GENERIC_GENERAL_ERROR };
    return { ok: true, phase: "totp", challengeToken };
  }
  const secret = generateTotpSecret();
  const started = await repo.beginGeneralChallenge(person.id, {
    purpose: "enroll",
    challengeHash,
    expiresAt,
    totpSecretEncrypted: encrypt(secret),
  });
  if (!started) return { ok: false, error: GENERIC_GENERAL_ERROR };
  const account = totpAccountLabel(person);
  const url = otpauthUrl(secret, account, ISSUER);
  const qrDataUrl = await QRCode.toDataURL(url, { margin: 1, width: 220 });
  return { ok: true, phase: "enroll", challengeToken, qrDataUrl, otpauthUrl: url, manualKey: formatTotpManualKey(secret) };
}

/** Agrupa el secreto para copiarlo a mano. No se registra en auditoría. */
export function formatTotpManualKey(secret: string): string {
  return secret.replace(/\s/g, "").replace(/(.{4})/g, "$1 ").trim();
}

/** Paso 2: confirma el TOTP y abre la sesión del formulario. */
export async function confirmGeneralTotp(repo: RespondentRepo, challengeToken: string | undefined, rawInput: unknown, deps: GeneralDeps): Promise<GeneralConfirmResult> {
  const ipLimit = await limitIp(repo, deps);
  if (!ipLimit.allowed) return { ok: false, error: RATE_LIMIT_ERROR };

  if (!challengeToken || !/^[A-Za-z0-9_-]{32,128}$/.test(challengeToken)) {
    return { ok: false, error: CHALLENGE_EXPIRED, challengeExpired: true };
  }
  const parsed = generalTotpSchema.safeParse(sanitizeDeep(rawInput));
  if (!parsed.success) {
    return { ok: false, error: "Revisa los campos marcados.", fieldErrors: flattenIssues(parsed.error) };
  }

  const challenge = await repo.findGeneralChallenge(sha256(challengeToken));
  if (!challenge || new Date(challenge.expires_at).getTime() <= Date.now() || !challenge.totp_secret_encrypted) {
    return { ok: false, error: CHALLENGE_EXPIRED, challengeExpired: true };
  }

  let codeOk = false;
  try {
    codeOk = verifyTotp(decrypt(challenge.totp_secret_encrypted), parsed.data.code);
  } catch {
    codeOk = false;
  }

  if (isLocked(challenge.general_locked_until)) {
    await repo.audit({ person_id: challenge.person_id, actor_type: "respondent", action: "GENERAL_IDENTIFY_FAILED", metadata: { outcome: "locked" } });
    await repo.logSecurityEvent({ event_type: "GENERAL_LOCKED", ip_hash: deps.ipHash, detail: { outcome: "locked" } });
    return { ok: false, error: GENERIC_GENERAL_ERROR };
  }

  if (!codeOk) {
    const failure = await repo.registerGeneralFailure(challenge.person_id, settings.generalLockThreshold, settings.generalLockMinutes);
    await repo.audit({
      person_id: challenge.person_id,
      actor_type: "respondent",
      action: "GENERAL_IDENTIFY_FAILED",
      metadata: { outcome: failure.locked ? "locked" : "totp", attempt: failure.failed_attempts },
    });
    if (failure.locked) {
      await repo.logSecurityEvent({ event_type: "GENERAL_LOCKED", ip_hash: deps.ipHash, detail: { outcome: "locked" } });
      return { ok: false, error: GENERIC_GENERAL_ERROR };
    }
    await repo.logSecurityEvent({ event_type: "GENERAL_TOTP_FAILED", ip_hash: deps.ipHash, detail: { outcome: "totp" } });
    return { ok: false, error: TOTP_MISMATCH, requireCaptcha: needsCaptcha(deps, ipLimit.hits) };
  }

  const completed = await repo.completeGeneralChallenge(challenge.person_id, sha256(challengeToken), challenge.purpose);
  if (!completed) return { ok: false, error: CHALLENGE_EXPIRED, challengeExpired: true };
  if (challenge.purpose === "enroll") {
    await repo.audit({ person_id: challenge.person_id, actor_type: "respondent", action: "TOTP_ENROLLED", metadata: { entry: "general" } });
  }

  const person = await repo.getPerson(challenge.person_id);
  if (!person) return { ok: false, error: GENERIC_GENERAL_ERROR };
  const sessionToken = randomToken(32);
  const expiresAt = new Date(Date.now() + RESPONDENT_SESSION_MINUTES * 60_000).toISOString();
  const continueForm = canContinueForm(person);
  await repo.createRespondentSession({
    session_hash: sha256(sessionToken),
    person_id: person.id,
    access_token_id: null,
    entry_method: "general",
    expires_at: expiresAt,
    submitted_at: continueForm ? null : person.submitted_at,
  });
  if (continueForm) await repo.markStarted(person.id);
  await repo.audit({ person_id: person.id, actor_type: "respondent", action: "IDENTITY_VERIFIED", metadata: { entry: "general" } });
  return { ok: true, sessionToken, expiresAt, destination: continueForm ? "form" : "home" };
}

/** Borra el código dactilar y el TOTP para que la persona pueda registrarlos de nuevo. */
export async function resetPersonGeneralAuth(repo: AdminRepo, personId: string, adminId: string): Promise<boolean> {
  const cleared = await repo.resetGeneralAuth(personId);
  if (!cleared) return false;
  await repo.audit({
    person_id: personId,
    actor_type: "admin",
    actor_id: adminId,
    action: "FINGERPRINT_RESET",
    changed_fields: ["fingerprint_code_hash"],
  });
  await repo.audit({
    person_id: personId,
    actor_type: "admin",
    actor_id: adminId,
    action: "TOTP_RESET",
    changed_fields: ["totp_secret_encrypted", "totp_enabled_at"],
  });
  return true;
}
