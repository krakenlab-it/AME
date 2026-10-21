import { randomToken, sha256 } from "@/lib/encryption/crypto";
import type { RespondentRepo } from "@/lib/database/types";
import { RESPONDENT_SESSION_MINUTES } from "@/lib/security/cookies";
import { maskEmail } from "@/lib/security/masking";
import { GENERIC_GENERAL_ERROR } from "@/lib/validation/constants";
import { flattenIssues, generalEmailCodeSchema, generalEmailIdentifySchema } from "@/lib/validation/schemas";
import { sanitizeDeep } from "@/lib/validation/sanitize";
import type { EmailOtpProvider } from "./email-otp";
import { CHALLENGE_EXPIRED, isLocked, limitIp, needsCaptcha, RATE_LIMIT_ERROR, resolveGeneralPerson, type GeneralDeps } from "./general-link";
import { canContinueForm } from "./insured-home";
import { settings } from "./settings";

export const EMAIL_CODE_MISMATCH = "El código no es correcto o ya venció. Revisa el último correo que te enviamos.";
export const EMAIL_SEND_FAILED = "No pudimos enviar el código en este momento. Intenta nuevamente en unos minutos.";
export const EMAIL_SEND_LIMIT = "Ya enviamos varios códigos a este correo. Espera unos minutos antes de pedir otro.";

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

/**
 * Paso 1: cédula + correo (+ código dactilar opcional). Si la cédula está en la base,
 * guarda el reto con el correo y envía el código de 6 números. El correo no se registra en la auditoría.
 */
export async function startGeneralEmailAccess(repo: RespondentRepo, rawInput: unknown, deps: GeneralEmailDeps): Promise<GeneralEmailStartResult> {
  const ipLimit = await limitIp(repo, deps);
  if (!ipLimit.allowed) return { ok: false, error: RATE_LIMIT_ERROR };

  const parsed = generalEmailIdentifySchema.safeParse(sanitizeDeep(rawInput));
  if (!parsed.success) {
    return { ok: false, error: "Revisa los campos marcados.", fieldErrors: flattenIssues(parsed.error), requireCaptcha: needsCaptcha(deps, ipLimit.hits) };
  }
  const resolved = await resolveGeneralPerson(repo, parsed.data, deps, ipLimit.hits);
  if (!resolved.ok) return resolved;
  const { person } = resolved;
  const email = parsed.data.email;

  if (!(await personSendAllowed(repo, person.id, deps))) return { ok: false, error: EMAIL_SEND_LIMIT };

  const challengeToken = randomToken(32);
  const challengeHash = sha256(challengeToken);
  const sentAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + settings.generalChallengeMinutes * 60_000).toISOString();
  const started = await repo.beginGeneralChallenge(person.id, { purpose: "email", challengeHash, expiresAt, email, sentAt });
  if (!started) return { ok: false, error: GENERIC_GENERAL_ERROR };

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
