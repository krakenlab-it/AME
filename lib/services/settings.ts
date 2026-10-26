import { previewSandboxPublicBaseUrl } from "@/lib/demo-mode";

/** Parámetros operativos (con valores por defecto seguros). */
export const settings = {
  tokenTtlDays: () => clampInt(process.env.TOKEN_TTL_DAYS, 30, 1, 180),
  tokenLockThreshold: 5,
  identifyLimitPerIp: 10,
  identifyWindowSeconds: 15 * 60,
  captchaAfterAttempts: 3,
  generalLockThreshold: 5,
  generalLockMinutes: 30,
  /** 10 por IP en producción. La suite de navegador sale de una sola IP y recorre el ingreso varias veces. */
  generalIdentifyLimitPerIp: process.env.PORTAL_E2E === "true" && !process.env.VERCEL ? 100 : 10,
  generalIdentifyLimitPerCedula: 8,
  generalIdentifyWindowSeconds: 15 * 60,
  generalChallengeMinutes: 10,
  /**
   * Cómo se confirma la identidad en /ingresar después de la cédula.
   * "email" (por defecto): código de acceso por correo (6 a 10 dígitos) (Supabase Auth). "totp": aplicación autenticadora (flujo anterior).
   */
  generalAuthMethod: (): "email" | "totp" => (process.env.AME_GENERAL_AUTH_METHOD === "totp" ? "totp" : "email"),
  /** Espera mínima entre dos envíos del código. Supabase exige 60 s por usuario. */
  emailOtpCooldownSeconds: 60,
  /** Envíos de código por persona por hora (además del límite de Supabase). */
  emailOtpLimitPerPerson: process.env.PORTAL_E2E === "true" && !process.env.VERCEL ? 30 : 5,
  emailOtpWindowSeconds: 60 * 60,
  adminLoginLimitPerIp: 10,
  adminLoginLimitPerEmail: 5,
  adminLockMinutes: 15,
  adminMaxFailedLogins: 5,
  exportLimitPerHour: 20,
  baseUrl: () => (previewSandboxPublicBaseUrl() ?? process.env.APP_BASE_URL ?? "http://localhost:3000").replace(/\/$/, ""),
};

function clampInt(raw: string | undefined, fallback: number, min: number, max: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.round(n), min), max);
}
