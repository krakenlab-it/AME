import { encrypt, keyedHash, randomToken, safeEqual, sha256 } from "@/lib/encryption/crypto";
import type { AccessTokenRecord, EntryMethod, GeneralAuthRecord, GeneralChallengeRecord, LinkRequest, RespondentRepo } from "@/lib/database/types";
import { RESPONDENT_SESSION_MINUTES } from "@/lib/security/cookies";
import { maskEmail } from "@/lib/security/masking";
import { isAccessLinkToken, normalizeAccessLinkToken } from "@/lib/validation/access-link-token";
import { GENERIC_GENERAL_ERROR } from "@/lib/validation/constants";
import { flattenIssues, generalCedulaStepSchema, generalEmailCodeSchema, generalEmailIdentifySchema, personalLinkDocumentStepSchema } from "@/lib/validation/schemas";
import { sanitizeDeep } from "@/lib/validation/sanitize";
import type { EmailOtpProvider } from "./email-otp";
import { storedDocumentIsPassport } from "./passport-document";
import { failFingerprint, isLocked, limitIp, needsCaptcha, RATE_LIMIT_ERROR, type GeneralDeps, type GeneralFailure } from "./general-link";
import { canContinueForm } from "./insured-home";
import { linkStateMessage, type LinkState } from "./respondent";
import { settings } from "./settings";

export const EMAIL_CODE_MISMATCH = "El código no es correcto o ya venció. Revisa el último correo que te enviamos.";
export const EMAIL_SEND_FAILED = "No pudimos enviar el código en este momento. Intenta nuevamente en unos minutos.";
export const CHALLENGE_EXPIRED = "Esta verificación venció. Vuelve a escribir tu correo.";
export const EMAIL_SEND_LIMIT = "Ya enviamos varios códigos a este correo. Espera unos minutos antes de pedir otro.";
/** La cédula ya tiene un correo verificado: el código solo se envía a ese correo. */
export function emailBoundError(maskedBound: string): string {
  return `Esta cédula ya ingresó con otro correo (${maskedBound}). Escribe ese mismo correo. Si ya no tienes acceso a él, pide al administrador que restablezca tu ingreso.`;
}

export interface GeneralEmailDeps extends GeneralDeps {
  otp: EmailOtpProvider;
}

export type GeneralEmailStartResult =
  | { ok: true; phase: "email"; challengeToken: string; maskedEmail: string; resendAfterSeconds: number }
  | { ok: false; error: string; fieldErrors?: Record<string, string>; requireCaptcha?: boolean };

export type GeneralEmailResendResult =
  | { ok: true; maskedEmail: string; resendAfterSeconds: number }
  | { ok: false; error: string; resendAfterSeconds?: number; challengeExpired?: boolean };

export type GeneralEmailCodeResult =
  | { ok: true; phase: "cedula" }
  | { ok: false; error: string; fieldErrors?: Record<string, string>; requireCaptcha?: boolean; challengeExpired?: boolean };

export type GeneralCedulaResult =
  | { ok: true; sessionToken: string; expiresAt: string; destination: "form" | "home" }
  | { ok: false; error: string; fieldErrors?: Record<string, string>; requireCaptcha?: boolean; challengeExpired?: boolean };

const CHALLENGE_TOKEN_RE = /^[A-Za-z0-9_-]{32,128}$/;

function secondsLeft(sentAt: string | null | undefined): number {
  if (!sentAt) return 0;
  const elapsed = (Date.now() - new Date(sentAt).getTime()) / 1000;
  return Math.max(0, Math.ceil(settings.emailOtpCooldownSeconds - elapsed));
}

async function personSendAllowed(repo: RespondentRepo, personId: string, deps: GeneralDeps): Promise<boolean> {
  const limit = await repo.rateLimitHit(`general-otp:${personId}`, settings.emailOtpLimitPerPerson, settings.emailOtpWindowSeconds);
  if (!limit.allowed) {
    await repo.logSecurityEvent({ event_type: "GENERAL_RATE_LIMITED", ip_hash: deps.ipHash, detail: { scope: "email_otp", hits: limit.hits } });
  }
  return limit.allowed;
}

type StartTarget = { person: GeneralAuthRecord };

