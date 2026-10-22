import { encrypt, keyedHash, randomToken, safeEqual, sha256 } from "@/lib/encryption/crypto";
import type { GeneralAuthRecord, LinkRequest, RespondentRepo } from "@/lib/database/types";
import { RESPONDENT_SESSION_MINUTES } from "@/lib/security/cookies";
import { maskEmail } from "@/lib/security/masking";
import { GENERIC_GENERAL_ERROR } from "@/lib/validation/constants";
import { flattenIssues, generalEmailCodeSchema, generalEmailIdentifySchema } from "@/lib/validation/schemas";
import { sanitizeDeep } from "@/lib/validation/sanitize";
import type { EmailOtpProvider } from "./email-otp";
import { failFingerprint, isLocked, limitIp, needsCaptcha, RATE_LIMIT_ERROR, type GeneralDeps, type GeneralFailure } from "./general-link";
import { canContinueForm } from "./insured-home";
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

export type GeneralEmailConfirmResult =
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

type StartTarget = { person: GeneralAuthRecord; linkRequest?: LinkRequest | null };

const FINGERPRINT_REQUIRED = "Escribe el código dactilar de tu cédula.";

/**
 * Decide a quién se le abre el reto. Nunca cambia el correo de una cédula que ya ingresó (KAN-148)
 * y nunca asigna una cédula a una cuenta solo porque alguien la escribió: el vínculo automático
 * exige que el correo coincida con el importado (outreach_email) o el código dactilar ya cargado.
 * Si no, la cuenta queda propia (sin cédula) y la cédula escrita queda como solicitud para el panel.
 */
async function resolveEmailTarget(
  repo: RespondentRepo,
  data: { email: string; cedula?: string; codigoDactilar: string },
  deps: GeneralEmailDeps,
  requireCaptcha: boolean,
): Promise<{ ok: true; target: StartTarget } | GeneralFailure> {
  const { email } = data;
  const code = data.codigoDactilar;
  const emailOwner = await repo.findGeneralAuthByLoginEmail(email);

  if (data.cedula) {
    if (settings.requireFingerprintCode() && !code) {
      return { ok: false, error: "Revisa los campos marcados.", fieldErrors: { codigoDactilar: FINGERPRINT_REQUIRED }, requireCaptcha };
    }
    const cedulaHash = keyedHash(data.cedula, "national_id");
    const cedulaLimit = await repo.rateLimitHit(`general-cedula:${cedulaHash}`, settings.generalIdentifyLimitPerCedula, settings.generalIdentifyWindowSeconds);
    if (!cedulaLimit.allowed) {
      await repo.logSecurityEvent({ event_type: "GENERAL_RATE_LIMITED", ip_hash: deps.ipHash, detail: { scope: "cedula", hits: cedulaLimit.hits } });
      return { ok: false, error: RATE_LIMIT_ERROR };
    }
    const person = await repo.findGeneralAuthByNationalIdHash(cedulaHash);
    if (person) {
      if (isLocked(person.general_locked_until)) {
        await repo.audit({ person_id: person.id, actor_type: "respondent", action: "GENERAL_IDENTIFY_FAILED", metadata: { outcome: "locked" } });
        await repo.logSecurityEvent({ event_type: "GENERAL_LOCKED", ip_hash: deps.ipHash, detail: { outcome: "locked" } });
        return { ok: false, error: GENERIC_GENERAL_ERROR, requireCaptcha };
      }
      // KAN-148: la cédula queda atada al primer correo verificado.
      const bound = person.login_email?.trim().toLowerCase();
      if (bound && bound !== email) {
        await repo.audit({ person_id: person.id, actor_type: "respondent", action: "GENERAL_IDENTIFY_FAILED", metadata: { outcome: "email_mismatch" } });
        await repo.logSecurityEvent({ event_type: "GENERAL_EMAIL_MISMATCH", ip_hash: deps.ipHash, detail: {} });
        return { ok: false, error: emailBoundError(maskEmail(bound)), fieldErrors: { email: "Usa el correo con el que ingresaste antes." } };
      }
      // Un código dactilar escrito y distinto del cargado siempre cuenta como intento fallido.
      const fingerprintMatches = Boolean(code && person.fingerprint_code_hash && safeEqual(keyedHash(code, "fingerprint_code"), person.fingerprint_code_hash));
      if (code && person.fingerprint_code_hash && !fingerprintMatches) return failFingerprint(repo, person.id, deps, requireCaptcha);
      if (bound) return { ok: true, target: { person } };
      if (emailOwner && !emailOwner.self_registered_at) {
        // El correo ya es el de otra cédula: no se mezcla.
        await repo.logSecurityEvent({ event_type: "GENERAL_EMAIL_MISMATCH", ip_hash: deps.ipHash, detail: { outcome: "email_taken" } });
        return { ok: false, error: GENERIC_GENERAL_ERROR, requireCaptcha };
      }
      const outreachMatches = person.outreach_email?.trim().toLowerCase() === email;
      if (outreachMatches || fingerprintMatches) return { ok: true, target: { person } };
    }
    // Cédula sin vínculo automático (o que no está en la base): misma respuesta, queda como solicitud.
    return selfTarget(repo, email, emailOwner, { national_id_hash: cedulaHash, national_id_encrypted: encrypt(data.cedula), national_id_last2: data.cedula.slice(-2) });
  }

  if (emailOwner && !emailOwner.self_registered_at) return { ok: true, target: { person: emailOwner } };
  // Vínculo automático: una sola persona importada con este correo y sin correo de ingreso.
  // (También si ya había una cuenta propia con este correo: se vincula al confirmar el código.)
  const imported = await repo.findUnboundByOutreachEmail(email);
  if (imported.length === 1 && !isLocked(imported[0]!.general_locked_until)) return { ok: true, target: { person: imported[0]! } };
  // Dos o más personas importadas con el mismo correo: lo resuelve el panel.
  return selfTarget(repo, email, emailOwner, null);
}

