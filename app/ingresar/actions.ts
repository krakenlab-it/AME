"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getRepo } from "@/lib/database";
import { getActivePrivacy } from "@/lib/privacy/active";
import { captchaEnabled, verifyCaptcha } from "@/lib/security/captcha";
import { cookieOptions, GENERAL_CHALLENGE_COOKIE, RESPONDENT_COOKIE, RESPONDENT_SESSION_MINUTES } from "@/lib/security/cookies";
import { clientIp, ipHash } from "@/lib/security/request";
import { getEmailOtpProvider } from "@/lib/server/email-otp-provider";
import { confirmGeneralEmailCode, resendGeneralEmailCode, startGeneralEmailAccess } from "@/lib/services/general-email";
import { confirmGeneralTotp, startGeneralAccess } from "@/lib/services/general-link";
import { settings } from "@/lib/services/settings";

export interface GeneralAccessState {
  error?: string;
  fieldErrors?: Record<string, string>;
  requireCaptcha?: boolean;
  phase?: "identify" | "enroll" | "totp" | "email";
  /** Correo enmascarado al que se envió el código (j***@dominio.com). */
  maskedEmail?: string;
  /** Segundos que faltan para poder pedir otro código. */
  resendAfterSeconds?: number;
  /** Aviso no bloqueante (por ejemplo, «Te enviamos un código nuevo»). */
  info?: string;
  /** Cambia en cada envío para reiniciar la cuenta regresiva del botón de reenvío. */
  sentStamp?: number;
  qrDataUrl?: string;
  otpauthUrl?: string;
  manualKey?: string;
}

function deps(h: Headers) {
  const ip = clientIp(h);
  return { ipHash: ipHash(h), captchaEnabled: captchaEnabled(), verifyCaptcha: (token: string | undefined) => verifyCaptcha(token, ip) };
}

const UNAVAILABLE = "El servicio no está disponible en este momento. Intenta nuevamente en unos minutos.";

function emailDeps(h: Headers) {
  const otp = getEmailOtpProvider();
  return otp ? { ...deps(h), otp } : null;
}

export async function startGeneralAction(_prev: GeneralAccessState, formData: FormData): Promise<GeneralAccessState> {
  const repo = getRepo();
  const h = await headers();
  try {
    const privacy = await getActivePrivacy(repo);
    if (privacy.readiness.blockPortal) return { error: "El portal no está habilitado todavía. Intenta más tarde." };
    const captchaToken = formData.get("cf-turnstile-response") ? String(formData.get("cf-turnstile-response")) : undefined;
    if (settings.generalAuthMethod() === "email") {
      const d = emailDeps(h);
      if (!d) return { error: UNAVAILABLE };
      const result = await startGeneralEmailAccess(
        repo,
        {
          cedula: String(formData.get("cedula") ?? ""),
          codigoDactilar: String(formData.get("codigoDactilar") ?? ""),
          email: String(formData.get("email") ?? ""),
          captchaToken,
        },
        d,
      );
      if (!result.ok) return { error: result.error, fieldErrors: result.fieldErrors, requireCaptcha: result.requireCaptcha };
      (await cookies()).set(GENERAL_CHALLENGE_COOKIE(), result.challengeToken, cookieOptions(settings.generalChallengeMinutes * 60));
      return { phase: "email", maskedEmail: result.maskedEmail, resendAfterSeconds: result.resendAfterSeconds, sentStamp: Date.now() };
    }
    const result = await startGeneralAccess(
      repo,
      {
        cedula: String(formData.get("cedula") ?? ""),
        codigoDactilar: String(formData.get("codigoDactilar") ?? ""),
        captchaToken,
      },
      deps(h),
    );
    if (!result.ok) return { error: result.error, fieldErrors: result.fieldErrors, requireCaptcha: result.requireCaptcha };
    (await cookies()).set(GENERAL_CHALLENGE_COOKIE(), result.challengeToken, cookieOptions(settings.generalChallengeMinutes * 60));
    if (result.phase === "enroll") {
      return { phase: "enroll", qrDataUrl: result.qrDataUrl, otpauthUrl: result.otpauthUrl, manualKey: result.manualKey };
    }
    return { phase: "totp" };
  } catch {
    return { error: "El servicio no está disponible en este momento. Intenta nuevamente en unos minutos." };
  }
}

export async function confirmGeneralAction(_prev: GeneralAccessState, formData: FormData): Promise<GeneralAccessState> {
  const repo = getRepo();
  const h = await headers();
  const jar = await cookies();
  let destination: "form" | "home" = "form";
  let sessionToken = "";
  try {
    const privacy = await getActivePrivacy(repo);
    if (privacy.readiness.blockPortal) return { error: "El portal no está habilitado todavía. Intenta más tarde.", phase: formData.get("phase") === "email" ? "email" : "totp" };
    if (formData.get("phase") === "email") {
      const d = emailDeps(h);
      if (!d) return { error: UNAVAILABLE, phase: "email" };
      const result = await confirmGeneralEmailCode(repo, jar.get(GENERAL_CHALLENGE_COOKIE())?.value, { code: String(formData.get("code") ?? "") }, d);
      if (!result.ok) {
        return { error: result.error, fieldErrors: result.fieldErrors, requireCaptcha: result.requireCaptcha, phase: result.challengeExpired ? "identify" : "email" };
      }
      sessionToken = result.sessionToken;
      destination = result.destination;
    } else {
      const phase = formData.get("phase") === "enroll" ? "enroll" : "totp";
      const result = await confirmGeneralTotp(repo, jar.get(GENERAL_CHALLENGE_COOKIE())?.value, { code: String(formData.get("code") ?? "") }, deps(h));
      if (!result.ok) {
        return {
          error: result.error,
          fieldErrors: result.fieldErrors,
          requireCaptcha: result.requireCaptcha,
          phase: result.challengeExpired ? "identify" : phase,
        };
      }
      sessionToken = result.sessionToken;
      destination = result.destination;
    }
  } catch {
    return { error: UNAVAILABLE, phase: formData.get("phase") === "email" ? "email" : "totp" };
  }
  jar.set(RESPONDENT_COOKIE(), sessionToken, cookieOptions(RESPONDENT_SESSION_MINUTES * 60));
  jar.set(GENERAL_CHALLENGE_COOKIE(), "", cookieOptions(0));
  redirect(destination === "home" ? "/mi-cuenta" : "/verificar/formulario");
}

/** Reenvía el código al mismo correo. No cambia de paso salvo que el reto haya vencido. */
export async function resendGeneralAction(_prev: GeneralAccessState, _formData: FormData): Promise<GeneralAccessState> {
  void _formData;
  const repo = getRepo();
  const h = await headers();
  const jar = await cookies();
  try {
    const privacy = await getActivePrivacy(repo);
    if (privacy.readiness.blockPortal) return { error: "El portal no está habilitado todavía. Intenta más tarde.", phase: "email" };
    const d = emailDeps(h);
    if (!d) return { error: UNAVAILABLE, phase: "email" };
    const result = await resendGeneralEmailCode(repo, jar.get(GENERAL_CHALLENGE_COOKIE())?.value, d);
    if (!result.ok) {
      return { error: result.error, phase: result.challengeExpired ? "identify" : "email", resendAfterSeconds: result.resendAfterSeconds, sentStamp: Date.now() };
    }
    return { phase: "email", maskedEmail: result.maskedEmail, resendAfterSeconds: result.resendAfterSeconds, info: "Te enviamos un código nuevo. Usa el más reciente.", sentStamp: Date.now() };
  } catch {
    return { error: UNAVAILABLE, phase: "email" };
  }
}