function tokenState(record: Pick<AccessTokenRecord, "expires_at" | "used_at" | "revoked_at">): LinkState {
  if (record.revoked_at) return "revoked";
  if (record.used_at) return "used";
  if (new Date(record.expires_at).getTime() <= Date.now()) return "expired";
  return "valid";
}

/** El enlace personal no se revoca ni se rota: solo se comprueba que siga vigente. */
async function readPersonalLink(repo: RespondentRepo, raw: string | undefined): Promise<{ ok: true; token: AccessTokenRecord | null } | GeneralFailure> {
  const value = raw?.trim() ?? "";
  if (!value) return { ok: true, token: null };
  if (!isAccessLinkToken(value)) return { ok: false, error: linkStateMessage("invalid") };
  const record = await repo.findAccessToken(sha256(normalizeAccessLinkToken(value)));
  if (!record) return { ok: false, error: linkStateMessage("invalid") };
  const state = tokenState(record);
  if (state !== "valid") return { ok: false, error: linkStateMessage(state) };
  return { ok: true, token: record };
}

/**
 * El correo elige a quién se le envía el código. No abre el formulario:
 * la cédula y el código dactilar se piden después de verificar el código.
 * Un correo que coincide con una ficha no se salta ese segundo paso.
 */
async function resolveEmailTarget(
  repo: RespondentRepo,
  email: string,
): Promise<{ ok: true; target: StartTarget } | GeneralFailure> {
  const emailOwner = await repo.findGeneralAuthByLoginEmail(email);
  if (emailOwner && !emailOwner.self_registered_at) {
    if (isLocked(emailOwner.general_locked_until)) return { ok: false, error: GENERIC_GENERAL_ERROR };
    return { ok: true, target: { person: emailOwner } };
  }
  const imported = await repo.findUnboundByOutreachEmail(email);
  if (imported.length === 1 && !isLocked(imported[0]!.general_locked_until)) return { ok: true, target: { person: imported[0]! } };
  return selfTarget(repo, email, emailOwner);
}

async function selfTarget(repo: RespondentRepo, email: string, emailOwner: GeneralAuthRecord | null): Promise<{ ok: true; target: StartTarget } | GeneralFailure> {
  if (emailOwner?.self_registered_at) return { ok: true, target: { person: emailOwner } };
  const pending = await repo.ensurePendingSelfAccount(email);
  if (!pending) return { ok: false, error: GENERIC_GENERAL_ERROR };
  if (isLocked(pending.general_locked_until)) return { ok: false, error: GENERIC_GENERAL_ERROR };
  return { ok: true, target: { person: pending } };
}

async function resolveTokenTarget(repo: RespondentRepo, token: AccessTokenRecord, email: string, deps: GeneralEmailDeps, requireCaptcha: boolean): Promise<{ ok: true; target: StartTarget } | GeneralFailure> {
  const person = await repo.getPerson(token.person_id);
  if (!person?.national_id_hash) return { ok: false, error: linkStateMessage("invalid") };
  const auth = await repo.findGeneralAuthByNationalIdHash(person.national_id_hash);
  if (!auth || auth.id !== token.person_id) return { ok: false, error: linkStateMessage("invalid") };
  if (isLocked(auth.general_locked_until)) {
    await repo.audit({ person_id: auth.id, actor_type: "respondent", action: "GENERAL_IDENTIFY_FAILED", metadata: { outcome: "locked" } });
    await repo.logSecurityEvent({ event_type: "GENERAL_LOCKED", ip_hash: deps.ipHash, detail: { outcome: "locked" } });
    return { ok: false, error: GENERIC_GENERAL_ERROR, requireCaptcha };
  }
  const bound = auth.login_email?.trim().toLowerCase();
  const outreach = auth.outreach_email?.trim().toLowerCase();
  if (bound && bound !== email) {
    await repo.audit({ person_id: auth.id, actor_type: "respondent", action: "GENERAL_IDENTIFY_FAILED", metadata: { outcome: "email_mismatch" } });
    await repo.logSecurityEvent({ event_type: "GENERAL_EMAIL_MISMATCH", ip_hash: deps.ipHash, detail: {} });
    return { ok: false, error: emailBoundError(maskEmail(bound)), fieldErrors: { email: "Usa el correo con el que ingresaste antes." } };
  }
  if (!bound && outreach && outreach !== email) {
    await repo.logSecurityEvent({ event_type: "GENERAL_EMAIL_MISMATCH", ip_hash: deps.ipHash, detail: { outcome: "outreach" } });
    return { ok: false, error: emailBoundError(maskEmail(outreach)), fieldErrors: { email: "Usa el correo al que te escribimos." } };
  }
  return { ok: true, target: { person: auth } };
}