async function selfTarget(repo: RespondentRepo, email: string, emailOwner: GeneralAuthRecord | null, linkRequest: LinkRequest | null): Promise<{ ok: true; target: StartTarget } | GeneralFailure> {
  // Una cuenta propia ya verificada solo cambia su solicitud desde una sesión iniciada (no desde aquí):
  // así nadie que conozca el correo ajeno le cambia la cédula pedida.
  if (emailOwner?.self_registered_at) return { ok: true, target: { person: emailOwner } };
  const pending = await repo.ensurePendingSelfAccount(email);
  if (!pending) return { ok: false, error: GENERIC_GENERAL_ERROR };
  if (isLocked(pending.general_locked_until)) return { ok: false, error: GENERIC_GENERAL_ERROR };
  return { ok: true, target: { person: pending, linkRequest } };
}

/**
 * Paso 1: correo (obligatorio), cédula y código dactilar (opcionales). Envía el código de acceso
 * (6 a 10 dígitos). Si el correo no corresponde a nadie de la base, la cuenta queda propia, sin cédula.
 * El correo no se registra en la auditoría.
 */
export async function startGeneralEmailAccess(repo: RespondentRepo, rawInput: unknown, deps: GeneralEmailDeps): Promise<GeneralEmailStartResult> {
  const ipLimit = await limitIp(repo, deps);
  if (!ipLimit.allowed) return { ok: false, error: RATE_LIMIT_ERROR };

  const parsed = generalEmailIdentifySchema.safeParse(sanitizeDeep(rawInput));
  if (!parsed.success) {
    return { ok: false, error: "Revisa los campos marcados.", fieldErrors: flattenIssues(parsed.error), requireCaptcha: needsCaptcha(deps, ipLimit.hits) };
  }
  const requireCaptcha = needsCaptcha(deps, ipLimit.hits);
  if (requireCaptcha) {
    const human = await deps.verifyCaptcha(parsed.data.captchaToken);
    if (!human) return { ok: false, error: "Confirma que no eres un robot para continuar.", requireCaptcha: true };
  }
  const email = parsed.data.email;
  const resolved = await resolveEmailTarget(repo, { email, cedula: parsed.data.cedula, codigoDactilar: parsed.data.codigoDactilar }, deps, requireCaptcha);
  if (!resolved.ok) return resolved;
  const { person, linkRequest } = resolved.target;

  if (!(await personSendAllowed(repo, person.id, deps))) return { ok: false, error: EMAIL_SEND_LIMIT };

  const challengeToken = randomToken(32);
  const challengeHash = sha256(challengeToken);
  const sentAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + settings.generalChallengeMinutes * 60_000).toISOString();
  const started = await repo.beginGeneralChallenge(person.id, { purpose: "email", challengeHash, expiresAt, email, sentAt });
  if (!started) return { ok: false, error: GENERIC_GENERAL_ERROR };
  if (linkRequest !== undefined) {
    // Cuenta propia sin confirmar: la solicitud es la del último intento (o ninguna).
    await repo.setLinkRequest(person.id, linkRequest);
    if (linkRequest) await repo.audit({ person_id: person.id, actor_type: "respondent", action: "ACCOUNT_LINK_REQUESTED", metadata: { entry: "general" } });
  }

  const sent = await deps.otp.send(email);
  if (!sent.ok) {
    await repo.logSecurityEvent({ event_type: "GENERAL_EMAIL_SEND_FAILED", ip_hash: deps.ipHash, detail: { reason: sent.reason } });
    return { ok: false, error: sent.reason === "rate_limited" ? EMAIL_SEND_LIMIT : EMAIL_SEND_FAILED };
  }
  await repo.audit({ person_id: person.id, actor_type: "respondent", action: "EMAIL_CODE_SENT", metadata: { entry: "general" } });
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
 * Paso 2: el código del correo. Si es correcto, guarda el correo verificado en la ficha
 * (rellena el formulario), vincula el usuario de Supabase Auth con la cédula y abre la sesión del titular.
 */
