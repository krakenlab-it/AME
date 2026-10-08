"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getRepo } from "@/lib/database";
import { getActivePrivacy } from "@/lib/privacy/active";
import { captchaEnabled, verifyCaptcha } from "@/lib/security/captcha";
import { cookieOptions, GENERAL_CHALLENGE_COOKIE, RESPONDENT_COOKIE, RESPONDENT_SESSION_MINUTES } from "@/lib/security/cookies";
import { clientIp, ipHash } from "@/lib/security/request";
import { confirmGeneralTotp, startGeneralAccess } from "@/lib/services/general-link";
import { settings } from "@/lib/services/settings";

export interface GeneralAccessState {
  error?: string;
  fieldErrors?: Record<string, string>;
  requireCaptcha?: boolean;
  phase?: "identify" | "enroll" | "totp";
  qrDataUrl?: string;
  otpauthUrl?: string;
  manualKey?: string;
}

function deps(h: Headers) {
  const ip = clientIp(h);
  return { ipHash: ipHash(h), captchaEnabled: captchaEnabled(), verifyCaptcha: (token: string | undefined) => verifyCaptcha(token, ip) };
}

export async function startGeneralAction(_prev: GeneralAccessState, formData: FormData): Promise<GeneralAccessState> {
  const repo = getRepo();
  const h = await headers();
  try {
    const privacy = await getActivePrivacy(repo);
    if (privacy.readiness.blockPortal) return { error: "El portal no está habilitado todavía. Intenta más tarde." };
    const result = await startGeneralAccess(
      repo,
      {
        cedula: String(formData.get("cedula") ?? ""),
        codigoDactilar: String(formData.get("codigoDactilar") ?? ""),
        captchaToken: formData.get("cf-turnstile-response") ? String(formData.get("cf-turnstile-response")) : undefined,
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
    if (privacy.readiness.blockPortal) return { error: "El portal no está habilitado todavía. Intenta más tarde.", phase: "totp" };
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
  } catch {
    return { error: "El servicio no está disponible en este momento. Intenta nuevamente en unos minutos.", phase: "totp" };
  }
  jar.set(RESPONDENT_COOKIE(), sessionToken, cookieOptions(RESPONDENT_SESSION_MINUTES * 60));
  jar.set(GENERAL_CHALLENGE_COOKIE(), "", cookieOptions(0));
  redirect(destination === "home" ? "/mi-cuenta" : "/verificar/formulario");
}