/**
 * Paso 1: correo. Envía el código de acceso (6 a 10 dígitos).
 * La cédula no se pide aquí. Si llega un enlace personal vigente, el código sale para esa ficha
 * y el enlace no se marca como usado.
 */
export async function startGeneralEmailAccess(repo: RespondentRepo, rawInput: unknown, deps: GeneralEmailDeps): Promise<GeneralEmailStartResult> {
  const ipLimit = await limitIp(repo, deps);
  if (!ipLimit.allowed) return { ok: false, error: RATE_LIMIT_ERROR };

  const parsed = generalEmailIdentifySchema.safeParse(sanitizeDeep(rawInput));
  if (!parsed.success) {
    const fieldErrors = flattenIssues(parsed.error);
    if (fieldErrors.termsAccepted) return { ok: false, error: fieldErrors.termsAccepted, fieldErrors, requireCaptcha: needsCaptcha(deps, ipLimit.hits) };
    return { ok: false, error: "Revisa los campos marcados.", fieldErrors, requireCaptcha: needsCaptcha(deps, ipLimit.hits) };
  }
  const requireCaptcha = needsCaptcha(deps, ipLimit.hits);
  if (requireCaptcha) {
    const human = await deps.verifyCaptcha(parsed.data.captchaToken);
    if (!human) return { ok: false, error: "Confirma que no eres un robot para continuar.", requireCaptcha: true };
  }

  const link = await readPersonalLink(repo, parsed.data.accessToken);
  if (!link.ok) return link;
  const email = parsed.data.email;
  const resolved = link.token
    ? await resolveTokenTarget(repo, link.token, email, deps, requireCaptcha)
    : await resolveEmailTarget(repo, email);
  if (!resolved.ok) return resolved;
  const { person } = resolved.target;

  if (!(await personSendAllowed(repo, person.id, deps))) return { ok: false, error: EMAIL_SEND_LIMIT };

  const challengeToken = randomToken(32);
  const challengeHash = sha256(challengeToken);
  const sentAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + settings.generalChallengeMinutes * 60_000).toISOString();
  const started = await repo.beginGeneralChallenge(person.id, { purpose: "email", challengeHash, expiresAt, email, sentAt });
  if (!started) return { ok: false, error: GENERIC_GENERAL_ERROR };

  await repo.audit({
    person_id: person.id,
    actor_type: "respondent",
    action: "IDENTITY_TERMS_ACCEPTED",
    metadata: { accepted_at: sentAt, entry: link.token ? "personal_link" : "general" },
  });

  const sent = await deps.otp.send(email);
  if (!sent.ok) {
    await repo.logSecurityEvent({ event_type: "GENERAL_EMAIL_SEND_FAILED", ip_hash: deps.ipHash, detail: { reason: sent.reason } });
    return { ok: false, error: sent.reason === "rate_limited" ? EMAIL_SEND_LIMIT : EMAIL_SEND_FAILED };
  }
  await repo.audit({ person_id: person.id, actor_type: "respondent", action: "EMAIL_CODE_SENT", metadata: { entry: link.token ? "personal_link" : "general" } });
  return { ok: true, phase: "email", challengeToken, maskedEmail: maskEmail(email), resendAfterSeconds: settings.emailOtpCooldownSeconds };
}

