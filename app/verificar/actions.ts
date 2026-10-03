"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getRepo } from "@/lib/database";
import { getActivePrivacy } from "@/lib/privacy/active";
import { captchaEnabled, verifyCaptcha } from "@/lib/security/captcha";
import { cookieOptions, RESPONDENT_COOKIE, RESPONDENT_SESSION_MINUTES } from "@/lib/security/cookies";
import { clientIp, ipHash } from "@/lib/security/request";
import { sendConfirmationEmail } from "@/lib/services/email";
import { identify, openInsuredHome, resumeImportedPersonByCedula, submitResponse, type LinkState } from "@/lib/services/respondent";
import { endRespondentSession } from "@/lib/server/end-respondent-session";
import { readRespondentToken } from "@/lib/server/respondent-session";

export interface IdentifyState {
  error?: string;
  fieldError?: string;
  requireCaptcha?: boolean;
  linkState?: LinkState;
}

export async function identifyByCedulaAction(_prev: IdentifyState, formData: FormData): Promise<IdentifyState> {
  const repo = getRepo();
  const h = await headers();
  let sessionToken: string;
  try {
    const privacy = await getActivePrivacy(repo);
    if (privacy.readiness.blockPortal) return { error: "El portal no está habilitado todavía. Intenta más tarde." };
    const ip = clientIp(h);
    const result = await resumeImportedPersonByCedula(
      repo,
      {
        cedula: String(formData.get("cedula") ?? ""),
        captchaToken: formData.get("cf-turnstile-response") ? String(formData.get("cf-turnstile-response")) : undefined,
      },
      { ipHash: ipHash(h), captchaEnabled: captchaEnabled(), verifyCaptcha: (t) => verifyCaptcha(t, ip) },
    );
    if (!result.ok) {
      return { error: result.error, fieldError: result.fieldErrors?.cedula, requireCaptcha: result.requireCaptcha, linkState: result.linkState };
    }
    sessionToken = result.sessionToken;
  } catch {
    return { error: "El servicio no está disponible en este momento. Intenta nuevamente en unos minutos." };
  }
  (await cookies()).set(RESPONDENT_COOKIE(), sessionToken, cookieOptions(RESPONDENT_SESSION_MINUTES * 60));
  redirect("/verificar/formulario");
}

export async function identifyAction(_prev: IdentifyState, formData: FormData): Promise<IdentifyState> {
  const repo = getRepo();
  const h = await headers();
  let sessionToken: string;
  try {
    const privacy = await getActivePrivacy(repo);
    if (privacy.readiness.blockPortal) return { error: "El portal no está habilitado todavía. Intenta más tarde." };
    const ip = clientIp(h);
    const result = await identify(
      repo,
      {
        token: String(formData.get("token") ?? ""),
        cedula: String(formData.get("cedula") ?? ""),
        captchaToken: formData.get("cf-turnstile-response") ? String(formData.get("cf-turnstile-response")) : undefined,
      },
      { ipHash: ipHash(h), captchaEnabled: captchaEnabled(), verifyCaptcha: (t) => verifyCaptcha(t, ip) },
    );
    if (!result.ok) {
      return { error: result.error, fieldError: result.fieldErrors?.cedula, requireCaptcha: result.requireCaptcha, linkState: result.linkState };
    }
    sessionToken = result.sessionToken;
  } catch {
    return { error: "El servicio no está disponible en este momento. Intenta nuevamente en unos minutos." };
  }
  (await cookies()).set(RESPONDENT_COOKIE(), sessionToken, cookieOptions(RESPONDENT_SESSION_MINUTES * 60));
  redirect("/verificar/formulario");
}

export async function reopenAccountAction(_prev: IdentifyState, formData: FormData): Promise<IdentifyState> {
  const repo = getRepo();
  const h = await headers();
  let sessionToken: string;
  try {
    const privacy = await getActivePrivacy(repo);
    if (privacy.readiness.blockPortal) return { error: "El portal no está habilitado todavía. Intenta más tarde." };
    const ip = clientIp(h);
    const result = await openInsuredHome(
      repo,
      {
        token: String(formData.get("token") ?? ""),
        cedula: String(formData.get("cedula") ?? ""),
        captchaToken: formData.get("cf-turnstile-response") ? String(formData.get("cf-turnstile-response")) : undefined,
      },
      { ipHash: ipHash(h), captchaEnabled: captchaEnabled(), verifyCaptcha: (t) => verifyCaptcha(t, ip) },
    );
    if (!result.ok) {
      return { error: result.error, fieldError: result.fieldErrors?.cedula, requireCaptcha: result.requireCaptcha, linkState: result.linkState };
    }
    sessionToken = result.sessionToken;
  } catch {
    return { error: "El servicio no está disponible en este momento. Intenta nuevamente en unos minutos." };
  }
  (await cookies()).set(RESPONDENT_COOKIE(), sessionToken, cookieOptions(RESPONDENT_SESSION_MINUTES * 60));
  redirect("/mi-cuenta");
}

export type SubmitState = { ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string>; sessionExpired?: boolean };

export async function submitAction(values: unknown): Promise<SubmitState> {
  const repo = getRepo();
  try {
    const privacy = await getActivePrivacy(repo);
    const result = await submitResponse(repo, await readRespondentToken(), values, {
      activeNoticeVersion: privacy.version,
      consentTexts: privacy.consentTexts,
      retentionMonths: privacy.config.retention.months,
      portalBlocked: privacy.readiness.blockPortal,
    });
    if (!result.ok) return result;
    // El correo NO contiene datos bancarios ni personales sensibles.
    await sendConfirmationEmail(result.email, result.confirmationCode, privacy.config.supportContact);
    return { ok: true };
  } catch {
    return { ok: false, error: "No pudimos guardar tu información. Intenta nuevamente en unos minutos." };
  }
}

export async function finishAction(): Promise<void> {
  await endRespondentSession();
  redirect("/?fin=1");
}
