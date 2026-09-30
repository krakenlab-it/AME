import { deployStage } from "@/lib/privacy/readiness";

const secure = () => deployStage() !== "development" || process.env.FORCE_SECURE_COOKIES === "true";

/** Prefijo __Host- (requiere HTTPS) fuera de desarrollo: impide que subdominios sobrescriban la cookie. */
export const RESPONDENT_COOKIE = () => (secure() ? "__Host-ame_rs" : "ame_rs");
export const ADMIN_COOKIE = () => (secure() ? "__Host-ame_adm" : "ame_adm");

export const RESPONDENT_SESSION_MINUTES = 30;
export const ADMIN_IDLE_MINUTES = 30;
export const ADMIN_ABSOLUTE_HOURS = 8;

export function cookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: secure(),
    sameSite: "strict" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}