/** Reenvía el código al mismo correo del reto, con espera mínima entre envíos. */
export async function resendGeneralEmailCode(repo: RespondentRepo, challengeToken: string | undefined, deps: GeneralEmailDeps): Promise<GeneralEmailResendResult> {
  const ipLimit = await limitIp(repo, deps);
  if (!ipLimit.allowed) return { ok: false, error: RATE_LIMIT_ERROR };
  if (!challengeToken || !CHALLENGE_TOKEN_RE.test(challengeToken)) return { ok: false, error: CHALLENGE_EXPIRED, challengeExpired: true };

  const challengeHash = sha256(challengeToken);
  const challenge = await repo.findGeneralChallenge(challengeHash);
  if (!challenge || challenge.purpose !== "email" || !challenge.pending_email || new Date(challenge.expires_at).getTime() <= Date.now()) {
    return { ok: false, error: CHALLENGE_EXPIRED, challengeExpired: true };
  }
  if (isLocked(challenge.general_locked_until)) return { ok: false, error: GENERIC_GENERAL_ERROR };

  const wait = secondsLeft(challenge.sent_at);
  if (wait > 0) return { ok: false, error: `Espera ${wait} segundos para pedir otro código.`, resendAfterSeconds: wait };
  if (!(await personSendAllowed(repo, challenge.person_id, deps))) return { ok: false, error: EMAIL_SEND_LIMIT };

  const sentAt = new Date().toISOString();
  if (!(await repo.touchGeneralChallengeSent(challenge.person_id, challengeHash, sentAt))) {
    return { ok: false, error: CHALLENGE_EXPIRED, challengeExpired: true };
  }
  const sent = await deps.otp.send(challenge.pending_email);
  if (!sent.ok) {
    await repo.logSecurityEvent({ event_type: "GENERAL_EMAIL_SEND_FAILED", ip_hash: deps.ipHash, detail: { reason: sent.reason } });
    return { ok: false, error: sent.reason === "rate_limited" ? EMAIL_SEND_LIMIT : EMAIL_SEND_FAILED, resendAfterSeconds: settings.emailOtpCooldownSeconds };
  }
  await repo.audit({ person_id: challenge.person_id, actor_type: "respondent", action: "EMAIL_CODE_SENT", metadata: { entry: "general", resend: true } });
  return { ok: true, maskedEmail: maskEmail(challenge.pending_email), resendAfterSeconds: settings.emailOtpCooldownSeconds };
}

/**
 * Paso 2: el código del correo. Si coincide, el reto queda abierto para la cédula.
 * No guarda el correo como verificado ni abre la sesión del formulario.
 */
export async function confirmGeneralEmailCode(
  repo: RespondentRepo,
  challengeToken: string | undefined,
  rawInput: unknown,
  deps: GeneralEmailDeps,
): Promise<GeneralEmailCodeResult> {
  const ipLimit = await limitIp(repo, deps);
  if (!ipLimit.allowed) return { ok: false, error: RATE_LIMIT_ERROR };
  if (!challengeToken || !CHALLENGE_TOKEN_RE.test(challengeToken)) return { ok: false, error: CHALLENGE_EXPIRED, challengeExpired: true };

  const parsed = generalEmailCodeSchema.safeParse(sanitizeDeep(rawInput));
  if (!parsed.success) return { ok: false, error: "Revisa los campos marcados.", fieldErrors: flattenIssues(parsed.error) };

  const challengeHash = sha256(challengeToken);
  const challenge = await repo.findGeneralChallenge(challengeHash);
  if (!challenge || challenge.purpose !== "email" || !challenge.pending_email || new Date(challenge.expires_at).getTime() <= Date.now()) {
    return { ok: false, error: CHALLENGE_EXPIRED, challengeExpired: true };
  }

  if (isLocked(challenge.general_locked_until)) {
    await repo.audit({ person_id: challenge.person_id, actor_type: "respondent", action: "GENERAL_IDENTIFY_FAILED", metadata: { outcome: "locked" } });
    await repo.logSecurityEvent({ event_type: "GENERAL_LOCKED", ip_hash: deps.ipHash, detail: { outcome: "locked" } });
    return { ok: false, error: GENERIC_GENERAL_ERROR };
  }

  const verified = await deps.otp.verify(challenge.pending_email, parsed.data.code);
  if (!verified.ok && verified.reason !== "invalid") {
    return { ok: false, error: verified.reason === "rate_limited" ? RATE_LIMIT_ERROR : EMAIL_SEND_FAILED };
  }
  if (!verified.ok || verified.email !== challenge.pending_email) {
    const failure = await repo.registerGeneralFailure(challenge.person_id, settings.generalLockThreshold, settings.generalLockMinutes);
    await repo.audit({
      person_id: challenge.person_id,
      actor_type: "respondent",
      action: "GENERAL_IDENTIFY_FAILED",
      metadata: { outcome: failure.locked ? "locked" : "email_code", attempt: failure.failed_attempts },
    });
    if (failure.locked) {
      await repo.logSecurityEvent({ event_type: "GENERAL_LOCKED", ip_hash: deps.ipHash, detail: { outcome: "locked" } });
      return { ok: false, error: GENERIC_GENERAL_ERROR };
    }
    await repo.logSecurityEvent({ event_type: "GENERAL_EMAIL_CODE_FAILED", ip_hash: deps.ipHash, detail: { outcome: "email_code" } });
    return { ok: false, error: EMAIL_CODE_MISMATCH, requireCaptcha: needsCaptcha(deps, ipLimit.hits) };
  }

  const marked = await repo.markEmailCodeVerified(challenge.person_id, challengeHash, verified.authUserId);
  if (!marked) return { ok: false, error: CHALLENGE_EXPIRED, challengeExpired: true };
  return { ok: true, phase: "cedula" };
}