export async function confirmGeneralEmailCode(
  repo: RespondentRepo,
  challengeToken: string | undefined,
  rawInput: unknown,
  deps: GeneralEmailDeps,
): Promise<GeneralEmailConfirmResult> {
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

  // Bloqueado: no se gasta el código en Supabase.
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

  const before = await repo.getPerson(challenge.person_id);
  if (!before) return { ok: false, error: GENERIC_GENERAL_ERROR, challengeExpired: true };
  const isSelf = Boolean(before.self_registered_at);
  const firstVerification = !before.login_email;
  if (!isSelf) {
    // El correo pasa a la persona importada: la cuenta propia de ese correo (si había) se borra antes,
    // porque el usuario de Auth es único. No es atómico con el paso siguiente (ver BRIEF).
    await repo.releaseSelfAccount(challenge.pending_email, verified.authUserId ?? null, challenge.person_id);
  }
  const completed = await repo.completeGeneralChallenge(challenge.person_id, challengeHash, "email", {
    email: challenge.pending_email,
    authUserId: verified.authUserId,
  });
  if (!completed) {
    // El reto venció en paralelo, o ese correo ya quedó vinculado a otra cédula.
    await repo.logSecurityEvent({ event_type: "GENERAL_EMAIL_LINK_REJECTED", ip_hash: deps.ipHash, detail: {} });
    return { ok: false, error: GENERIC_GENERAL_ERROR, challengeExpired: true };
  }
  await repo.audit({ person_id: challenge.person_id, actor_type: "respondent", action: "EMAIL_VERIFIED", changed_fields: ["login_email"], metadata: { entry: "general" } });
  if (isSelf && firstVerification) {
    await repo.audit({ person_id: challenge.person_id, actor_type: "respondent", action: "ACCOUNT_CREATED", metadata: { entry: "general_email" } });
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
  await repo.audit({ person_id: person.id, actor_type: "respondent", action: "IDENTITY_VERIFIED", metadata: { entry: "general_email" } });
  return { ok: true, sessionToken, expiresAt, destination: continueForm ? "form" : "home" };
}
