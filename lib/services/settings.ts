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
  generalIdentifyLimitPerIp: 10,
  generalIdentifyLimitPerCedula: 8,
  generalIdentifyWindowSeconds: 15 * 60,
  generalChallengeMinutes: 10,
  /** Solo "true" exige el código dactilar en /ingresar. Cualquier otro valor lo deja opcional. */
  requireFingerprintCode: () => process.env.AME_REQUIRE_FINGERPRINT_CODE === "true",
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