async function failCedula(repo: RespondentRepo, personId: string, deps: GeneralDeps, requireCaptcha: boolean): Promise<GeneralFailure> {
  const failure = await repo.registerGeneralFailure(personId, settings.generalLockThreshold, settings.generalLockMinutes);
  await repo.audit({
    person_id: personId,
    actor_type: "respondent",
    action: "GENERAL_IDENTIFY_FAILED",
    metadata: { outcome: failure.locked ? "locked" : "cedula", attempt: failure.failed_attempts },
  });
  if (failure.locked) {
    await repo.logSecurityEvent({ event_type: "GENERAL_LOCKED", ip_hash: deps.ipHash, detail: { outcome: "locked" } });
  } else {
    await repo.logSecurityEvent({ event_type: "GENERAL_IDENTIFY_FAILED", ip_hash: deps.ipHash, detail: { outcome: "cedula" } });
  }
  return { ok: false, error: GENERIC_GENERAL_ERROR, requireCaptcha };
}

/** Primera vez: se guarda. Si ya había uno y no coincide, se rechaza. Vacío solo en un pasaporte. */
async function applyFingerprint(repo: RespondentRepo, personId: string, code: string, deps: GeneralDeps, requireCaptcha: boolean): Promise<GeneralFailure | null> {
  if (!code) return null;
  const claim = await repo.claimFingerprintCode(personId, keyedHash(code, "fingerprint_code"));
  if (claim === "claimed") {
    await repo.audit({ person_id: personId, actor_type: "respondent", action: "FINGERPRINT_CLAIMED", metadata: { entry: "general" } });
    return null;
  }
  if (claim === "matched") return null;
  return failFingerprint(repo, personId, deps, requireCaptcha);
}

async function openVerifiedSession(
  repo: RespondentRepo,
  personId: string,
  challenge: GeneralChallengeRecord,
  challengeHash: string,
  deps: GeneralEmailDeps,
  accessTokenId: string | null,
): Promise<GeneralCedulaResult> {
  const before = await repo.getPerson(personId);
  if (!before || !challenge.pending_email) return { ok: false, error: GENERIC_GENERAL_ERROR, challengeExpired: true };
  const isSelf = Boolean(before.self_registered_at);
  const firstVerification = !before.login_email;
  if (!isSelf) {
    await repo.releaseSelfAccount(challenge.pending_email, challenge.auth_user_id ?? null, personId);
  }
  const completed = await repo.completeGeneralChallenge(personId, challengeHash, "cedula", {
    email: challenge.pending_email,
    authUserId: challenge.auth_user_id ?? null,
  });
  if (!completed) {
    await repo.logSecurityEvent({ event_type: "GENERAL_EMAIL_LINK_REJECTED", ip_hash: deps.ipHash, detail: {} });
    return { ok: false, error: GENERIC_GENERAL_ERROR, challengeExpired: true };
  }
  await repo.audit({ person_id: personId, actor_type: "respondent", action: "EMAIL_VERIFIED", changed_fields: ["login_email"], metadata: { entry: accessTokenId ? "personal_link" : "general" } });
  if (isSelf && firstVerification) {
    await repo.audit({ person_id: personId, actor_type: "respondent", action: "ACCOUNT_CREATED", metadata: { entry: "general_email" } });
  }

  const person = await repo.getPerson(personId);
  if (!person) return { ok: false, error: GENERIC_GENERAL_ERROR };
  const sessionToken = randomToken(32);
  const expiresAt = new Date(Date.now() + RESPONDENT_SESSION_MINUTES * 60_000).toISOString();
  const continueForm = canContinueForm(person);
  const entryMethod: EntryMethod = accessTokenId ? "token" : "general";
  await repo.createRespondentSession({
    session_hash: sha256(sessionToken),
    person_id: person.id,
    access_token_id: accessTokenId,
    entry_method: entryMethod,
    expires_at: expiresAt,
    submitted_at: continueForm ? null : person.submitted_at,
  });
  if (continueForm) await repo.markStarted(person.id);
  await repo.audit({ person_id: person.id, actor_type: "respondent", action: "IDENTITY_VERIFIED", metadata: { entry: accessTokenId ? "personal_link" : "general_email" } });
  return { ok: true, sessionToken, expiresAt, destination: continueForm ? "form" : "home" };
}

/**
 * Paso 3: cédula y código dactilar obligatorios.
 * Si el correo ya estaba en una ficha, la cédula tiene que ser la de esa ficha.
 * El dactilar, si no había uno, se guarda. Si ya había uno y no coincide, se rechaza.
 * Un enlace personal de pasaporte no pide el código: ese documento no lo trae.
 */
export async function confirmGeneralCedula(
  repo: RespondentRepo,
  challengeToken: string | undefined,
  rawInput: unknown,
  deps: GeneralEmailDeps,
): Promise<GeneralCedulaResult> {
  const ipLimit = await limitIp(repo, deps);
  if (!ipLimit.allowed) return { ok: false, error: RATE_LIMIT_ERROR };
  if (!challengeToken || !CHALLENGE_TOKEN_RE.test(challengeToken)) return { ok: false, error: CHALLENGE_EXPIRED, challengeExpired: true };

  const clean = sanitizeDeep(rawInput);
  const bag = clean && typeof clean === "object" ? (clean as Record<string, unknown>) : {};
  const accessToken = typeof bag.accessToken === "string" ? bag.accessToken : "";
  const challengeHash = sha256(challengeToken);
  const challenge = await repo.findGeneralChallenge(challengeHash);
  if (!challenge || challenge.purpose !== "cedula" || !challenge.pending_email || new Date(challenge.expires_at).getTime() <= Date.now()) {
    return { ok: false, error: CHALLENGE_EXPIRED, challengeExpired: true };
  }
  if (isLocked(challenge.general_locked_until)) return { ok: false, error: GENERIC_GENERAL_ERROR };

  const link = await readPersonalLink(repo, accessToken);
  if (!link.ok) return { ...link, challengeExpired: false };
  const holder = await repo.getPerson(challenge.person_id);
  if (!holder) return { ok: false, error: CHALLENGE_EXPIRED, challengeExpired: true };
  const allowPassport = Boolean(link.token && link.token.person_id === challenge.person_id);
  const passportExempt = allowPassport && storedDocumentIsPassport(holder.national_id_encrypted);
  const parsed = (allowPassport ? personalLinkDocumentStepSchema(!passportExempt) : generalCedulaStepSchema).safeParse({
    cedula: bag.cedula ?? "",
    codigoDactilar: bag.codigoDactilar ?? "",
  });
  if (!parsed.success) return { ok: false, error: "Revisa los campos marcados.", fieldErrors: flattenIssues(parsed.error) };

  const requireCaptcha = needsCaptcha(deps, ipLimit.hits);
  const email = challenge.pending_email;
  const code = parsed.data.codigoDactilar;
  const cedulaHash = keyedHash(parsed.data.cedula, "national_id");
  const cedulaLimit = await repo.rateLimitHit(`general-cedula:${cedulaHash}`, settings.generalIdentifyLimitPerCedula, settings.generalIdentifyWindowSeconds);
  if (!cedulaLimit.allowed) {
    await repo.logSecurityEvent({ event_type: "GENERAL_RATE_LIMITED", ip_hash: deps.ipHash, detail: { scope: "cedula", hits: cedulaLimit.hits } });
    return { ok: false, error: RATE_LIMIT_ERROR };
  }

  let personId = holder.id;
  const preload = await repo.findPreloadedContactByEmail(email);
  const onImported = Boolean(holder.national_id_hash) && !holder.self_registered_at;
  if (onImported) {
    if (!holder.national_id_hash || !safeEqual(cedulaHash, holder.national_id_hash)) return failCedula(repo, holder.id, deps, requireCaptcha);
    const fingerprint = await applyFingerprint(repo, holder.id, code, deps, requireCaptcha);
    if (fingerprint) return fingerprint;
  } else {
    const imported = await repo.findGeneralAuthByNationalIdHash(cedulaHash);
    const bound = imported?.login_email?.trim().toLowerCase();
    const outreachMatches = imported?.outreach_email?.trim().toLowerCase() === email;
    const fingerprintMatches = Boolean(code && imported?.fingerprint_code_hash && safeEqual(keyedHash(code, "fingerprint_code"), imported.fingerprint_code_hash));
    if (imported && imported.id !== holder.id && code && imported.fingerprint_code_hash && !fingerprintMatches) {
      return failFingerprint(repo, imported.id, deps, requireCaptcha);
    }
    if (imported && imported.id !== holder.id && (bound === email || (!bound && (outreachMatches || fingerprintMatches)))) {
      if (isLocked(imported.general_locked_until)) return { ok: false, error: GENERIC_GENERAL_ERROR, requireCaptcha };
      if (code && imported.fingerprint_code_hash && !fingerprintMatches) return failFingerprint(repo, imported.id, deps, requireCaptcha);
      const moved = await repo.promoteEmailChallenge(holder.id, imported.id, challengeHash);
      if (!moved) return { ok: false, error: GENERIC_GENERAL_ERROR };
      const fingerprint = await applyFingerprint(repo, imported.id, code, deps, requireCaptcha);
      if (fingerprint) return fingerprint;
      personId = imported.id;
    } else if (imported && bound && bound !== email) {
      await repo.audit({ person_id: imported.id, actor_type: "respondent", action: "GENERAL_IDENTIFY_FAILED", metadata: { outcome: "email_mismatch" } });
      await repo.logSecurityEvent({ event_type: "GENERAL_EMAIL_MISMATCH", ip_hash: deps.ipHash, detail: {} });
      return { ok: false, error: emailBoundError(maskEmail(bound)), fieldErrors: { cedula: "Usa el correo con el que ingresaste antes." } };
    } else if (preload) {
      const bound = await repo.bindAllowlistedIdentity(holder.id, {
        nationalIdEncrypted: encrypt(parsed.data.cedula),
        nationalIdHash: cedulaHash,
        nationalIdLast2: parsed.data.cedula.slice(-2),
        firstNames: preload.firstNames,
        lastNames: preload.lastNames,
        phone: preload.phone,
      });
      if (!bound) return { ok: false, error: GENERIC_GENERAL_ERROR };
      const fingerprint = await applyFingerprint(repo, holder.id, code, deps, requireCaptcha);
      if (fingerprint) return fingerprint;
      await repo.audit({ person_id: holder.id, actor_type: "respondent", action: "ACCOUNT_LINKED", metadata: { entry: "allowlist" } });
    } else {
      const request: LinkRequest = {
        national_id_hash: cedulaHash,
        national_id_encrypted: encrypt(parsed.data.cedula),
        national_id_last2: parsed.data.cedula.slice(-2),
      };
      await repo.setLinkRequest(holder.id, request);
      await repo.audit({ person_id: holder.id, actor_type: "respondent", action: "ACCOUNT_LINK_REQUESTED", metadata: { entry: "general" } });
    }
  }

  const accessTokenId = link.token && link.token.person_id === personId ? link.token.id : null;
  const fresh = await repo.findGeneralChallenge(challengeHash);
  if (!fresh?.pending_email) return { ok: false, error: CHALLENGE_EXPIRED, challengeExpired: true };
  return openVerifiedSession(repo, personId, fresh, challengeHash, deps, accessTokenId);
}
